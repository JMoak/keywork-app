import type { Appearance, Construction, Glow, Kit, RoadEdges } from "../kit.ts";
import type { CellAddress } from "../layout.ts";
import {
  type BlockWorld,
  type Box,
  type Cell,
  cellCenter,
  cellKey,
  cellPitch,
  type Footprint,
  halfCell,
  type Item,
  movedPart,
  type Point,
} from "../model.ts";
import type { LaneKind } from "./kit.ts";
import { faded, type Land, laneKindOf } from "./lands.ts";
import { cellsOf, type HomeRect, homeRectOf, type LandPlace, landPlace } from "./layout.ts";

export interface MapSceneInput {
  readonly kit: Kit;
  readonly appearance: Appearance;
  readonly town: BlockWorld;
  readonly lands: readonly Land[];
}

export interface LandMark {
  readonly centre: Point;
  readonly standing: string;
  readonly lane: LaneKind | undefined;
  readonly laneAt: Point | undefined;
}

export interface MapScene {
  readonly world: BlockWorld;
  readonly lands: readonly Land[];
  readonly home: HomeRect;
  readonly owners: ReadonlyMap<string, string>;
  readonly marks: ReadonlyMap<string, LandMark>;
}

export interface MapChange {
  readonly land: string;
  readonly at: Point;
}

export const fadedFog = 0.55;
export const laneOverlap = 4;
export const skyAround = 1;
export const hallAt: Point = { x: 2, z: -6 };
export const signpostAt: Point = { x: 0, z: 4 };

export function mapScene(input: MapSceneInput): MapScene {
  return new MapBuilder(input).build();
}

export function mapChangesBetween(before: MapScene, after: MapScene): MapChange[] {
  return [...after.marks].flatMap(([land, mark]): MapChange[] => {
    const held = before.marks.get(land);
    if (held === undefined) return [{ land, at: mark.centre }];
    if (held.lane !== mark.lane) return [{ land, at: mark.laneAt ?? held.laneAt ?? mark.centre }];
    return held.standing === mark.standing ? [] : [{ land, at: mark.centre }];
  });
}

interface Draft {
  readonly address: CellAddress;
  readonly land: boolean;
  readonly owner: string;
  readonly fog: number;
  readonly items: Item[];
  foot: Footprint | undefined;
  glow: Glow[];
}

class MapBuilder {
  private readonly input: MapSceneInput;
  private readonly kit: Kit;
  private readonly night: boolean;
  private readonly home: HomeRect;
  private readonly town: ReadonlyMap<string, Cell>;
  private readonly drafts = new Map<string, Draft>();
  private readonly marks = new Map<string, LandMark>();
  private reach: number;

  constructor(input: MapSceneInput) {
    this.input = input;
    this.kit = input.kit;
    this.night = input.kit.colours[input.appearance].night;
    this.home = homeRectOf(input.town.cells);
    this.town = new Map(input.town.cells.map((cell) => [cellKey(cell), cell]));
    this.reach = input.town.bounds.height;
  }

  build(): MapScene {
    const owners = new Map<string, string>();
    for (const land of this.input.lands) {
      if (land.kind === "home") {
        for (const address of cellsOf(this.home)) owners.set(cellKey(address), land.id);
        this.marks.set(land.id, {
          centre: middleOf(this.home),
          standing: standingOf(land),
          lane: undefined,
          laneAt: undefined,
        });
      } else if (land.place !== undefined) this.away(land, landPlace(land.place, this.home));
    }
    for (const draft of this.drafts.values()) owners.set(cellKey(draft.address), draft.owner);
    return {
      world: this.finish(),
      lands: this.input.lands,
      home: this.home,
      owners,
      marks: this.marks,
    };
  }

  private away(land: Land, place: LandPlace): void {
    const fog = faded(land) ? fadedFog : 0;
    const draft = this.draft(place.cell, land.id, true, fog);
    if (land.kind === "hall") {
      this.put(draft, "hall", this.kit.map.hall({ lit: land.answers, night: this.night }), hallAt);
    } else {
      this.put(draft, "signpost", this.kit.map.signpost({ name: land.name ?? "" }), signpostAt);
    }
    const lane = laneKindOf(land.lane);
    const laneAt = place.lane[Math.floor((place.lane.length - 1) / 2)];
    if (lane !== undefined) this.lane(land, place, lane);
    this.marks.set(land.id, {
      centre: cellCenter(place.cell.cx, place.cell.cz),
      standing: standingOf(land),
      lane,
      laneAt: laneAt === undefined ? undefined : cellCenter(laneAt.cx, laneAt.cz),
    });
  }

  private lane(land: Land, place: LandPlace, kind: LaneKind): void {
    const built = this.kit.map.lane({ kind, axis: place.axis, length: cellPitch + laneOverlap });
    for (const address of place.lane) {
      this.put(this.draft(address, land.id, false, 0), kind, built, { x: 0, z: 0 });
    }
  }

  private draft(address: CellAddress, owner: string, land: boolean, fog: number): Draft {
    const key = cellKey(address);
    const known = this.drafts.get(key);
    if (known !== undefined) return known;
    const made: Draft = { address, land, owner, fog, items: [], foot: undefined, glow: [] };
    this.drafts.set(key, made);
    return made;
  }

  private put(draft: Draft, what: string, built: Construction, at: Point): void {
    const centre = cellCenter(draft.address.cx, draft.address.cz);
    const dx = centre.x + at.x;
    const dz = centre.z + at.z;
    draft.items.push({
      what,
      x: dx,
      z: dz,
      parts: built.parts.map((part) => movedPart(part, dx, dz)),
    });
    if (built.foot !== undefined) draft.foot = moved(built.foot, at.x, at.z);
    for (const glow of built.glow ?? []) {
      draft.glow.push({
        ...glow,
        x0: glow.x0 + dx,
        x1: glow.x1 + dx,
        z0: glow.z0 + dz,
        z1: glow.z1 + dz,
      });
    }
    this.reach = Math.max(this.reach, built.reach);
  }

  private finish(): BlockWorld {
    const filled = cellsOf(this.home)
      .filter((address) => !this.town.has(cellKey(address)))
      .map((address) => this.ground(address, true, 0, [], undefined, []));
    const away = [...this.drafts.values()].map((draft) =>
      this.ground(draft.address, draft.land, draft.fog, draft.items, draft.foot, draft.glow),
    );
    const cells = [...this.input.town.cells, ...filled, ...away];
    const framed = [...cells, ...rimOf(this.home)];
    const xs = framed.map((cell) => cell.cx * cellPitch);
    const zs = framed.map((cell) => cell.cz * cellPitch);
    return {
      cells,
      walkers: this.input.town.walkers,
      cast: this.input.town.cast,
      bounds: {
        minX: Math.min(...xs) - halfCell,
        maxX: Math.max(...xs) + halfCell,
        minZ: Math.min(...zs) - halfCell,
        maxZ: Math.max(...zs) + halfCell,
        height: this.reach,
        slab: this.input.town.bounds.slab,
      },
    };
  }

  private ground(
    address: CellAddress,
    land: boolean,
    fog: number,
    items: readonly Item[],
    worn: Footprint | undefined,
    glow: readonly Glow[],
  ): Cell {
    const { cx, cz } = address;
    if (!land) return { cx, cz, land, fog, ground: [], items };
    const colours = this.kit.colours[this.input.appearance];
    const pooled = colours.pool !== undefined;
    const centre = cellCenter(cx, cz);
    const ground = this.kit.map
      .land({
        cx,
        cz,
        worn,
        roads: noRoads,
        glow: pooled ? glow : [],
        night: this.night,
        pooled,
        shadow: colours.shadow,
      })
      .parts.flatMap((part): Box[] => {
        const placed = movedPart(part, centre.x, centre.z);
        return "box" in placed ? [placed.box] : [];
      });
    return { cx, cz, land, fog, ground, items };
  }
}

function standingOf(land: Land): string {
  return `${land.kind} ${land.answers ? "answers" : "quiet"} ${faded(land) ? "faded" : "clear"}`;
}

function middleOf(home: HomeRect): Point {
  return {
    x: ((home.minCx + home.maxCx) / 2) * cellPitch,
    z: ((home.minCz + home.maxCz) / 2) * cellPitch,
  };
}

function rimOf(home: HomeRect): CellAddress[] {
  return [
    { cx: home.minCx - skyAround, cz: home.minCz - skyAround },
    { cx: home.maxCx + skyAround, cz: home.maxCz + skyAround },
  ];
}

function moved(foot: Footprint, dx: number, dz: number): Footprint {
  return { x0: foot.x0 + dx, x1: foot.x1 + dx, z0: foot.z0 + dz, z1: foot.z1 + dz };
}

const noRoads: RoadEdges = {
  north: 0,
  south: 0,
  west: 0,
  east: 0,
  northWest: 0,
  northEast: 0,
  southWest: 0,
  southEast: 0,
};
