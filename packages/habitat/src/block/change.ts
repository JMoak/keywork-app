import type { Raster } from "../render/raster.ts";
import { overChannel } from "./colour.ts";
import { type BlockWorld, cellAt, cellKey, type Item, type Point } from "./model.ts";

export type TownChange =
  | { readonly kind: "creature"; readonly creature: string; readonly at: Point }
  | {
      readonly kind: "project";
      readonly creature: string;
      readonly project: string;
      readonly at: Point;
    }
  | {
      readonly kind: "stage";
      readonly creature: string;
      readonly project: string;
      readonly at: Point;
    };

export interface Ring {
  readonly x: number;
  readonly y: number;
  readonly from: number;
  readonly to: number;
  readonly local: boolean;
  readonly delayMs: number;
  readonly ms: number;
}

export type RingMark = (typeof ringMarks)[keyof typeof ringMarks];

export const ringMarks = { after: 0, before: 1, glow: 2, faintGlow: 3 } as const;
export const glowAlpha = { [ringMarks.glow]: 235, [ringMarks.faintGlow]: 110 } as const;
export const riseMs = 520;
export const riseFrom = 30;
export const riseSteps = 10;
export const ringSteps = 14;
export const wholePlace = { from: 44, delayMs: 440, ms: 1250, reach: 1.25 } as const;
export const nearby = { from: 5, to: 130, ms: 800 } as const;

export function changesBetween(before: BlockWorld, after: BlockWorld): TownChange[] {
  const stood = standingOf(before);
  const changes: TownChange[] = [];
  for (const [key, built] of standingOf(after)) {
    const target = built.item.target;
    const held = stood.get(key);
    if (target?.kind === "workshop" && held === undefined) {
      changes.push({ kind: "creature", creature: target.creature, at: built.item });
    }
    if (target?.kind !== "shed") continue;
    const founded = !stood.has(`workshop ${target.creature}`);
    if (held === undefined && !founded) {
      changes.push({
        kind: "project",
        creature: target.creature,
        project: target.project,
        at: built.item,
      });
    } else if (held !== undefined && built.height > held.height) {
      changes.push({
        kind: "stage",
        creature: target.creature,
        project: target.project,
        at: built.item,
      });
    }
  }
  const rank = { creature: 0, project: 1, stage: 2 } as const;
  return changes.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export function ringFor(
  change: TownChange,
  x: number,
  y: number,
  artWidth: number,
  artHeight: number,
): Ring {
  return change.kind === "creature"
    ? {
        x,
        y,
        from: wholePlace.from,
        to: Math.max(artWidth, artHeight) * wholePlace.reach,
        local: false,
        delayMs: wholePlace.delayMs,
        ms: wholePlace.ms,
      }
    : { x, y, from: nearby.from, to: nearby.to, local: true, delayMs: 0, ms: nearby.ms };
}

export function ringOver(ring: Ring, elapsed: number): boolean {
  return elapsed >= ring.delayMs + ring.ms;
}

export function ringStep(ring: Ring, elapsed: number): number {
  const share = (elapsed - ring.delayMs) / ring.ms;
  return share <= 0 ? -1 : Math.min(ringSteps, Math.floor(share * ringSteps));
}

export function ringMask(ring: Ring, elapsed: number, width: number, height: number): Uint8Array {
  const marks = new Uint8Array(width * height);
  if (ringOver(ring, elapsed)) return marks;
  const step = ringStep(ring, elapsed);
  const begun = step >= 0;
  const share = Math.max(0, step) / ringSteps;
  const eased = 1 - (1 - share) * (1 - share);
  const radius = ring.from + (ring.to - ring.from) * eased;
  const thin = ring.local ? 16 * (1 - share * 0.8) : 12;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - ring.x;
      const dy = (y - ring.y) * 2;
      const far = Math.sqrt(dx * dx + dy * dy);
      const grain = bayer[(y & 3) * 4 + (x & 3)] ?? 0;
      const edge = far - radius + (grain - 7.5) * 0.45;
      if (edge > 0) {
        if (!ring.local || far <= ring.to + 3) marks[y * width + x] = ringMarks.before;
      } else if (edge > -3 && begun && grain < thin) {
        marks[y * width + x] = edge > -1.4 ? ringMarks.glow : ringMarks.faintGlow;
      }
    }
  }
  return marks;
}

export function liftAt(elapsed: number): number {
  const share = elapsed / riseMs;
  if (share >= 1 || share < 0) return 0;
  const stepped = Math.floor(share * riseSteps) / riseSteps;
  return stepped > 0.85 ? -1 : Math.round((1 - stepped) * (1 - stepped) * riseFrom);
}

export function risingCells(change: TownChange, elapsed: number): ReadonlyMap<string, number> {
  const lift = change.kind === "creature" ? liftAt(elapsed) : 0;
  return lift === 0 ? still : new Map([[cellKey(cellAt(change.at.x, change.at.z)), lift]]);
}

export function changeFrame(
  before: Raster,
  after: Raster,
  ring: Ring,
  elapsed: number,
  scale: number,
  glow: readonly [number, number, number],
): Raster {
  if (ringOver(ring, elapsed)) return after;
  const width = Math.ceil(after.width / scale);
  const marks = ringMask(ring, elapsed, width, Math.ceil(after.height / scale));
  const rgba = new Uint8ClampedArray(after.rgba);
  for (let y = 0; y < after.height; y += 1) {
    for (let x = 0; x < after.width; x += 1) {
      const mark = marks[Math.floor(y / scale) * width + Math.floor(x / scale)] ?? ringMarks.after;
      const at = (y * after.width + x) * 4;
      if (mark === ringMarks.before) {
        if (x < before.width && y < before.height) {
          const from = (y * before.width + x) * 4;
          rgba.set(before.rgba.subarray(from, from + 4), at);
        }
      } else if (mark === ringMarks.glow || mark === ringMarks.faintGlow) {
        for (let channel = 0; channel < 3; channel += 1) {
          rgba[at + channel] = overChannel(
            rgba[at + channel] ?? 0,
            glow[channel] ?? 0,
            glowAlpha[mark],
          );
        }
      }
    }
  }
  return { width: after.width, height: after.height, rgba };
}

interface Standing {
  readonly item: Item;
  readonly height: number;
}

const still: ReadonlyMap<string, number> = new Map();
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function standingOf(world: BlockWorld): Map<string, Standing> {
  const standing = new Map<string, Standing>();
  for (const cell of world.cells) {
    for (const item of cell.items) {
      const target = item.target;
      if (target?.kind !== "workshop" && target?.kind !== "shed") continue;
      const key =
        target.kind === "workshop"
          ? `workshop ${target.creature}`
          : `shed ${target.creature} ${target.project}`;
      if (standing.has(key)) continue;
      standing.set(key, { item, height: heightOf(item) });
    }
  }
  return standing;
}

function heightOf(item: Item): number {
  return Math.max(0, ...item.parts.map((part) => ("box" in part ? part.box.y1 : 0)));
}
