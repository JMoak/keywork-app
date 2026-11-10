import type { SettingKind } from "@keywork-app/protocol";
import { onItsHeadStart } from "./attention.ts";
import { byDepth } from "./depth.ts";
import { plotSeedOf } from "./lineage.ts";
import { hiddenInPlots, type PlotCard, plotCardsOf } from "./plot.ts";
import {
  type Placement,
  type Rect,
  rankOf,
  type Size,
  sizeOf,
  stillShown,
  type YardLayout,
  type YardSetting,
} from "./types.ts";

export const yardMetrics = {
  margin: 16,
  gap: 12,
  readable: { width: 480, height: 320, shortSideShare: 0.4, aspect: 1.5 },
  code: { columns: 80, column: 8.4, gutter: 48 },
  rail: { width: 272, head: 40, card: 64, fold: 32, length: 5 },
  node: { height: 96 },
  hub: { share: 0.3, min: 360, max: 640 },
  working: { areaShare: 1.5 },
  slots: 6,
} as const;

export const yardIds = { hub: "yard:hub", card: "yard:card", fold: "yard:fold" } as const;

export type Side = "right" | "left" | "below" | "above";

export const ring: readonly Side[] = ["right", "left", "below", "above"];

export type ChildLane = "outward" | "after" | "before";

export const childLanes: readonly ChildLane[] = ["outward", "after", "before"];

export const codeKinds: ReadonlySet<SettingKind> = new Set<SettingKind>(["file", "diff"]);

export const codeWidth = Math.round(
  yardMetrics.code.columns * yardMetrics.code.column + yardMetrics.code.gutter,
);

export function placeYard(input: YardLayout): readonly Placement[] {
  const hub = placed(yardIds.hub, input.hub, "glyph", "mid", "working");
  if (input.prefs.tier === "hidden") return [hub];
  const hidden = hiddenInPlots(input.settings);
  const ladder = input.settings
    .filter((setting) => onTheLadder(setting) && !hidden.has(setting.id))
    .toSorted(byDepth);
  const plots = plotCardsOf(input.settings);
  if (ladder.length === 0 && plots.length === 0) return [hub];
  const placements =
    stagePlacements(input, ladder, plots) ?? yardPlacements(input, hub, ladder, plots);
  return withParents(placements, input.settings);
}

export function foldedOf(
  placements: readonly Placement[],
  settings: readonly YardSetting[],
): readonly YardSetting[] {
  const shown = new Set(placements.map((placement) => placement.id));
  const hidden = hiddenInPlots(settings);
  const tucked = (setting: YardSetting): boolean => {
    const plot = hidden.get(setting.id);
    return plot !== undefined && shown.has(plot);
  };
  return settings
    .filter((setting) => onTheLadder(setting) && !shown.has(setting.id) && !tucked(setting))
    .toSorted(byDepth);
}

export function readableSize(viewport: Rect): Extent {
  const { readable } = yardMetrics;
  const shortSide = Math.min(viewport.width, viewport.height);
  const height = Math.max(readable.height, Math.round(shortSide * readable.shortSideShare));
  return { width: Math.max(readable.width, Math.round(height * readable.aspect)), height };
}

export function unfoldWidth(kind: SettingKind, viewport: Rect): number {
  const floor = readableSize(viewport).width;
  return codeKinds.has(kind) ? Math.max(floor, codeWidth) : floor;
}

export const cardSize: Extent = { width: yardMetrics.rail.width, height: yardMetrics.rail.card };

export function defaultHub(viewport: Rect): Rect {
  const { hub, gap, rail } = yardMetrics;
  const inner = innerOf(viewport);
  const width = Math.min(
    inner.width,
    Math.max(hub.min, Math.min(hub.max, Math.round(viewport.width * hub.share))),
  );
  const beside = gap + rail.width + gap + readableSize(viewport).width;
  const free = inner.width - width;
  const left = free >= 2 * beside ? Math.round(free / 2) : Math.max(0, free - beside);
  return { x: inner.x + left, y: inner.y, width, height: inner.height };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
}

export interface Extent {
  readonly width: number;
  readonly height: number;
}

interface Rail {
  readonly head: Rect;
  readonly cards: readonly Rect[];
  readonly fold: Rect;
  readonly region: Rect;
}

interface Position {
  readonly rect: Rect;
  readonly side: Side;
}

interface Slot extends Position {
  readonly wide: Rect | undefined;
}

interface Seat extends Position {
  readonly setting: YardSetting;
  readonly slot: number | undefined;
  readonly lane: number | undefined;
}

interface Sized {
  readonly seat: Seat;
  readonly rect: Rect;
  readonly size: Size;
}

interface RailEntry {
  readonly id: string;
  readonly depth: number;
  readonly at: string;
}

function onTheLadder(setting: YardSetting): boolean {
  return stillShown(setting) && rankOf(setting.shown) >= rankOf("card");
}

function stagePlacements(
  input: YardLayout,
  ladder: readonly YardSetting[],
  plots: readonly PlotCard[],
): readonly Placement[] | undefined {
  const staged = ladder.find((setting) => setting.shown === "stage");
  if (staged === undefined) return undefined;
  const { gap, rail, node } = yardMetrics;
  const inner = innerOf(input.viewport);
  const onRight = centerX(input.hub) >= centerX(input.viewport);
  const column = onRight ? right(inner) - rail.width : inner.x;
  const corner: Rect = { x: column, y: inner.y, width: rail.width, height: node.height };
  const stageX = onRight ? inner.x : column + rail.width + gap;
  const stage: Rect = {
    x: stageX,
    y: inner.y,
    width: onRight ? column - gap - inner.x : right(inner) - stageX,
    height: inner.height,
  };
  const size = readableSize(input.viewport);
  if (column < inner.x || stage.width < size.width || stage.height < size.height) return undefined;
  const stack = railStack(column, bottom(corner) + gap, bottom(inner) - bottom(corner) - gap);
  const rest = ladder.filter((setting) => setting.id !== staged.id);
  return [
    placed(yardIds.hub, corner, "glyph", "front", "card"),
    placed(staged.id, stage, "stage", "back", "working"),
    ...railPlacements(stack, railEntriesOf(rest, plots)),
  ];
}

function yardPlacements(
  input: YardLayout,
  hub: Placement,
  ladder: readonly YardSetting[],
  plots: readonly PlotCard[],
): readonly Placement[] {
  const rail = railBeside(input.viewport, input.hub);
  const reserved = rail === undefined ? [input.hub] : [input.hub, rail.region];
  const satellites = satellitesOf(input, ladder, reserved);
  const unfolded = new Set(satellites.map((placement) => placement.id));
  const cards = ladder.filter((setting) => !unfolded.has(setting.id));
  return [hub, ...satellites, ...railPlacements(rail, railEntriesOf(cards, plots))];
}

function satellitesOf(
  input: YardLayout,
  ladder: readonly YardSetting[],
  reserved: readonly Rect[],
): Placement[] {
  const unfolds = ladder.filter((setting) => rankOf(setting.shown) >= rankOf("unfold"));
  if (unfolds.length === 0) return [];
  const slots = ringSlots(input.viewport, input.hub, reserved);
  const seats = seatedInTurn(input.viewport, unfolds, slots, reserved);
  const handed = handedToTheVisit(seats, unfolds, input.inside);
  const kept = handed === undefined ? reserved : [...reserved, handed.yielded.rect];
  const sized = sizedSeats(input.viewport, handed?.seats ?? seats, kept, input.inside);
  const satellites = inTrailOrder(sized).map(({ seat, rect, size }) => ({
    ...placed(seat.setting.id, rect, "unfold", "mid", size),
    slot: seat.slot,
  }));
  return handed === undefined ? satellites : [...satellites, handed.yielded];
}

interface Handed {
  readonly seats: readonly Seat[];
  readonly yielded: Placement;
}

function handedToTheVisit(
  seats: readonly Seat[],
  unfolds: readonly YardSetting[],
  inside: string | undefined,
): Handed | undefined {
  const visited = unfolds.find((setting) => setting.id === inside);
  if (visited === undefined || seats.some((seat) => seat.setting === visited)) return undefined;
  const ancestor = nearestSeatedAncestor(visited, unfolds, seats);
  if (ancestor === undefined) return undefined;
  const corner = cornersOf(ancestor)[0];
  if (corner === undefined) return undefined;
  const taken: Seat = { ...ancestor, setting: visited, rect: besideCorner(ancestor.rect, corner) };
  return {
    seats: seats.map((seat) => (seat === ancestor ? taken : seat)),
    yielded: {
      ...placed(ancestor.setting.id, corner, "unfold", "mid", "card"),
      slot: ancestor.slot,
    },
  };
}

function nearestSeatedAncestor(
  setting: YardSetting,
  unfolds: readonly YardSetting[],
  seats: readonly Seat[],
): Seat | undefined {
  const byId = new Map(unfolds.map((held) => [held.id, held]));
  const visited = new Set<string>([setting.id]);
  for (let from = setting.from; from !== null && from !== undefined && !visited.has(from); ) {
    visited.add(from);
    const seat = seats.find((held) => held.setting.id === from);
    if (seat !== undefined) return seat;
    from = byId.get(from)?.from;
  }
  return undefined;
}

function besideCorner(space: Rect, corner: Rect): Rect {
  const { gap } = yardMetrics;
  const height = space.height - corner.height - gap;
  return corner.y === space.y
    ? { ...space, y: bottom(corner) + gap, height }
    : { ...space, height };
}

function seatedInTurn(
  viewport: Rect,
  unfolds: readonly YardSetting[],
  slots: readonly Slot[],
  reserved: readonly Rect[],
): Seat[] {
  const seats: Seat[] = [];
  const inner = innerOf(viewport);
  const free = (rect: Rect): boolean =>
    within(rect, inner) &&
    reserved.every((other) => !overlaps(rect, other)) &&
    seats.every((seat) => !overlaps(rect, seat.rect));
  const size = readableSize(viewport);
  const ids = new Set(unfolds.map((setting) => setting.id));
  for (const setting of inTurn(unfolds, ids)) {
    const seat = growsBeside(setting, ids)
      ? childSeat(size, setting, seats, slots, free)
      : seedSeat(setting, slots, seats, free);
    if (seat !== undefined) seats.push(seat);
  }
  return seats;
}

function inTurn(unfolds: readonly YardSetting[], ids: ReadonlySet<string>): YardSetting[] {
  const order: YardSetting[] = [];
  const taken = new Set<string>();
  const waiting = new Map<string, YardSetting[]>();
  const take = (setting: YardSetting): void => {
    order.push(setting);
    taken.add(setting.id);
    const children = waiting.get(setting.id) ?? [];
    waiting.delete(setting.id);
    for (const child of children) take(child);
  };
  for (const setting of unfolds.toSorted(byUnfolding)) {
    const parent = setting.from ?? "";
    if (!growsBeside(setting, ids) || taken.has(parent)) take(setting);
    else waiting.set(parent, [...(waiting.get(parent) ?? []), setting]);
  }
  return order;
}

function growsBeside(setting: YardSetting, ids: ReadonlySet<string>): boolean {
  return setting.unfolded?.lane !== undefined && ids.has(setting.from ?? "");
}

function seedSeat(
  setting: YardSetting,
  slots: readonly Slot[],
  seats: readonly Seat[],
  free: (rect: Rect) => boolean,
): Seat | undefined {
  const kept = keptRingSlot(setting, slots.length, seats);
  const slot = kept === undefined ? undefined : slots[kept];
  const rect = slot === undefined ? undefined : ringRects(setting, slot).find(free);
  if (kept !== undefined && slot !== undefined && rect !== undefined) {
    return { setting, rect, side: slot.side, slot: kept, lane: undefined };
  }
  return onTheRing(setting, slots, seats, free, undefined);
}

function childSeat(
  size: Extent,
  setting: YardSetting,
  seats: readonly Seat[],
  slots: readonly Slot[],
  free: (rect: Rect) => boolean,
): Seat | undefined {
  const parent = parentSeatOf(setting, seats);
  if (parent === undefined) return undefined;
  return (
    besideParent(size, setting, parent, free) ?? onTheRing(setting, slots, seats, free, parent)
  );
}

function keptRingSlot(
  setting: YardSetting,
  count: number,
  seats: readonly Seat[],
): number | undefined {
  const unfolded = setting.unfolded;
  if (unfolded === undefined || unfolded.lane !== undefined || unfolded.slot >= count) {
    return undefined;
  }
  return seats.some((seat) => seat.slot === unfolded.slot) ? undefined : unfolded.slot;
}

function ringRects(setting: YardSetting, slot: Slot): Rect[] {
  const code = codeKinds.has(setting.what.kind);
  return [...(code && slot.wide !== undefined ? [slot.wide] : []), slot.rect];
}

function besideParent(
  size: Extent,
  setting: YardSetting,
  parent: Seat,
  free: (rect: Rect) => boolean,
): Seat | undefined {
  const own = setting.unfolded?.lane;
  if (own === undefined) return undefined;
  const tried = [own, ...[...childLanes.keys()].filter((lane) => lane !== own)];
  const code = codeKinds.has(setting.what.kind);
  return firstOf(tried, (lane) => {
    const floor = laneRect(parent, lane, size);
    if (floor === undefined) return undefined;
    const rect = [...(code ? [widenedAway(floor, parent.side)] : []), floor].find(free);
    return rect === undefined
      ? undefined
      : { setting, rect, side: parent.side, slot: undefined, lane };
  });
}

function onTheRing(
  setting: YardSetting,
  slots: readonly Slot[],
  seats: readonly Seat[],
  free: (rect: Rect) => boolean,
  parent: Seat | undefined,
): Seat | undefined {
  const own = setting.unfolded?.slot;
  const open = [...slots.keys()].filter((index) => !seats.some((seat) => seat.slot === index));
  const nearness = (index: number): number => {
    const slot = slots[index];
    return parent === undefined || slot === undefined ? 0 : distance(slot.rect, parent.rect);
  };
  const tried = open.toSorted(
    (a, b) => nearness(a) - nearness(b) || Number(b === own) - Number(a === own) || a - b,
  );
  return firstOf(tried, (index) => {
    const slot = slots[index];
    const rect = slot === undefined ? undefined : ringRects(setting, slot).find(free);
    return slot === undefined || rect === undefined
      ? undefined
      : { setting, rect, side: slot.side, slot: index, lane: undefined };
  });
}

function parentSeatOf(setting: YardSetting, seats: readonly Seat[]): Seat | undefined {
  return seats.find((seat) => seat.setting.id === setting.from);
}

function laneRect(parent: Position, lane: number, size: Extent): Rect | undefined {
  const { gap } = yardMetrics;
  const { rect, side } = parent;
  const { width, height } = size;
  const horizontal = side === "right" || side === "left";
  const hubEdgeX = side === "left" ? right(rect) - width : rect.x;
  const hubEdgeY = side === "above" ? bottom(rect) - height : rect.y;
  const at = (x: number, y: number): Rect => ({ x, y, width, height });
  switch (childLanes[lane]) {
    case "outward":
      if (side === "right") return at(right(rect) + gap, rect.y);
      if (side === "left") return at(rect.x - gap - width, rect.y);
      if (side === "below") return at(rect.x, bottom(rect) + gap);
      return at(rect.x, rect.y - gap - height);
    case "after":
      return horizontal ? at(hubEdgeX, bottom(rect) + gap) : at(right(rect) + gap, hubEdgeY);
    case "before":
      return horizontal ? at(hubEdgeX, rect.y - gap - height) : at(rect.x - gap - width, hubEdgeY);
    case undefined:
      return undefined;
  }
}

function widenedAway(rect: Rect, side: Side): Rect {
  if (codeWidth <= rect.width) return rect;
  return side === "left"
    ? { ...rect, x: right(rect) - codeWidth, width: codeWidth }
    : { ...rect, width: codeWidth };
}

function sizedSeats(
  viewport: Rect,
  seats: readonly Seat[],
  reserved: readonly Rect[],
  inside: string | undefined,
): Sized[] {
  const precedence = seats.toSorted((a, b) => claimsSpaceFirst(a.setting, b.setting, inside));
  const inner = innerOf(viewport);
  const grown = new Map<Seat, Rect>();
  precedence.forEach((seat, rank) => {
    if (sizeOf(seat.setting) !== "working") return;
    const before = precedence.slice(0, rank);
    if (before.some((other) => overlapsGrown(grown, other, seat.rect))) return;
    const obstacles = [...reserved, ...before.map((other) => grown.get(other) ?? other.rect)];
    const rect = grownAway(seat, obstacles, inner);
    if (area(rect) >= yardMetrics.working.areaShare * area(seat.rect)) grown.set(seat, rect);
  });
  return seats.flatMap((seat): Sized[] => {
    const working = grown.get(seat);
    if (working !== undefined) return [{ seat, rect: working, size: "working" }];
    const intruders = [...grown.values()].filter((rect) => overlaps(rect, seat.rect));
    if (intruders.length === 0) return [{ seat, rect: seat.rect, size: "readable" }];
    const corner = cornersOf(seat).find((rect) =>
      intruders.every((other) => !overlaps(rect, other)),
    );
    return corner === undefined ? [] : [{ seat, rect: corner, size: "card" }];
  });
}

function claimsSpaceFirst(a: YardSetting, b: YardSetting, inside: string | undefined): number {
  return (
    Number(b.id === inside) - Number(a.id === inside) ||
    lateClaimOf(a) - lateClaimOf(b) ||
    byDepth(a, b)
  );
}

function lateClaimOf(setting: YardSetting): number {
  return onItsHeadStart(setting) ? (setting.unfolded?.at ?? 0) : 0;
}

function overlapsGrown(grown: ReadonlyMap<Seat, Rect>, seat: Seat, rect: Rect): boolean {
  const held = grown.get(seat);
  return held !== undefined && overlaps(held, rect);
}

function cornersOf(seat: Position): Rect[] {
  const { rect, side } = seat;
  const left = rect.x;
  const farRight = right(rect) - cardSize.width;
  const top = rect.y;
  const low = bottom(rect) - cardSize.height;
  const facing = { x: side === "left" ? farRight : left, y: side === "above" ? low : top };
  const corners = [left, farRight].flatMap((x) => [top, low].map((y) => ({ x, y })));
  return [facing, ...corners.filter(({ x, y }) => x !== facing.x || y !== facing.y)].map(
    ({ x, y }) => ({ x, y, ...cardSize }),
  );
}

type Edge = "right" | "left" | "bottom" | "top";

const codeGrowth: Readonly<Record<Side, readonly Edge[]>> = {
  right: ["right", "bottom", "top"],
  left: ["left", "bottom", "top"],
  below: ["right", "left", "bottom"],
  above: ["right", "left", "top"],
};

const proseGrowth: Readonly<Record<Side, readonly Edge[]>> = {
  right: ["bottom", "top", "right"],
  left: ["bottom", "top", "left"],
  below: ["bottom", "right", "left"],
  above: ["top", "right", "left"],
};

function grownAway(seat: Seat, obstacles: readonly Rect[], inner: Rect): Rect {
  const growth = codeKinds.has(seat.setting.what.kind) ? codeGrowth : proseGrowth;
  return growth[seat.side].reduce(
    (rect, edge) => grownEdge(rect, edge, obstacles, inner),
    seat.rect,
  );
}

function grownEdge(rect: Rect, edge: Edge, obstacles: readonly Rect[], inner: Rect): Rect {
  const { gap } = yardMetrics;
  const acrossY = obstacles.filter((other) => other.y < bottom(rect) && bottom(other) > rect.y);
  const acrossX = obstacles.filter((other) => other.x < right(rect) && right(other) > rect.x);
  switch (edge) {
    case "right": {
      const stops = acrossY.filter((other) => other.x >= right(rect)).map((other) => other.x - gap);
      const limit = Math.min(right(inner), ...stops);
      return { ...rect, width: Math.max(rect.width, limit - rect.x) };
    }
    case "left": {
      const stops = acrossY
        .filter((other) => right(other) <= rect.x)
        .map((other) => right(other) + gap);
      const x = Math.min(rect.x, Math.max(inner.x, ...stops));
      return { ...rect, x, width: right(rect) - x };
    }
    case "bottom": {
      const stops = acrossX
        .filter((other) => other.y >= bottom(rect))
        .map((other) => other.y - gap);
      const limit = Math.min(bottom(inner), ...stops);
      return { ...rect, height: Math.max(rect.height, limit - rect.y) };
    }
    case "top": {
      const stops = acrossX
        .filter((other) => bottom(other) <= rect.y)
        .map((other) => bottom(other) + gap);
      const y = Math.min(rect.y, Math.max(inner.y, ...stops));
      return { ...rect, y, height: bottom(rect) - y };
    }
  }
}

function inTrailOrder(sized: readonly Sized[]): Sized[] {
  const ids = new Set(sized.map(({ seat }) => seat.setting.id));
  const besideParent = ({ seat }: Sized): boolean =>
    seat.lane !== undefined && seat.slot === undefined && ids.has(seat.setting.from ?? "");
  const besideOf = (parent: string): Sized[] =>
    sized
      .filter((held) => besideParent(held) && held.seat.setting.from === parent)
      .toSorted((a, b) => (a.seat.lane ?? 0) - (b.seat.lane ?? 0));
  const walk = (held: Sized): Sized[] => [held, ...besideOf(held.seat.setting.id).flatMap(walk)];
  return sized
    .filter((held) => !besideParent(held))
    .toSorted(
      (a, b) =>
        (a.seat.slot ?? Number.POSITIVE_INFINITY) - (b.seat.slot ?? Number.POSITIVE_INFINITY) ||
        byDepth(a.seat.setting, b.seat.setting),
    )
    .flatMap(walk);
}

function byUnfolding(a: YardSetting, b: YardSetting): number {
  const since = (setting: YardSetting): number => setting.unfolded?.at ?? Number.POSITIVE_INFINITY;
  return since(a) === since(b) ? byDepth(a, b) : since(a) - since(b);
}

function railEntriesOf(
  cards: readonly YardSetting[],
  plots: readonly PlotCard[],
): readonly RailEntry[] {
  return [...cards, ...plots].map(({ id, depth, at }) => ({ id, depth, at })).sort(byDepth);
}

function railPlacements(rail: Rail | undefined, entries: readonly RailEntry[]): Placement[] {
  if (rail === undefined) return [];
  const onRail = (id: string, rect: Rect): Placement => placed(id, rect, "card", "front", "card");
  const shown = rail.cards.flatMap((rect, index) => {
    const entry = entries[index];
    return entry === undefined ? [] : [onRail(entry.id, rect)];
  });
  const folds = entries.length > shown.length ? [onRail(yardIds.fold, rail.fold)] : [];
  return [onRail(yardIds.card, rail.head), ...shown, ...folds];
}

function withParents(
  placements: readonly Placement[],
  settings: readonly YardSetting[],
): readonly Placement[] {
  const shown = new Set(placements.map((placement) => placement.id));
  const fromOf = new Map(settings.map((setting) => [setting.id, setting.from]));
  return placements.map((placement) => {
    const from = fromOf.get(plotSeedOf(placement.id) ?? placement.id);
    const parent =
      from === null || from === undefined || from === placement.id || !shown.has(from)
        ? null
        : from;
    return parent === placement.parent ? placement : { ...placement, parent };
  });
}

function placed(
  id: string,
  rect: Rect,
  rung: Placement["rung"],
  layer: Placement["layer"],
  size: Size,
): Placement {
  return { id, rect, rung, layer, size, parent: null };
}

function ringSlots(viewport: Rect, hub: Rect, reserved: readonly Rect[]): readonly Slot[] {
  const size = readableSize(viewport);
  const floors: Position[] = [];
  while (floors.length < yardMetrics.slots) {
    const taken = [...reserved, ...floors.map((floor) => floor.rect)];
    const next = besideHub(viewport, hub, size, taken);
    if (next === undefined) break;
    floors.push(next);
  }
  const slots: Slot[] = [];
  for (const floor of floors) {
    const others = floors.filter((other) => other !== floor).map((other) => other.rect);
    const wides = slots.flatMap((slot) => (slot.wide === undefined ? [] : [slot.wide]));
    slots.push({
      ...floor,
      wide: widened(viewport, hub, floor, [...reserved, ...others, ...wides]),
    });
  }
  return slots;
}

function widened(
  viewport: Rect,
  hub: Rect,
  floor: Position,
  blocked: readonly Rect[],
): Rect | undefined {
  const { rect, side } = floor;
  if (codeWidth <= rect.width) return undefined;
  const inner = innerOf(viewport);
  const growingRight = { ...rect, width: codeWidth };
  const growingLeft = { ...rect, x: right(rect) - codeWidth, width: codeWidth };
  const awayFromHub: Readonly<Record<Side, readonly Rect[]>> = {
    right: [growingRight],
    left: [growingLeft],
    below: [growingRight, growingLeft],
    above: [growingRight, growingLeft],
  };
  return awayFromHub[side].find(
    (wide) =>
      within(wide, inner) &&
      adjacent(wide, hub, side) &&
      blocked.every((other) => !overlaps(wide, other)),
  );
}

function railBeside(viewport: Rect, hub: Rect): Rail | undefined {
  const { gap, rail } = yardMetrics;
  const inner = innerOf(viewport);
  const top = Math.max(hub.y, inner.y);
  const x = clamp(hub.x, inner.x, right(inner) - rail.width);
  const stacks: Readonly<Record<Side, () => Rail | undefined>> = {
    right: () => railStack(right(hub) + gap, top, bottom(inner) - top),
    left: () => railStack(hub.x - gap - rail.width, top, bottom(inner) - top),
    below: () => railStack(x, bottom(hub) + gap, bottom(inner) - bottom(hub) - gap),
    above: () => {
      const stack = railStack(x, inner.y, hub.y - gap - inner.y);
      return stack === undefined ? undefined : shifted(stack, hub.y - gap - bottom(stack.region));
    },
  };
  const fits = (stack: Rail, side: Side): boolean =>
    within(stack.region, inner) &&
    adjacent(stack.region, hub, side) &&
    !overlaps(stack.region, hub);
  return firstOf(ring, (side) => {
    const stack = stacks[side]();
    return stack !== undefined && fits(stack, side) ? stack : undefined;
  });
}

function railStack(x: number, y: number, available: number): Rail | undefined {
  const { gap, rail } = yardMetrics;
  const bare = rail.head + gap + rail.fold;
  if (available < bare) return undefined;
  const slots = Math.min(rail.length, Math.floor((available - bare) / (rail.card + gap)));
  const first = y + rail.head + gap;
  const cards = Array.from({ length: slots }, (_, index) => ({
    x,
    y: first + index * (rail.card + gap),
    width: rail.width,
    height: rail.card,
  }));
  const foldY = first + slots * (rail.card + gap);
  return {
    head: { x, y, width: rail.width, height: rail.head },
    cards,
    fold: { x, y: foldY, width: rail.width, height: rail.fold },
    region: { x, y, width: rail.width, height: foldY + rail.fold - y },
  };
}

function shifted(stack: Rail, dy: number): Rail {
  const move = (rect: Rect): Rect => ({ ...rect, y: rect.y + dy });
  return {
    head: move(stack.head),
    cards: stack.cards.map(move),
    fold: move(stack.fold),
    region: move(stack.region),
  };
}

function besideHub(
  viewport: Rect,
  hub: Rect,
  size: Extent,
  taken: readonly Rect[],
): Position | undefined {
  const inner = innerOf(viewport);
  const fits = (rect: Rect, side: Side): boolean =>
    within(rect, inner) &&
    adjacent(rect, hub, side) &&
    taken.every((other) => !overlaps(rect, other));
  return firstOf(ring, (side) => {
    const rect = candidatesOn(side, inner, hub, size, taken).find((held) => fits(held, side));
    return rect === undefined ? undefined : { rect, side };
  });
}

function candidatesOn(
  side: Side,
  inner: Rect,
  hub: Rect,
  size: Extent,
  taken: readonly Rect[],
): Rect[] {
  const { gap } = yardMetrics;
  const { width, height } = size;
  const rectAt = (x: number, y: number): Rect => ({ x, y, width, height });
  const cornersFirst = (lo: number, hi: number, starts: readonly number[]): number[] =>
    unique(starts.map((start) => clamp(start, lo, hi)));
  const ys = cornersFirst(inner.y, bottom(inner) - height, [
    hub.y,
    bottom(hub) - height,
    ...taken.map((rect) => bottom(rect) + gap),
    inner.y,
  ]);
  const xs = cornersFirst(inner.x, right(inner) - width, [
    hub.x,
    right(hub) - width,
    ...taken.map((rect) => right(rect) + gap),
    inner.x,
  ]);
  const nearestFirst = (edges: readonly number[], outwardOf: (edge: number) => number): number[] =>
    unique(edges)
      .filter((edge) => outwardOf(edge) >= 0)
      .sort((a, b) => outwardOf(a) - outwardOf(b));
  const flipped = (y: number, x: number): Rect => rectAt(x, y);
  switch (side) {
    case "right": {
      const nearest = right(hub) + gap;
      const edges = [nearest, ...taken.map((rect) => right(rect) + gap)];
      return grid(
        nearestFirst(edges, (x) => x - nearest),
        ys,
        rectAt,
      );
    }
    case "left": {
      const nearest = hub.x - gap - width;
      const edges = [nearest, ...taken.map((rect) => rect.x - gap - width)];
      return grid(
        nearestFirst(edges, (x) => nearest - x),
        ys,
        rectAt,
      );
    }
    case "below": {
      const nearest = bottom(hub) + gap;
      const edges = [nearest, ...taken.map((rect) => bottom(rect) + gap)];
      return grid(
        nearestFirst(edges, (y) => y - nearest),
        xs,
        flipped,
      );
    }
    case "above": {
      const nearest = hub.y - gap - height;
      const edges = [nearest, ...taken.map((rect) => rect.y - gap - height)];
      return grid(
        nearestFirst(edges, (y) => nearest - y),
        xs,
        flipped,
      );
    }
  }
}

function grid(
  outward: readonly number[],
  along: readonly number[],
  rectAt: (outward: number, along: number) => Rect,
): Rect[] {
  return outward.flatMap((a) => along.map((b) => rectAt(a, b)));
}

function adjacent(rect: Rect, hub: Rect, side: Side): boolean {
  if (side === "right" || side === "left") return rect.y < bottom(hub) && bottom(rect) > hub.y;
  return rect.x < right(hub) && right(rect) > hub.x;
}

function within(rect: Rect, bounds: Rect): boolean {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    right(rect) <= right(bounds) &&
    bottom(rect) <= bottom(bounds)
  );
}

function innerOf(viewport: Rect): Rect {
  const { margin } = yardMetrics;
  return {
    x: viewport.x + margin,
    y: viewport.y + margin,
    width: Math.max(0, viewport.width - 2 * margin),
    height: Math.max(0, viewport.height - 2 * margin),
  };
}

function firstOf<T, R>(items: readonly T[], attempt: (item: T) => R | undefined): R | undefined {
  for (const item of items) {
    const found = attempt(item);
    if (found !== undefined) return found;
  }
  return undefined;
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function centerX(rect: Rect): number {
  return rect.x + rect.width / 2;
}

function centerY(rect: Rect): number {
  return rect.y + rect.height / 2;
}

function distance(a: Rect, b: Rect): number {
  return Math.hypot(centerX(a) - centerX(b), centerY(a) - centerY(b));
}

function area(rect: Rect): number {
  return rect.width * rect.height;
}

function right(rect: Rect): number {
  return rect.x + rect.width;
}

function bottom(rect: Rect): number {
  return rect.y + rect.height;
}
