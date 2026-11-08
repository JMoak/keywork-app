import type { SettingKind } from "@keywork-app/protocol";
import { byDepth } from "./depth.ts";
import {
  type Placement,
  type Rect,
  rankOf,
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
  slots: 6,
} as const;

export const yardIds = { hub: "yard:hub", card: "yard:card", fold: "yard:fold" } as const;

export type Side = "right" | "left" | "below" | "above";

export const ring: readonly Side[] = ["right", "left", "below", "above"];

export const codeKinds: ReadonlySet<SettingKind> = new Set<SettingKind>(["file", "diff"]);

export const codeWidth = Math.round(
  yardMetrics.code.columns * yardMetrics.code.column + yardMetrics.code.gutter,
);

export function placeYard(input: YardLayout): readonly Placement[] {
  const hub: Placement = { id: yardIds.hub, rect: input.hub, rung: "glyph", layer: "mid" };
  if (input.prefs.tier === "hidden") return [hub];
  const ladder = input.settings.filter(onTheLadder).toSorted(byDepth);
  if (ladder.length === 0) return [hub];
  return stagePlacements(input, ladder) ?? yardPlacements(input, hub, ladder);
}

export function foldedOf(
  placements: readonly Placement[],
  settings: readonly YardSetting[],
): readonly YardSetting[] {
  const placed = new Set(placements.map((placement) => placement.id));
  return settings
    .filter((setting) => onTheLadder(setting) && !placed.has(setting.id))
    .toSorted(byDepth);
}

export function readableSize(viewport: Rect): { readonly width: number; readonly height: number } {
  const { readable } = yardMetrics;
  const shortSide = Math.min(viewport.width, viewport.height);
  const height = Math.max(readable.height, Math.round(shortSide * readable.shortSideShare));
  return { width: Math.max(readable.width, Math.round(height * readable.aspect)), height };
}

export function unfoldWidth(kind: SettingKind, viewport: Rect): number {
  const floor = readableSize(viewport).width;
  return codeKinds.has(kind) ? Math.max(floor, codeWidth) : floor;
}

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

interface Rail {
  readonly head: Rect;
  readonly cards: readonly Rect[];
  readonly fold: Rect;
  readonly region: Rect;
}

interface Beside {
  readonly rect: Rect;
  readonly side: Side;
}

interface Slot extends Beside {
  readonly wide: Rect | undefined;
}

function onTheLadder(setting: YardSetting): boolean {
  return stillShown(setting) && rankOf(setting.shown) >= rankOf("card");
}

function stagePlacements(
  input: YardLayout,
  ladder: readonly YardSetting[],
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
  return [
    { id: yardIds.hub, rect: corner, rung: "glyph", layer: "front" },
    { id: staged.id, rect: stage, rung: "stage", layer: "back" },
    ...railPlacements(
      stack,
      ladder.filter((setting) => setting.id !== staged.id),
    ),
  ];
}

function yardPlacements(
  input: YardLayout,
  hub: Placement,
  ladder: readonly YardSetting[],
): readonly Placement[] {
  const rail = railBeside(input.viewport, input.hub);
  const reserved = rail === undefined ? [input.hub] : [input.hub, rail.region];
  const satellites = satellitesOf(input, ladder, reserved);
  const unfolded = new Set(satellites.map((placement) => placement.id));
  const cards = ladder.filter((setting) => !unfolded.has(setting.id));
  return [hub, ...satellites, ...railPlacements(rail, cards)];
}

function satellitesOf(
  input: YardLayout,
  ladder: readonly YardSetting[],
  reserved: readonly Rect[],
): Placement[] {
  const unfolds = ladder.filter((setting) => rankOf(setting.shown) >= rankOf("unfold"));
  if (unfolds.length === 0) return [];
  const slots = ringSlots(input.viewport, input.hub, reserved);
  return slotted(unfolds.slice(0, slots.length), slots.length).flatMap(([setting, index]) => {
    const slot = slots[index];
    if (slot === undefined) return [];
    const rect = codeKinds.has(setting.what.kind) ? (slot.wide ?? slot.rect) : slot.rect;
    return [{ id: setting.id, rect, rung: "unfold", layer: "mid", slot: index }];
  });
}

function ringSlots(viewport: Rect, hub: Rect, reserved: readonly Rect[]): readonly Slot[] {
  const size = readableSize(viewport);
  const floors: Beside[] = [];
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
  floor: Beside,
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

function slotted(
  chosen: readonly YardSetting[],
  count: number,
): readonly (readonly [YardSetting, number])[] {
  const kept = new Map<number, YardSetting>();
  for (const setting of chosen) {
    const slot = setting.unfolded?.slot;
    if (slot !== undefined && slot < count && !kept.has(slot)) kept.set(slot, setting);
  }
  const keeping = new Set(kept.values());
  const free = Array.from({ length: count }, (_, slot) => slot).filter((slot) => !kept.has(slot));
  const newcomers = chosen.filter((setting) => !keeping.has(setting)).toSorted(byUnfolding);
  return [
    ...[...kept].map(([slot, setting]) => [setting, slot] as const),
    ...newcomers.flatMap((setting, index) => {
      const slot = free[index];
      return slot === undefined ? [] : [[setting, slot] as const];
    }),
  ].sort(([, a], [, b]) => a - b);
}

function byUnfolding(a: YardSetting, b: YardSetting): number {
  const since = (setting: YardSetting): number => setting.unfolded?.at ?? Number.POSITIVE_INFINITY;
  return since(a) === since(b) ? byDepth(a, b) : since(a) - since(b);
}

function railPlacements(rail: Rail | undefined, cards: readonly YardSetting[]): Placement[] {
  if (rail === undefined) return [];
  const onRail = (id: string, rect: Rect): Placement => ({
    id,
    rect,
    rung: "card",
    layer: "front",
  });
  const shown = rail.cards.flatMap((rect, index) => {
    const setting = cards[index];
    return setting === undefined ? [] : [onRail(setting.id, rect)];
  });
  const folds = cards.length > shown.length ? [onRail(yardIds.fold, rail.fold)] : [];
  return [onRail(yardIds.card, rail.head), ...shown, ...folds];
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
  size: { readonly width: number; readonly height: number },
  taken: readonly Rect[],
): Beside | undefined {
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
  size: { readonly width: number; readonly height: number },
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

function right(rect: Rect): number {
  return rect.x + rect.width;
}

function bottom(rect: Rect): number {
  return rect.y + rect.height;
}
