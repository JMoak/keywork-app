import { day, hour, parseTs } from "../clock/clock.ts";
import { type CreatureReading, creatureReading } from "../creature/semantic.ts";
import { inOrderOfRaising } from "../render/stead.ts";
import {
  type Creature,
  gateOpen,
  type HabitatState,
  type Landmark,
  type Mill,
  type Slug,
  threadsOf,
} from "../world/types.ts";
import { critterParts, type Doing, figureFor } from "./figures.ts";
import {
  type Appearance,
  type BannerTier,
  type Construction,
  type Glow,
  identityCount,
  type Kit,
  type MonumentTier,
  type RoadGrade,
  type WallMeaning,
} from "./kit.ts";
import {
  type CellAddress,
  doorSideOf,
  greenSpots,
  monumentSpot,
  porchSpot,
  reserved,
  restsOnTheGreen,
  shedSpot,
  shedSpots,
  treeSpot,
  wellSpot,
  workshopCell,
} from "./layout.ts";
import {
  along,
  type BlockWorld,
  type Box,
  type Cell,
  cellCenter,
  cellPitch,
  type Footprint,
  halfCell,
  type Item,
  identityRamp,
  movedPart,
  type Part,
  type Point,
  type RampKey,
  type Side,
  sideAfter,
  type Target,
  type Walker,
} from "./model.ts";
import { layRoads, type RoadMap, type RoadRequest, type Route } from "./roads.ts";

export interface ProjectSite {
  readonly id: string;
  readonly floors: number;
  readonly lit: boolean;
  readonly conversations?: number | undefined;
  readonly trackedFiles?: number | undefined;
}

export interface Partnership {
  readonly between: readonly [Slug, Slug];
  readonly grade: RoadGrade;
}

export interface Decoration {
  readonly garland: boolean;
  readonly banner: BannerTier;
  readonly star: boolean;
}

export const undecorated: Decoration = { garland: false, banner: 0, star: false };

export interface BlockSceneInput {
  readonly kit: Kit;
  readonly appearance: Appearance;
  readonly now: number;
  readonly decorations?: Readonly<Record<Slug, Decoration>> | undefined;
  readonly monument?: MonumentTier | undefined;
  readonly readings?: Readonly<Record<Slug, CreatureReading>> | undefined;
  readonly projects?: Readonly<Record<Slug, readonly ProjectSite[]>> | undefined;
  readonly partnerships?: readonly Partnership[] | undefined;
}

export interface Resident {
  readonly slug: Slug;
  readonly order: number;
  readonly identity: number;
  readonly cell: CellAddress;
  readonly door: Side;
}

export interface BlockScene {
  readonly world: BlockWorld;
  readonly residents: readonly Resident[];
  readonly roads: RoadMap;
}

export const crateLimit = 3;
export const lanternLimit = 3;
export const ivyDays = [7, 30, 90] as const;
export const napAfterMs = 2 * hour;
export const lowestReach = 30;
export const heroSlab = 24;
export const walkerPace = 1.4;
export const walkerSpacing = 37;
export const storehouseCells = 10;

export function blockScene(state: HabitatState, input: BlockSceneInput): BlockScene {
  return new SceneBuilder(state, input).build();
}

export function identityIndex(seed: number, identities: number): number {
  return Math.max(0, Math.floor(seed)) % Math.max(1, identities);
}

export function residentsOf(state: HabitatState, kit: Kit): Resident[] {
  const alphabetical = Object.keys(state.creatures).sort();
  return inOrderOfRaising(Object.values(state.creatures)).map((creature, order) => {
    const cell = workshopCell(order);
    return {
      slug: creature.slug,
      order,
      identity: identityIndex(seedOf(creature, alphabetical), identityCount(kit)),
      cell,
      door: doorSideOf(cell),
    };
  });
}

export function wallsAround(door: Side): Readonly<Record<Side, WallMeaning>> {
  const meanings: readonly WallMeaning[] = ["door", "bench", "shelf", "board"];
  return Object.fromEntries(
    meanings.map((meaning, turn) => [sideAfter(door, turn), meaning]),
  ) as Record<Side, WallMeaning>;
}

export function doingOf(
  state: HabitatState,
  slug: Slug,
  reading: CreatureReading | undefined,
  now: number,
): Doing {
  switch (reading?.state ?? "idle") {
    case "porch":
      return "porch";
    case "blocked":
      return "blocked";
    case "back":
      return "walk";
    case "working":
      return "work";
    case "paused":
      return "sit";
    case "idle":
      return napping(state, slug, now) ? "nap" : "idle";
  }
}

export function deliveredBy(state: HabitatState, slug: Slug): number {
  return threadsOf(state, slug).filter((thread) => thread.viewedAt !== undefined).length;
}

export function doorCrates(reading: CreatureReading | undefined): number {
  if (reading === undefined) return 0;
  return Math.max(0, reading.crates - (reading.state === "back" ? 1 : 0));
}

export function storeysFor(delivered: number): number {
  return 1 + (delivered >= 3 ? 1 : 0) + (delivered >= 6 ? 1 : 0);
}

interface CellDraft {
  readonly cx: number;
  readonly cz: number;
  readonly items: Item[];
  foot: Footprint | undefined;
  glow: readonly Glow[];
}

interface Placing {
  readonly at?: Point;
  readonly anchor?: Point;
  readonly target?: Target;
  readonly ramp?: RampKey;
}

class SceneBuilder {
  private readonly state: HabitatState;
  private readonly input: BlockSceneInput;
  private readonly kit: Kit;
  private readonly night: boolean;
  private readonly pooled: boolean;
  private readonly alphabetical: readonly string[];
  private readonly residents: readonly Resident[];
  private readonly readings: Readonly<Record<Slug, CreatureReading>>;
  private readonly cells = new Map<string, CellDraft>();
  private readonly footprints = new Map<Slug, Footprint>();
  private readonly walkers: Walker[] = [];
  private reach = lowestReach;

  constructor(state: HabitatState, input: BlockSceneInput) {
    this.state = state;
    this.input = input;
    this.kit = input.kit;
    const colours = input.kit.colours[input.appearance];
    this.night = colours.night;
    this.pooled = colours.pool !== undefined;
    this.alphabetical = Object.keys(state.creatures).sort();
    this.residents = residentsOf(state, input.kit);
    this.readings =
      input.readings ??
      Object.fromEntries(
        this.residents.map((resident) => [
          resident.slug,
          creatureReading(state, resident.slug, input.now),
        ]),
      );
  }

  build(): BlockScene {
    this.house();
    this.storehouse();
    this.cell(reserved.green);
    if (this.landmark("well") !== undefined) {
      this.place(reserved.green, "well", this.kit.prop({ kind: "well" }), { at: wellSpot });
    }
    const monument = this.input.monument ?? 0;
    if (monument > 0) {
      this.place(reserved.green, "monument", this.kit.prop({ kind: "monument", tier: monument }), {
        at: monumentSpot,
      });
    }
    this.millBuilding();
    for (const resident of this.residents) this.workshop(resident);
    const roads = layRoads(this.roadRequests());
    this.figures(roads);
    return { world: this.finish(roads), residents: this.residents, roads };
  }

  private house(): void {
    const built = this.kit.house({
      lit: this.night,
      ringing: Object.values(this.readings).some((reading) => reading.state === "porch"),
      vane: this.landmark("weathervane") !== undefined,
      tree: this.landmark("tree") !== undefined,
      smoke: this.night,
      night: this.night,
    });
    this.place(reserved.house, "house", built, { target: { kind: "house" } });
    if (this.landmark("tree") !== undefined) {
      this.place(reserved.house, "tree", this.kit.prop({ kind: "tree" }), { at: treeSpot });
    }
  }

  private storehouse(): void {
    const built = this.kit.storehouse({
      shelves: Math.min(storehouseCells, this.state.storehouse.shelves.length),
    });
    this.place(reserved.storehouse, "storehouse", built, { target: { kind: "storehouse" } });
  }

  private millBuilding(): void {
    const mill = houseMill(this.state);
    if (mill === undefined) return;
    const built = this.kit.mill({
      turning: mill.loaded.length === 0 ? "still" : mill.busy ? "quick" : "drift",
      busy: mill.busy,
    });
    this.place(reserved.mill, "mill", built, { target: { kind: "mill", mill: mill.id } });
  }

  private workshop(resident: Resident): void {
    const creature = this.state.creatures[resident.slug];
    if (creature === undefined) return;
    const reading = this.readings[resident.slug];
    const delivered = deliveredBy(this.state, creature.slug);
    const built = this.kit.workshop({
      seed: seedOf(creature, this.alphabetical),
      order: resident.order,
      walls: wallsAround(resident.door),
      door: resident.door,
      storeys: storeysFor(delivered),
      lit: (reading?.lamps ?? 0) > 0 && creature.workshop.boardedAt === undefined,
      loft: (reading?.lanterns ?? 0) > 0,
      delivered,
      chores: creature.chores.length,
      notes: reading?.notes ?? 0,
      gates: Math.min(
        lanternLimit,
        Object.values(this.state.gates).filter(
          (gate) => gate.creature === creature.slug && gateOpen(gate, this.input.now),
        ).length,
      ),
      ivy: ivyOf(creature, this.input.now),
      boarded: creature.workshop.boardedAt !== undefined,
      night: this.night,
      ...(this.input.decorations?.[creature.slug] ?? undecorated),
    });
    const center = cellCenter(resident.cell.cx, resident.cell.cz);
    const footprint = {
      x0: built.footprint.x0 + center.x,
      x1: built.footprint.x1 + center.x,
      z0: built.footprint.z0 + center.z,
      z1: built.footprint.z1 + center.z,
    };
    this.footprints.set(creature.slug, footprint);
    const ramp = identityRamp(resident.identity);
    const target: Target = { kind: "workshop", creature: creature.slug };
    this.place(resident.cell, "workshop", { ...built, annexes: [] }, { target, ramp });
    const crates = Math.min(crateLimit, doorCrates(reading));
    const wall =
      resident.door === "pz" || resident.door === "nz"
        ? footprint.x1 - footprint.x0
        : footprint.z1 - footprint.z0;
    for (let index = 0; index < crates; index += 1) {
      const spot = along(footprint, resident.door, wall - 4 - index * 7, 4);
      this.place(resident.cell, "crate", this.kit.prop({ kind: "crate" }), {
        at: { x: spot.x - center.x, z: spot.z - center.z },
      });
    }
    for (const annex of built.annexes ?? []) {
      this.place(
        resident.cell,
        "awning",
        { parts: annex.parts, reach: 0 },
        { ramp, anchor: { x: annex.x, z: annex.z } },
      );
    }
    this.sheds(resident, creature);
  }

  private sheds(resident: Resident, creature: Creature): void {
    const sites = (this.input.projects?.[creature.slug] ?? []).slice(0, shedSpots.length);
    sites.forEach((site, index) => {
      const spot = shedSpot(index, resident.door);
      if (spot === undefined) return;
      const topped = sites.some((_, later) => later > index && shedSpots[later]?.on === index);
      const built = this.kit.shed({
        seed: seedOf(creature, this.alphabetical),
        order: resident.order,
        spot,
        floors: Math.max(1, Math.floor(site.floors)),
        lit: site.lit,
        roofed: !topped,
        trackedFiles: site.trackedFiles,
      });
      this.place(resident.cell, "shed", built, {
        target: { kind: "shed", creature: creature.slug, project: site.id },
        ramp: identityRamp(resident.identity),
      });
    });
  }

  private roadRequests(): RoadRequest[] {
    const land = (cell: CellAddress): boolean => this.cells.has(addressKey(cell));
    const porch = { cell: reserved.house, door: "pz" as const };
    const requests: RoadRequest[] = [
      { from: { cell: reserved.storehouse, door: "pz" }, to: porch, grade: 1, land },
      ...this.residents.map((resident) => ({
        from: { cell: resident.cell, door: resident.door },
        to: porch,
        grade: 1 as RoadGrade,
        land,
      })),
    ];
    for (const pair of this.partnerships()) {
      requests.push({
        from: { cell: pair.a.cell, door: pair.a.door },
        to: { cell: pair.b.cell, door: pair.b.door },
        grade: pair.grade,
        land,
      });
    }
    return requests;
  }

  private partnerships(): { a: Resident; b: Resident; grade: RoadGrade }[] {
    return (this.input.partnerships ?? []).flatMap((partnership) => {
      const [a, b] = partnership.between.map((slug) =>
        this.residents.find((resident) => resident.slug === slug),
      );
      if (a === undefined || b === undefined || a === b || partnership.grade === 0) return [];
      return [{ a, b, grade: partnership.grade }];
    });
  }

  private figures(roads: RoadMap): void {
    const routes = roads.routes();
    const firstRoad = new Map<Slug, Route>();
    this.partnerships().forEach((pair, index) => {
      const route = routes[this.residents.length + 1 + index];
      if (route === undefined) return;
      if (!firstRoad.has(pair.a.slug)) firstRoad.set(pair.a.slug, route);
      if (!firstRoad.has(pair.b.slug)) firstRoad.set(pair.b.slug, route);
    });
    let onTheGreen = 0;
    for (const resident of this.residents) {
      const creature = this.state.creatures[resident.slug];
      if (creature === undefined || creature.workshop.boardedAt !== undefined) continue;
      const doing = doingOf(
        this.state,
        resident.slug,
        this.readings[resident.slug],
        this.input.now,
      );
      const parts = critterParts(figureFor(creature.skin), doing, resident.order);
      const target: Target = { kind: "creature", creature: resident.slug };
      const ramp = identityRamp(resident.identity);
      if (doing === "walk") {
        const route = firstRoad.get(resident.slug) ?? routes[1 + resident.order];
        if (route !== undefined) {
          this.walkers.push({
            what: "creature",
            path: route.points,
            phase: resident.order * walkerSpacing,
            pace: walkerPace,
            parts,
            ramp,
            target,
          });
          continue;
        }
      }
      const standing: Construction = { parts, reach: 0 };
      const green =
        (doing === "nap" || doing === "idle") &&
        restsOnTheGreen(seedOf(creature, this.alphabetical))
          ? greenSpots[onTheGreen]
          : undefined;
      if (doing === "porch") {
        this.place(reserved.house, "creature", standing, { at: porchSpot, target, ramp });
      } else if (green !== undefined) {
        this.place(reserved.green, "creature", standing, { at: green, target, ramp });
        onTheGreen += 1;
      } else {
        const footprint = this.footprints.get(resident.slug);
        if (footprint === undefined) continue;
        const spot = along(footprint, resident.door, 19, 5);
        const center = cellCenter(resident.cell.cx, resident.cell.cz);
        this.place(resident.cell, "creature", standing, {
          at: { x: spot.x - center.x, z: spot.z - center.z },
          target,
          ramp,
        });
      }
    }
  }

  private finish(roads: RoadMap): BlockWorld {
    const drafts = [...this.cells.values()];
    const seen = new Set<string>();
    for (const draft of drafts) {
      for (const [i, j] of [
        [draft.cx, draft.cz],
        [draft.cx + 1, draft.cz],
        [draft.cx, draft.cz + 1],
        [draft.cx + 1, draft.cz + 1],
      ] as const) {
        if (seen.has(`${i},${j}`)) continue;
        seen.add(`${i},${j}`);
        if (roads.cornerGrade({ i, j }) !== 3) continue;
        const center = cellCenter(draft.cx, draft.cz);
        this.place(draft, "road-lamp", this.kit.prop({ kind: "road-lamp", lit: this.night }), {
          at: { x: i * cellPitch - halfCell - center.x, z: j * cellPitch - halfCell - center.z },
        });
      }
    }
    const cells: Cell[] = drafts.map((draft) => {
      const center = cellCenter(draft.cx, draft.cz);
      const ground = this.kit
        .ground({
          cx: draft.cx,
          cz: draft.cz,
          worn: draft.foot,
          roads: roads.edgesOf(draft),
          glow: this.pooled ? draft.glow : [],
          night: this.night,
          pooled: this.pooled,
          shadow: this.kit.colours[this.input.appearance].shadow,
        })
        .parts.flatMap((part): Box[] => {
          const moved = movedPart(part, center.x, center.z);
          return "box" in moved ? [moved.box] : [];
        });
      return { cx: draft.cx, cz: draft.cz, land: true, fog: 0, ground, items: draft.items };
    });
    const xs = cells.map((cell) => cell.cx * cellPitch);
    const zs = cells.map((cell) => cell.cz * cellPitch);
    return {
      cells,
      walkers: this.walkers,
      bounds: {
        minX: Math.min(...xs) - halfCell,
        maxX: Math.max(...xs) + halfCell,
        minZ: Math.min(...zs) - halfCell,
        maxZ: Math.max(...zs) + halfCell,
        height: this.reach,
        slab: heroSlab,
      },
    };
  }

  private cell(address: CellAddress): CellDraft {
    const key = addressKey(address);
    const known = this.cells.get(key);
    if (known !== undefined) return known;
    const draft: CellDraft = {
      cx: address.cx,
      cz: address.cz,
      items: [],
      foot: undefined,
      glow: [],
    };
    this.cells.set(key, draft);
    return draft;
  }

  private place(
    address: CellAddress,
    what: string,
    built: Construction,
    options: Placing = {},
  ): void {
    const draft = this.cell(address);
    const center = cellCenter(address.cx, address.cz);
    const at = options.at ?? { x: 0, z: 0 };
    const dx = center.x + at.x;
    const dz = center.z + at.z;
    const moved = (parts: readonly Part[]): Part[] => parts.map((part) => movedPart(part, dx, dz));
    const decorate = {
      ...(options.target === undefined ? {} : { target: options.target }),
      ...(options.ramp === undefined ? {} : { ramp: options.ramp }),
    };
    const anchor = options.anchor ?? anchorOf(built, at);
    draft.items.push({
      what,
      x: center.x + anchor.x,
      z: center.z + anchor.z,
      parts: moved(built.parts),
      ...(built.crown === undefined
        ? {}
        : {
            crown: built.crown.map((crowning) => ({
              x: crowning.x + dx,
              z: crowning.z + dz,
              part: movedPart(crowning.part, dx, dz),
            })),
          }),
      ...decorate,
    });
    for (const annex of built.annexes ?? []) {
      draft.items.push({
        what: `${what} porch`,
        x: dx + annex.x,
        z: dz + annex.z,
        parts: moved(annex.parts),
        ...decorate,
      });
    }
    if (built.foot !== undefined) draft.foot = built.foot;
    if (built.glow !== undefined && built.glow.length > 0) {
      draft.glow = built.glow.map((glow) => ({
        ...glow,
        colour: options.ramp === undefined ? glow.colour : rampedRole(glow.colour, options.ramp),
        x0: glow.x0 + dx,
        x1: glow.x1 + dx,
        z0: glow.z0 + dz,
        z1: glow.z1 + dz,
      }));
    }
    this.reach = Math.max(this.reach, built.reach);
  }

  private landmark(kind: Landmark["kind"]): Landmark | undefined {
    return this.state.landmarks.find((landmark) => landmark.kind === kind);
  }
}

function anchorOf(built: Construction, at: Point): Point {
  const first = built.parts.find((part) => "box" in part);
  if (first === undefined || !("box" in first)) {
    const sprite = built.parts.find((part) => "sprite" in part);
    return sprite !== undefined && "sprite" in sprite
      ? { x: at.x + sprite.sprite.x, z: at.z + sprite.sprite.z }
      : at;
  }
  return {
    x: at.x + (first.box.x0 + first.box.x1) / 2,
    z: at.z + (first.box.z0 + first.box.z1) / 2,
  };
}

function houseMill(state: HabitatState): Mill | undefined {
  const house = Object.values(state.parcels).find((parcel) => parcel.roles.includes("house"))?.id;
  return Object.values(state.mills)
    .filter(
      (mill) =>
        mill.parcel === house || (house === undefined && state.parcels[mill.parcel] === undefined),
    )
    .sort((a, b) => a.builtAt.localeCompare(b.builtAt) || a.id.localeCompare(b.id))[0];
}

function ivyOf(creature: Creature, now: number): number {
  const age = (now - parseTs(creature.workshop.raisedAt)) / day;
  return ivyDays.filter((days) => age >= days).length;
}

function napping(state: HabitatState, slug: Slug, now: number): boolean {
  const latest = Math.max(
    Number.NEGATIVE_INFINITY,
    ...threadsOf(state, slug).map((thread) => parseTs(thread.lastActivityAt)),
  );
  return now - latest >= napAfterMs;
}

function seedOf(creature: Creature, alphabetical: readonly string[]): number {
  return creature.seed ?? alphabetical.indexOf(creature.slug);
}

function rampedRole(role: string, ramp: RampKey): string {
  return /^(?:hue|glow)\./.test(role) ? `${role}#${ramp}` : role;
}

function addressKey(address: CellAddress): string {
  return `${address.cx},${address.cz}`;
}
