import { day, minute, parseTs } from "../clock/clock.ts";
import { hashSeed, mulberry32 } from "../clock/random.ts";
import { type CreatureReading, creatureReading } from "../creature/semantic.ts";
import { isWorkshopFamily, type WorkshopFamily } from "../place/architecture.ts";
import { districtCapacity } from "../place/settlement.ts";
import { type Place, parcelSlot, placeSlots, slotOf } from "../pose/pose.ts";
import type { IndexedFrame } from "../skins/atlas.ts";
import {
  dim,
  fog,
  groundBase,
  groundHighlight,
  groundLight,
  groundShadow,
} from "../skins/legend.ts";
import * as tiles from "../skins/world/tiles.ts";
import type { GardenPlanting } from "../skins/world/workshops/gardens.ts";
import { workshopDesign } from "../skins/world/workshops/index.ts";
import { ringingTheBell } from "../world/bell.ts";
import { type Sky, skyAt } from "../world/sky.ts";
import {
  type Creature as CreatureOnTheStead,
  crateOf,
  type Gate,
  gateOpen,
  type HabitatState,
  type Landmark,
  type Mill,
  type Parcel,
  type Slug,
  threadsOf,
} from "../world/types.ts";
import { type Blit, blitInto } from "./raster.ts";
import { workshopFrame } from "./workshop.ts";

export const tileScale = 2;
export const sceneHeight = 72;
export const groundY = 64;
export const groundDepth = 4;
export const sceneMargin = 4;
export const buildingGap = 8;
export const benchYard = 52;
export const laneWidth = 14 * tileScale;
export const minimumWidth = 240;
export const lanternAfterWalkMs = 5 * minute;
export const treeSeasonDays = 90;
export const sailDriftMs = 1000;
export const sailQuickMs = 160;
export const districtMillCapacity = 2;
export const districtParcelCapacity = 4;

export type SlotAnchors = readonly number[];

export type SceneTarget =
  | { readonly kind: "porch" }
  | { readonly kind: "storehouse" }
  | { readonly kind: "workshop"; readonly creature: Slug }
  | { readonly kind: "parcel"; readonly parcel: string }
  | { readonly kind: "mill"; readonly mill: string };

export interface Hotspot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly target: SceneTarget;
}

export interface SteadScene {
  readonly width: number;
  readonly height: number;
  readonly groundY: number;
  readonly sky: Sky;
  readonly bitmap: IndexedFrame;
  readonly anchors: Readonly<Record<Slug, SlotAnchors>>;
  readonly sharedAnchors: SlotAnchors;
  readonly hotspots: readonly Hotspot[];
  readonly readings: Readonly<Record<Slug, CreatureReading>>;
  readonly infrastructure?: SceneInfrastructure | undefined;
}

export interface SceneInfrastructure {
  readonly storehouseWings: number;
  readonly shownStorehouseWings: number;
  readonly storehouseShelves: number;
  readonly totalMills: number;
  readonly shownMills: number;
  readonly busyMills: number;
  readonly loadedMills: number;
  readonly totalParcels: number;
  readonly shownParcels: number;
}

export interface SceneOptions {
  readonly seed?: number | undefined;
  readonly southern?: boolean | undefined;
  readonly courtSlugs?: readonly string[] | undefined;
  readonly workshops?: Readonly<Record<string, WorkshopFamily>> | undefined;
  readonly gardens?: Readonly<Record<string, GardenPlanting>> | undefined;
}

export function composeStead(
  state: HabitatState,
  now: number,
  options: SceneOptions = {},
): SteadScene {
  const sky = skyAt(now, state.house.offsetMinutes, options.southern);
  const creatures = sceneCreatures(state, options.courtSlugs);
  const readings = Object.fromEntries(
    creatures.map((creature) => [creature.slug, creatureReading(state, creature.slug, now)]),
  ) as Record<Slug, CreatureReading>;
  const layout = new Layout(state, now, sky, readings, options);
  layout.houseParcel(creatures);
  layout.otherParcels(creatures);
  return layout.finish();
}

export function inOrderOfRaising(creatures: readonly CreatureOnTheStead[]): CreatureOnTheStead[] {
  return [...creatures].sort(
    (a, b) =>
      a.workshop.raisedAt.localeCompare(b.workshop.raisedAt) || a.slug.localeCompare(b.slug),
  );
}

export function xOfSlot(anchors: SlotAnchors, slot: number): number {
  const clamped = Math.min(Math.max(0, slot), anchors.length - 1);
  const low = Math.floor(clamped);
  const high = Math.min(anchors.length - 1, low + 1);
  const from = anchors[low] ?? 0;
  const to = anchors[high] ?? from;
  return from + (to - from) * (clamped - low);
}

export function slotOfX(anchors: SlotAnchors, x: number): number {
  const ordered = anchors.map((px, slot) => ({ px, slot })).sort((a, b) => a.px - b.px);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (x <= first.px) return first.slot;
  if (x >= last.px) return last.slot;
  for (let at = 1; at < ordered.length; at += 1) {
    const left = ordered[at - 1] as { px: number; slot: number };
    const right = ordered[at] as { px: number; slot: number };
    if (x <= right.px) {
      const share = right.px === left.px ? 0 : (x - left.px) / (right.px - left.px);
      return left.slot + (right.slot - left.slot) * share;
    }
  }
  return last.slot;
}

export function anchorsFor(scene: SteadScene, creature: Slug): SlotAnchors {
  return scene.anchors[creature] ?? scene.sharedAnchors;
}

export function hotspotAt(scene: SteadScene, x: number, y: number): Hotspot | undefined {
  return scene.hotspots.find(
    (spot) => x >= spot.x && x < spot.x + spot.width && y >= spot.y && y < spot.y + spot.height,
  );
}

export function placeX(scene: SteadScene, creature: Slug, place: Place): number {
  return xOfSlot(anchorsFor(scene, creature), slotOf(place));
}

export function slotSpan(anchors: SlotAnchors): number {
  const span = Math.max(...anchors) - Math.min(...anchors);
  return span / Math.max(1, anchors.length - 1);
}

export function grown(tile: IndexedFrame): IndexedFrame {
  const known = grownTiles.get(tile);
  if (known !== undefined) return known;
  const width = tile.width * tileScale;
  const height = tile.height * tileScale;
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = Math.floor(y / tileScale) * tile.width;
    for (let x = 0; x < width; x += 1) {
      indices[y * width + x] = tile.indices[sourceRow + Math.floor(x / tileScale)] ?? 0;
    }
  }
  const result = { width, height, indices };
  grownTiles.set(tile, result);
  return result;
}

export function threadsLive(state: HabitatState, creature: Slug): number {
  return threadsOf(state, creature).filter((thread) => thread.turn !== undefined).length;
}

const grownTiles = new WeakMap<IndexedFrame, IndexedFrame>();

function sceneCreatures(
  state: HabitatState,
  courtSlugs: readonly string[] | undefined,
): readonly CreatureOnTheStead[] {
  if (courtSlugs === undefined) return inOrderOfRaising(Object.values(state.creatures));
  const selected = [...new Set(courtSlugs)];
  if (selected.length > districtCapacity)
    throw new RangeError(`A district scene holds up to ${districtCapacity} court addresses.`);
  return selected.flatMap((slug) => {
    const creature = Object.hasOwn(state.creatures, slug) ? state.creatures[slug] : undefined;
    return creature === undefined ? [] : [creature];
  });
}

function districtMills(
  state: HabitatState,
  mills: readonly Mill[],
  slugs: readonly string[],
): readonly Mill[] {
  const house = Object.values(state.parcels).find((parcel) => parcel.roles.includes("house"))?.id;
  const selected = new Set(slugs.map((slug) => state.creatures[slug]?.workshop.parcel));
  const visible = new Set(
    Object.values(state.parcels)
      .filter((parcel) => parcel.id !== house && selected.has(parcel.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, districtParcelCapacity)
      .map((parcel) => parcel.id),
  );
  return mills
    .filter(
      (mill) =>
        mill.parcel === house ||
        visible.has(mill.parcel) ||
        (house === undefined && !Object.hasOwn(state.parcels, mill.parcel)),
    )
    .sort(
      (a, b) =>
        Number(b.busy) - Number(a.busy) ||
        Number(b.loaded.length > 0) - Number(a.loaded.length > 0) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, districtMillCapacity);
}

function familyAt(
  workshops: Readonly<Record<string, WorkshopFamily>> | undefined,
  slug: string,
): WorkshopFamily | undefined {
  if (workshops === undefined || !Object.hasOwn(workshops, slug)) return undefined;
  const family = workshops[slug];
  return isWorkshopFamily(family) ? family : undefined;
}

interface Lanes {
  readonly from: number;
  readonly to: number;
}

class Layout {
  private readonly state: HabitatState;
  private readonly now: number;
  private readonly sky: Sky;
  private readonly readings: Readonly<Record<Slug, CreatureReading>>;
  private readonly seed: number;
  private readonly options: SceneOptions;
  private readonly allMills: readonly Mill[];
  private readonly selectedMills: readonly Mill[];
  private readonly layers: Blit[] = [];
  private readonly hotspots: Hotspot[] = [];
  private readonly lanes: Lanes[] = [];
  private readonly shared: number[] = Array.from({ length: parcelSlot + 1 }, () => 0);
  private readonly perCreature = new Map<Slug, number[]>();
  private readonly foggedSpans: Lanes[] = [];
  private x = sceneMargin;
  private shownMills = 0;
  private shownStorehouseWings = 0;
  private totalParcels = 0;
  private shownParcels = 0;

  constructor(
    state: HabitatState,
    now: number,
    sky: Sky,
    readings: Readonly<Record<Slug, CreatureReading>>,
    options: SceneOptions,
  ) {
    this.state = state;
    this.now = now;
    this.sky = sky;
    this.readings = readings;
    this.seed = options.seed ?? 0;
    this.options = options;
    this.allMills = Object.values(state.mills);
    this.selectedMills =
      options.courtSlugs === undefined
        ? this.allMills
        : districtMills(state, this.allMills, Object.keys(readings));
  }

  houseParcel(creatures: readonly CreatureOnTheStead[]): void {
    this.tree();
    this.fence();
    this.storehouse();
    this.house();
    for (const creature of creatures) this.workshop(creature);
    this.hay();
    for (const mill of this.millsOn(this.houseParcelId())) this.mill(mill, false);
    if (this.shared[placeSlots.mill] === 0) this.shared[placeSlots.mill] = this.x;
    this.gate();
  }

  otherParcels(creatures: readonly CreatureOnTheStead[]): void {
    const house = this.houseParcelId();
    const selected = new Set(creatures.map((creature) => creature.workshop.parcel));
    const parcels = Object.values(this.state.parcels).filter((parcel) => parcel.id !== house);
    this.totalParcels = parcels.length;
    const relevant = parcels
      .filter((parcel) => this.options.courtSlugs === undefined || selected.has(parcel.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    const others =
      this.options.courtSlugs === undefined ? relevant : relevant.slice(0, districtParcelCapacity);
    this.shownParcels = others.length;
    others.forEach((parcel, index) => {
      this.lane(parcel);
      this.parcel(parcel, creatures, index === 0);
    });
    if (others.length === 0) {
      const gate = this.shared[placeSlots.gate] ?? this.x;
      this.shared[10] = gate + units(2);
      this.shared[parcelSlot] = gate + units(4);
    }
  }

  finish(): SteadScene {
    const width = Math.max(minimumWidth, this.x + sceneMargin);
    const indices = new Uint8Array(width * sceneHeight);
    this.stars(indices, width);
    this.ground(indices, width);
    for (const layer of this.layers) blitInto(indices, width, sceneHeight, layer);
    return {
      width,
      height: sceneHeight,
      groundY,
      sky: this.sky,
      bitmap: { width, height: sceneHeight, indices },
      anchors: Object.fromEntries(
        [...this.perCreature.entries()].map(([slug, own]) => [
          slug,
          this.shared.map((shared, slot) => own[slot] ?? shared),
        ]),
      ),
      sharedAnchors: [...this.shared],
      hotspots: this.hotspots,
      readings: this.readings,
      ...(this.options.courtSlugs === undefined
        ? {}
        : {
            infrastructure: {
              storehouseWings: this.state.storehouse.wings,
              shownStorehouseWings: this.shownStorehouseWings,
              storehouseShelves: this.state.storehouse.shelves.length,
              totalMills: this.allMills.length,
              shownMills: this.shownMills,
              busyMills: this.allMills.filter((mill) => mill.busy).length,
              loadedMills: this.allMills.filter((mill) => mill.loaded.length > 0).length,
              totalParcels: this.totalParcels,
              shownParcels: this.shownParcels,
            },
          }),
    };
  }

  private tree(): void {
    const planted = this.landmark("tree");
    if (planted === undefined) {
      this.shared[placeSlots.tree] = this.x + units(4);
      this.x += units(10);
      return;
    }
    const age = (this.now - parseTs(planted.at)) / day;
    const stage = Math.min(
      tiles.treeStages - 1,
      Math.floor((age / treeSeasonDays) * tiles.treeStages),
    );
    const crown = tiles.tree(stage);
    this.put(crown, this.x, groundY - tall(crown));
    this.shared[placeSlots.tree] = this.x + Math.floor(wide(crown) / 2);
    this.x += wide(crown) + buildingGap;
  }

  private fence(): void {
    this.put(tiles.fence, this.x, groundY - tall(tiles.fence));
    this.shared[placeSlots.fence] = this.x + units(6);
    this.x += wide(tiles.fence) + buildingGap;
  }

  private storehouse(): void {
    const { shelves, wings } = this.state.storehouse;
    const start = this.x;
    const top = groundY - tall(tiles.storehouse);
    const shown = this.options.courtSlugs === undefined ? Math.max(1, wings) : 1;
    this.shownStorehouseWings = shown;
    for (let wing = 0; wing < shown; wing += 1) {
      const left = this.x;
      this.put(tiles.storehouse, left, top);
      const held = shelves.slice(wing * 12, wing * 12 + 12);
      held.forEach((_, index) => {
        const cell = tiles.shelfCell(index);
        this.put(tiles.shelfCrate, left + units(cell.x), top + units(cell.y));
      });
      this.x += wide(tiles.storehouse);
    }
    this.hotspot(start, top, this.x - start, tall(tiles.storehouse), { kind: "storehouse" });
    this.shared[placeSlots.storehouse] = start + Math.floor(wide(tiles.storehouse) / 2);
    this.x += buildingGap;
  }

  private house(): void {
    const top = groundY - tall(tiles.house);
    const left = this.x;
    const facade = this.afterDusk() && this.anyLampLit() ? litWindows(tiles.house) : tiles.house;
    this.put(facade, left, top);
    if (this.ringing()) {
      this.put(tiles.bellRinging, left + units(tiles.houseBell.x), top + units(tiles.houseBell.y));
    }
    const vane = this.landmark("weathervane");
    if (vane !== undefined) {
      const heading = hashSeed(this.choreRuns()) % tiles.vaneHeadings;
      const tile = tiles.weathervane(heading);
      this.put(
        tile,
        left + units(tiles.houseRidge.x - 2),
        top + units(tiles.houseRidge.y) - tall(tile) + tileScale,
      );
    }
    this.deckCrates(left, top);
    this.hotspot(left, top, wide(tiles.house), tall(tiles.house), { kind: "porch" });
    this.shared[placeSlots.porch] = left + units(tiles.houseDeck.x + 2);
    this.x += wide(tiles.house) + buildingGap;
  }

  private deckCrates(left: number, top: number): void {
    const crates = Object.values(this.state.threads).filter(
      (thread) => !thread.removed && crateOf(thread) !== undefined,
    ).length;
    for (let crate = 0; crate < Math.min(3, crates); crate += 1) {
      this.put(
        tiles.deckCrate,
        left + units(tiles.houseDeck.x) + crate * (wide(tiles.deckCrate) + tileScale),
        top + units(tiles.houseDeck.y),
      );
    }
  }

  private workshop(creature: CreatureOnTheStead): void {
    const family = familyAt(this.options.workshops, creature.slug);
    if (family === undefined) {
      this.legacyWorkshop(creature);
      return;
    }
    const design = workshopDesign(family);
    const reading = this.readings[creature.slug];
    const frame = workshopFrame(family, {
      lamps: reading?.lamps,
      lanterns: reading?.lanterns,
      notes: reading?.notes,
      chores: creature.chores.length,
      crates: reading?.crates,
      boarded: creature.workshop.boardedAt !== undefined,
      garden:
        this.options.gardens !== undefined && Object.hasOwn(this.options.gardens, creature.slug)
          ? this.options.gardens[creature.slug]
          : undefined,
    });
    const left = this.x;
    const top = groundY - tall(frame);
    this.put(frame, left, top);
    this.hotspot(left, top, wide(frame), tall(frame), {
      kind: "workshop",
      creature: creature.slug,
    });
    const own = this.perCreature.get(creature.slug) ?? [];
    const door = left + units(design.door.x + design.door.width / 2);
    const bench = left + wide(frame) + benchYard / 2;
    const board = left + units(design.board.x + 1);
    own[placeSlots.door] = door;
    own[placeSlots.bench] = bench;
    own[placeSlots.board] = board;
    this.perCreature.set(creature.slug, own);
    if (this.perCreature.size === 1) {
      this.shared[placeSlots.door] = door;
      this.shared[placeSlots.bench] = bench;
      this.shared[placeSlots.board] = board;
    }
    this.x += wide(frame) + benchYard + buildingGap;
  }

  private legacyWorkshop(creature: CreatureOnTheStead): void {
    const reading = this.readings[creature.slug];
    const top = groundY - tall(tiles.workshop);
    const left = this.x;
    let facade = tiles.workshop;
    if ((reading?.lamps ?? 0) > 0) facade = tiles.lit(facade, tiles.workshopLamp);
    if ((reading?.lanterns ?? 0) > 0) facade = tiles.lit(facade, tiles.workshopLoft);
    this.put(facade, left, top);
    const notes = Math.min(3, reading?.notes ?? 0);
    for (let note = 0; note < notes; note += 1) {
      this.put(
        tiles.benchNote,
        left + units(tiles.workshopNotes.x + note * 2),
        top + units(tiles.workshopNotes.y - note),
      );
    }
    const chores = Math.min(2, creature.chores.length);
    for (let line = 0; line < chores; line += 1) {
      this.put(
        tiles.chalkLine,
        left + units(tiles.workshopBoard.x),
        top + units(tiles.workshopBoard.y + line),
      );
    }
    const crates = Math.min(2, reading?.crates ?? 0);
    for (let crate = 0; crate < crates; crate += 1) {
      this.put(
        tiles.doorCrate,
        left + units(tiles.workshopCrates.x + crate * 4),
        groundY - tall(tiles.doorCrate),
      );
    }
    if (creature.workshop.boardedAt !== undefined) {
      const door = tiles.workshopDoor;
      this.put(tiles.boards, left + units(door.x - 1), top + units(door.y + 1));
      this.put(tiles.boards, left + units(door.x - 1), top + units(door.y + 4));
      this.put(
        tiles.plaque,
        left + units(tiles.workshopBoard.x - 1),
        groundY - tall(tiles.plaque) - units(1),
      );
    }
    this.hotspot(left, top, wide(tiles.workshop), tall(tiles.workshop), {
      kind: "workshop",
      creature: creature.slug,
    });
    const own = this.perCreature.get(creature.slug) ?? [];
    own[placeSlots.door] = left + units(12);
    own[placeSlots.bench] = left + wide(tiles.workshop) + benchYard / 2;
    own[placeSlots.board] = left + units(18);
    this.perCreature.set(creature.slug, own);
    if (this.perCreature.size === 1) {
      this.shared[placeSlots.door] = left + units(12);
      this.shared[placeSlots.bench] = left + wide(tiles.workshop) + benchYard / 2;
      this.shared[placeSlots.board] = left + units(18);
    }
    this.x += wide(tiles.workshop) + benchYard + buildingGap;
  }

  private hay(): void {
    this.put(tiles.hay, this.x, groundY - tall(tiles.hay));
    this.shared[placeSlots.hay] = this.x + Math.floor(wide(tiles.hay) / 2);
    this.x += wide(tiles.hay) + buildingGap;
  }

  private mill(mill: Mill, fogged: boolean): void {
    this.shownMills += 1;
    const tower = fogged ? tiles.ghosted(tiles.millTower) : tiles.millTower;
    const top = groundY - tall(tiles.millTower);
    const left = this.x + units(3);
    this.put(tower, left, top);
    const sails = tiles.millSails(this.sailFrame(mill));
    this.put(
      fogged ? tiles.ghosted(sails) : sails,
      left + units(tiles.millHub.x - tiles.sailRadius),
      top + units(tiles.millHub.y - tiles.sailRadius),
    );
    const width = wide(tiles.millTower) + units(6);
    const reach = units(tiles.sailRadius);
    this.hotspot(this.x, top - reach, width, tall(tiles.millTower) + reach, {
      kind: "mill",
      mill: mill.id,
    });
    if (this.shared[placeSlots.mill] === 0) {
      this.shared[placeSlots.mill] = this.x + Math.floor(width / 2);
    }
    this.x += width + buildingGap;
  }

  private gate(): void {
    const house = this.houseParcelId();
    if (!Object.values(this.state.parcels).some((parcel) => parcel.id !== house)) {
      this.shared[placeSlots.gate] = this.x + units(4);
      return;
    }
    const gates = Object.values(this.state.gates);
    const anyOpen = gates.some((gate) => gateOpen(gate, this.now));
    const left = this.x;
    const top = groundY - tall(tiles.gateOpen);
    this.put(anyOpen ? tiles.gateOpen : tiles.gateLatched, left, top);
    if (!anyOpen && gates.length > 0) this.put(tiles.padlock, left + units(10), top + units(6));
    if (gates.some((gate) => this.inUse(gate))) {
      this.put(tiles.lantern, left + units(16), top + units(1));
    }
    this.shared[placeSlots.gate] = left + units(8);
    this.x += wide(tiles.gateOpen) + units(2);
    const lanternPost = this.landmark("lantern-post");
    if (lanternPost !== undefined) {
      const post = this.afterDusk() ? tiles.lanternPostLit : tiles.lanternPostDark;
      this.put(post, this.x + units(1), groundY - tall(post));
      this.x += wide(post) + units(2);
    }
  }

  private lane(parcel: Parcel): void {
    const relayed = parcel.path === "relay" || parcel.path === "peer-relay";
    const sign = relayed ? tiles.signpostRelay : tiles.signpostDirect;
    this.put(sign, this.x, groundY - tall(sign));
    this.x += wide(sign);
    this.lanes.push({ from: this.x - wide(sign), to: this.x + laneWidth });
    if (relayed) this.foggedSpans.push({ from: this.x, to: this.x + laneWidth });
    this.x += laneWidth;
  }

  private parcel(parcel: Parcel, creatures: readonly CreatureOnTheStead[], first: boolean): void {
    const fogged = !parcel.online;
    const start = this.x;
    const post = fogged ? tiles.ghosted(tiles.post) : tiles.post;
    this.put(post, this.x, groundY - tall(post));
    this.x += wide(post) + units(2);
    const spyglass = Object.values(this.state.spyglasses).find(
      (glass) => glass.parcel === parcel.id,
    );
    if (spyglass !== undefined) {
      this.put(tiles.spyglass, start - units(1), groundY - tall(post) - tall(tiles.spyglass));
    }
    for (const mill of this.millsOn(parcel.id)) this.mill(mill, fogged);
    for (const creature of creatures) {
      if (creature.workshop.parcel !== parcel.id) continue;
      const family = familyAt(this.options.workshops, creature.slug);
      const facade = family === undefined ? tiles.workshop : workshopDesign(family).facade;
      const shop = fogged ? tiles.ghosted(facade) : facade;
      this.put(shop, this.x, groundY - tall(shop));
      this.x += wide(shop) + buildingGap;
    }
    if (this.x === start + wide(post) + units(2)) this.x += units(20);
    this.put(post, this.x, groundY - tall(post));
    this.x += wide(post) + buildingGap;
    const reach = units(tiles.sailRadius);
    this.hotspot(
      start,
      groundY - tall(tiles.millTower) - reach,
      this.x - start,
      tall(tiles.millTower) + reach,
      { kind: "parcel", parcel: parcel.id },
    );
    if (first) {
      this.shared[parcelSlot] = Math.floor((start + this.x) / 2);
      const gate = this.shared[placeSlots.gate] ?? start;
      this.shared[10] = Math.floor((gate + (this.shared[parcelSlot] ?? start)) / 2);
    }
  }

  private ground(indices: Uint8Array, width: number): void {
    const random = mulberry32(hashSeed(this.seed, "grass"));
    for (let x = 0; x < width; x += 1) {
      indices[groundY * width + x] = groundLight;
      indices[(groundY + 1) * width + x] = groundBase;
      indices[(groundY + 2) * width + x] = groundBase;
      indices[(groundY + 3) * width + x] = groundShadow;
    }
    for (let x = 0; x < width; x += 1) {
      if (random() < 0.08) {
        const run = 2 + Math.floor(random() * 2);
        for (let tip = 0; tip < run && x + tip < width; tip += 1) {
          indices[groundY * width + x + tip] = groundHighlight;
        }
        x += run;
      }
    }
    for (const lane of this.lanes) {
      for (let x = Math.max(0, lane.from); x < Math.min(width, lane.to); x += 1) {
        indices[groundY * width + x] = groundLight;
        indices[(groundY + 1) * width + x] = groundLight;
        indices[(groundY + 2) * width + x] = groundShadow;
      }
    }
    for (const span of this.foggedSpans) {
      for (let x = Math.max(0, span.from); x < Math.min(width, span.to); x += 1) {
        if (Math.floor(x / units(2)) % 2 === 0) indices[(groundY + 1) * width + x] = fog;
      }
    }
  }

  private stars(indices: Uint8Array, width: number): void {
    if (this.sky.light > 0.2) return;
    const random = mulberry32(hashSeed(this.seed, "stars"));
    const count = Math.floor(width / 8);
    for (let star = 0; star < count; star += 1) {
      const x = Math.floor(random() * width);
      const y = Math.floor(random() * (groundY - 30));
      indices[y * width + x] = dim;
    }
  }

  private put(frame: IndexedFrame, x: number, y: number): void {
    this.layers.push({ frame: grown(frame), x, y });
  }

  private hotspot(x: number, y: number, width: number, height: number, target: SceneTarget): void {
    this.hotspots.push({ x, y, width, height, target });
  }

  private landmark(kind: Landmark["kind"]): Landmark | undefined {
    return this.state.landmarks.find((landmark) => landmark.kind === kind);
  }

  private houseParcelId(): string | undefined {
    return Object.values(this.state.parcels).find((parcel) => parcel.roles.includes("house"))?.id;
  }

  private millsOn(parcel: string | undefined): Mill[] {
    return this.selectedMills
      .filter(
        (mill) =>
          mill.parcel === parcel ||
          (parcel === undefined && this.state.parcels[mill.parcel] === undefined),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  private sailFrame(mill: Mill): number {
    if (mill.loaded.length === 0) return 0;
    const period = mill.busy ? sailQuickMs : sailDriftMs;
    return Math.floor(this.now / period) % tiles.sailFrames;
  }

  private afterDusk(): boolean {
    return this.sky.light < 0.5;
  }

  private anyLampLit(): boolean {
    if (this.options.courtSlugs !== undefined)
      return Object.values(this.state.threads).some(
        (thread) => !thread.removed && thread.kind !== "child" && thread.turn !== undefined,
      );
    return Object.values(this.readings).some((reading) => reading.lamps > 0);
  }

  private ringing(): boolean {
    if (this.options.courtSlugs !== undefined) return ringingTheBell(this.state).length > 0;
    return Object.values(this.readings).some((reading) => reading.state === "porch");
  }

  private choreRuns(): string {
    return Object.values(this.state.creatures)
      .flatMap((creature) => creature.chores.map((chore) => chore.lastRanAt ?? ""))
      .join(",");
  }

  private inUse(gate: Gate): boolean {
    return (
      gate.lastWalkAt !== undefined && this.now - parseTs(gate.lastWalkAt) < lanternAfterWalkMs
    );
  }
}

function units(blockout: number): number {
  return blockout * tileScale;
}

function wide(tile: IndexedFrame): number {
  return tile.width * tileScale;
}

function tall(tile: IndexedFrame): number {
  return tile.height * tileScale;
}

function litWindows(facade: tiles.Tile): tiles.Tile {
  return tiles.houseWindows.reduce((lit, window) => tiles.lit(lit, window), facade);
}
