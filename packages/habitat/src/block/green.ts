import type { SteadPlace } from "@keywork-app/protocol";
import { minute, parseTs } from "../clock/clock.ts";
import type { CreatureReading } from "../creature/semantic.ts";
import { type HabitatState, type Slug, threadsOf } from "../world/types.ts";
import type { Axes } from "./camera.ts";
import type { DrawList } from "./draw-list.ts";
import type { Construction, Kit } from "./kit.ts";
import { type CellAddress, reserved } from "./layout.ts";
import {
  type BlockWorld,
  type CastMember,
  cellAt,
  cellCenter,
  type Footprint,
  halfCell,
  type Plot,
  type Point,
  type Target,
  theCouncil,
} from "./model.ts";
import { type ArtRect, type PlaceRects, pathKey } from "./places.ts";
import { type Doorway, layRoads } from "./roads.ts";
import type { ProjectSite, Resident } from "./scene.ts";

export interface Council {
  readonly directory: string;
  readonly active: readonly Slug[];
}

export interface Waiting {
  readonly creature: Slug;
  readonly cloud: boolean;
  readonly reason: WaitReason;
  readonly since: number;
}

export type WaitReason = "busy" | "limited";

export type Line = "mill" | "market";

export type Table = "council" | "ease";

export type Seat =
  | { readonly at: Table; readonly round: Footprint; readonly turn: number }
  | { readonly at: Line; readonly spot: Point };

export interface Leisure {
  gathered: boolean;
}

export interface Ease {
  readonly leisure: Leisure;
  readonly asked: (slug: Slug) => boolean;
  readonly idleFor: (slug: Slug) => number | undefined;
}

export interface Call {
  readonly stands: Plot;
  readonly seat: Seat;
}

export interface Furnishing {
  readonly built: Construction;
  readonly placing: { readonly at: Point; readonly target?: Target };
}

export interface Shared {
  readonly council: Furnishing | undefined;
  call(slug: Slug): Call | undefined;
}

export interface SharedInput {
  readonly kit: Kit;
  readonly residents: readonly Resident[];
  readonly projects: Sites | undefined;
  readonly waiting: readonly Waiting[] | undefined;
  readonly kept: (slug: Slug) => boolean;
  readonly land: (cell: CellAddress) => boolean;
  readonly mill: boolean;
  readonly ease?: Ease | undefined;
}

export type Sites = Readonly<Record<Slug, readonly ProjectSite[]>>;

export const councilFrom = 2;
export const greenFrom = 3;
export const councilSpot: Point = { x: 0, z: 8 };
export const councilSeats: readonly (readonly [across: number, toward: number])[] = [
  [-15, -2],
  [15, -2],
  [0, 16],
  [0, -13],
  [-14, -14],
  [14, -14],
  [-14, 16],
  [14, 16],
];
export const fartherEachLap = 0.35;
export const seatMargin = 3;
export const lineStep = 13;
export const lineReach = 2 * lineStep;
export const easeAfterMs = 2 * minute;
export const strollEveryMs = 1600;

export function sharedSpaces(input: SharedInput): Shared {
  const dwellers = new Map(input.residents.map((resident) => [resident.slug, resident]));
  const free = (slug: Slug): boolean => dwellers.has(slug) && !input.kept(slug);
  const councils = councilsOf(input.projects)
    .map((council) => ({ ...council, active: council.active.filter((slug) => dwellers.has(slug)) }))
    .filter((council) => council.active.length >= councilFrom);
  const council = furnished(input) ? councilFurnishing(input.kit, councils) : undefined;
  const calls = new Map<Slug, Call>();
  if (council !== undefined) {
    const byOrder = (a: Slug, b: Slug): number =>
      (dwellers.get(a)?.order ?? 0) - (dwellers.get(b)?.order ?? 0);
    const sitting = councils.flatMap((each) => [...each.active].sort(byOrder)).filter(free);
    const seats = [...new Set(sitting)].map((slug, turn): Sitter => [slug, turn]);
    for (const [slug, call] of seatedRound("council", groundOf(council), seats)) {
      calls.set(slug, call);
    }
  }
  const lines = linesOf(input, (slug) => free(slug) && !calls.has(slug));
  for (const line of ["mill", "market"] as const) {
    const doors = lines[line].map((slug) => doorwayOf(dwellers.get(slug)));
    const place = linePlaces(input.mill)[line];
    for (const [slug, call] of standingInLine(line, place, lines[line], doors, input.land)) {
      calls.set(slug, call);
    }
  }
  const resting =
    council === undefined || councils.length > 0
      ? []
      : takingItEasy(input, (slug) => free(slug) && !calls.has(slug));
  if (resting.length === 0 && input.ease !== undefined) input.ease.leisure.gathered = false;
  if (council !== undefined) {
    for (const [slug, call] of seatedRound("ease", groundOf(council), resting)) {
      calls.set(slug, call);
    }
  }
  return { council, call: (slug) => calls.get(slug) };
}

export function leisureMemory(): Leisure {
  return { gathered: false };
}

export function easeOf(
  state: HabitatState,
  readings: Readonly<Record<Slug, CreatureReading>>,
  now: number,
  leisure: Leisure = leisureMemory(),
): Ease {
  return {
    leisure,
    asked: (slug) => {
      const creature = state.creatures[slug];
      return (
        creature !== undefined &&
        creature.paused === undefined &&
        creature.workshop.boardedAt === undefined
      );
    },
    idleFor: (slug) =>
      readings[slug]?.state === "idle" ? now - lastStirred(state, slug) : undefined,
  };
}

export function pauseBeforeStrolling(member: Pick<CastMember, "seat">): number {
  return member.seat?.at === "ease" ? member.seat.turn * strollEveryMs : 0;
}

export function councilsOf(projects: Sites = {}): Council[] {
  const working = new Map<string, { directory: string; active: Slug[] }>();
  for (const [creature, sites] of Object.entries(projects)) {
    for (const site of sites) {
      if (!site.lit) continue;
      const folder = working.get(pathKey(site.id)) ?? { directory: site.id, active: [] };
      working.set(pathKey(site.id), folder);
      if (!folder.active.includes(creature)) folder.active.push(creature);
    }
  }
  return [...working]
    .sort(([one], [other]) => one.localeCompare(other))
    .map(([, folder]) => ({ directory: folder.directory, active: [...folder.active].sort() }))
    .filter((folder) => folder.active.length >= councilFrom);
}

export function councilPlace(directory: string): SteadPlace {
  return { kind: "project", creature: theCouncil, directory };
}

export function councilStops(projects: Sites = {}): SteadPlace[] {
  return councilsOf(projects)
    .slice(0, 1)
    .map((council) => councilPlace(council.directory));
}

export function councilAt(place: SteadPlace | undefined): string | undefined {
  return place?.kind === "project" && place.creature === theCouncil ? place.directory : undefined;
}

export function buildingOfTheCouncil(place: SteadPlace, projects: Sites): SteadPlace {
  const directory = councilAt(place);
  if (directory === undefined) return place;
  const working = (lit: boolean): Slug | undefined =>
    Object.keys(projects)
      .sort()
      .find((creature) =>
        projects[creature]?.some(
          (site) => pathKey(site.id) === pathKey(directory) && site.lit === lit,
        ),
      );
  const creature = working(true) ?? working(false);
  return creature === undefined ? place : { kind: "project", creature, directory };
}

export function seatPoint(seat: Seat, axes: Axes): Point {
  if (!("round" in seat)) return seat.spot;
  const [across, toward] = councilSeats[seat.turn % councilSeats.length] ?? [0, 0];
  const lap = 1 + Math.floor(seat.turn / councilSeats.length) * fartherEachLap;
  const centre = middleOf(seat.round);
  const cell = cellAt(centre.x, centre.z);
  const land = cellCenter(cell.cx, cell.cz);
  const onTheLand = (value: number, middle: number): number =>
    Math.round(
      Math.min(middle + halfCell - seatMargin, Math.max(middle - halfCell + seatMargin, value)),
    );
  return {
    x: onTheLand(centre.x + (axes.c * across + axes.s * toward) * lap, land.x),
    z: onTheLand(centre.z + (axes.c * toward - axes.s * across) * lap, land.z),
  };
}

export function roadBetween(member: CastMember, left: Plot): Point[] | undefined {
  const atHome = (plot: Plot): boolean =>
    plot.cell.cx === member.home.cell.cx && plot.cell.cz === member.home.cell.cz;
  const called = left.road !== undefined || member.stands.road !== undefined;
  if (!called && (atHome(left) || atHome(member.stands))) return undefined;
  const out = atHome(left) ? [] : (left.road ?? member.road);
  const back = atHome(member.stands) ? [] : (member.stands.road ?? member.road);
  let shared = 0;
  while (shared < out.length && shared < back.length && samePoint(out[shared], back[shared])) {
    shared += 1;
  }
  const fork = out[shared - 1];
  return [
    ...out.slice(shared).reverse(),
    ...(fork === undefined ? [] : [fork]),
    ...back.slice(shared),
  ];
}

export function seatedAt(world: BlockWorld, at: Seat["at"]): Slug[] {
  return world.cast.filter((member) => member.seat?.at === at).map((member) => member.slug);
}

export function lineOf(world: BlockWorld, slug: Slug | undefined): Line | undefined {
  const at = world.cast.find((member) => member.slug === slug)?.seat?.at;
  return at === "mill" || at === "market" ? at : undefined;
}

export function lineKey(line: Line): string {
  return `line ${line}`;
}

export function withLineRects(rects: PlaceRects, list: DrawList, world: BlockWorld): PlaceRects {
  const lines = new Map<string, ArtRect>();
  for (const quad of list.quads) {
    const target = quad.hit?.target;
    const line = target?.kind === "creature" ? lineOf(world, target.creature) : undefined;
    if (line === undefined) continue;
    const [, , , , x = 0, y = 0] = quad.matrix;
    const figure = { x, y, width: quad.width, height: quad.height };
    lines.set(lineKey(line), around(lines.get(lineKey(line)), figure));
  }
  return lines.size === 0 ? rects : new Map([...rects, ...lines]);
}

interface LinePlace {
  readonly cell: CellAddress;
  readonly gate: Doorway;
  readonly head: Point;
  readonly trail: Point;
}

const millLand = cellCenter(reserved.mill.cx, reserved.mill.cz);
const storeLand = cellCenter(reserved.storehouse.cx, reserved.storehouse.cz);
const greenLand = cellCenter(reserved.green.cx, reserved.green.cz);

const besideTheEdge = 6;
const beforeTheMill = 10;
const besideTheStoreDoor = 4;
const besideTheStoreFront = 20;

function linePlaces(mill: boolean): Readonly<Record<Line, LinePlace>> {
  const edge = millLand.x - halfCell + besideTheEdge;
  return {
    mill: {
      cell: reserved.mill,
      gate: { cell: reserved.mill, door: "pz" },
      head: { x: millLand.x - 3, z: millLand.z + halfCell - beforeTheMill },
      trail: { x: 1, z: 0 },
    },
    market: {
      cell: reserved.mill,
      gate: { cell: reserved.storehouse, door: "nx" },
      head: mill
        ? { x: edge, z: millLand.z + halfCell - beforeTheMill - 2 }
        : {
            x: storeLand.x - halfCell - besideTheStoreDoor,
            z: storeLand.z + besideTheStoreFront,
          },
      trail: { x: 0, z: -1 },
    },
  };
}

function furnished(input: SharedInput): boolean {
  const creatures = input.residents.length;
  const built = Object.values(input.projects ?? {}).some((sites) => sites.length > 0);
  return creatures >= greenFrom || (creatures >= councilFrom && built);
}

function councilFurnishing(kit: Kit, councils: readonly Council[]): Furnishing {
  const [sitting] = councils;
  return {
    built: kit.prop({ kind: "council", lit: sitting !== undefined }),
    placing: {
      at: councilSpot,
      ...(sitting === undefined
        ? {}
        : { target: { kind: "council", directory: sitting.directory } }),
    },
  };
}

function groundOf(council: Furnishing): Footprint {
  const dx = greenLand.x + council.placing.at.x;
  const dz = greenLand.z + council.placing.at.z;
  const table = council.built.parts.flatMap((part) => ("box" in part ? [part.box] : []))[0];
  const { x0, x1, z0, z1 } = table ?? { x0: 0, x1: 0, z0: 0, z1: 0 };
  return { x0: x0 + dx, x1: x1 + dx, z0: z0 + dz, z1: z1 + dz };
}

type Sitter = readonly [slug: Slug, turn: number];

function seatedRound(at: Table, round: Footprint, sitting: readonly Sitter[]): [Slug, Call][] {
  const stands: Plot = { cell: reserved.green, ground: round, door: "nz", beside: 0 };
  return sitting.map(([slug, turn]) => [slug, { stands, seat: { at, round, turn } }]);
}

function takingItEasy(input: SharedInput, free: (slug: Slug) => boolean): Sitter[] {
  const { ease } = input;
  if (ease === undefined) return [];
  const everyone = input.residents.map((resident) => resident.slug).filter(ease.asked);
  const rested = everyone.filter((slug) => free(slug) && (ease.idleFor(slug) ?? 0) >= easeAfterMs);
  if (rested.length === everyone.length) ease.leisure.gathered = true;
  if (!ease.leisure.gathered || rested.length < councilFrom) return [];
  return rested.map((slug) => [slug, everyone.indexOf(slug)]);
}

function lastStirred(state: HabitatState, slug: Slug): number {
  const raised = state.creatures[slug]?.workshop.raisedAt;
  return Math.max(
    raised === undefined ? Number.NEGATIVE_INFINITY : parseTs(raised),
    ...threadsOf(state, slug).map((thread) => parseTs(thread.lastActivityAt)),
  );
}

function linesOf(input: SharedInput, free: (slug: Slug) => boolean): Record<Line, Slug[]> {
  const lines: Record<Line, Slug[]> = { mill: [], market: [] };
  const oldestFirst = [...(input.waiting ?? [])].sort(
    (a, b) => a.since - b.since || a.creature.localeCompare(b.creature),
  );
  for (const wait of oldestFirst) {
    if (!free(wait.creature)) continue;
    if (lines.mill.includes(wait.creature) || lines.market.includes(wait.creature)) continue;
    lines[wait.cloud || !input.mill ? "market" : "mill"].push(wait.creature);
  }
  return lines;
}

function standingInLine(
  line: Line,
  { cell, gate, head, trail }: LinePlace,
  waiting: readonly Slug[],
  doors: readonly Doorway[],
  land: (cell: CellAddress) => boolean,
): [Slug, Call][] {
  const routes = layRoads(doors.map((from) => ({ from, to: gate, grade: 0, land }))).routes();
  const step = waiting.length <= 1 ? 0 : Math.min(lineStep, lineReach / (waiting.length - 1));
  return waiting.map((slug, place) => {
    const spot = {
      x: Math.round(head.x + trail.x * step * place),
      z: Math.round(head.z + trail.z * step * place),
    };
    const road = routes[place]?.points;
    const ground = { x0: spot.x, x1: spot.x, z0: spot.z, z1: spot.z };
    const stands: Plot = {
      cell,
      ground,
      door: "pz",
      beside: 0,
      ...(road === undefined ? {} : { road }),
    };
    return [slug, { stands, seat: { at: line, spot } }];
  });
}

function doorwayOf(resident: Resident | undefined): Doorway {
  return { cell: resident?.cell ?? reserved.house, door: resident?.door ?? "pz" };
}

function around(held: ArtRect | undefined, more: ArtRect): ArtRect {
  if (held === undefined) return more;
  const x = Math.min(held.x, more.x);
  const y = Math.min(held.y, more.y);
  return {
    x,
    y,
    width: Math.max(held.x + held.width, more.x + more.width) - x,
    height: Math.max(held.y + held.height, more.y + more.height) - y,
  };
}

export function middleOf(ground: Footprint): Point {
  return { x: (ground.x0 + ground.x1) / 2, z: (ground.z0 + ground.z1) / 2 };
}

function samePoint(one: Point | undefined, other: Point | undefined): boolean {
  return one !== undefined && other !== undefined && one.x === other.x && one.z === other.z;
}
