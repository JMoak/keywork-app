import type { DockSide } from "./arrangement.ts";
import { contains, type Rect, type Screen } from "./geometry.ts";
import type { Regions } from "./scene.ts";
import { clamp, type PaneId, type SplitPath } from "./tree.ts";

export type SeamHandle =
  | { readonly kind: "split"; readonly path: SplitPath }
  | { readonly kind: "dock"; readonly side: DockSide };

export interface Seam {
  readonly handle: SeamHandle;
  readonly axis: "x" | "y";
  readonly at: number;
  readonly start: number;
  readonly end: number;
  readonly origin: number;
  readonly length: number;
}

export type DropZone = DockSide | "main";

export interface Scene {
  readonly screen: Screen;
  readonly rects: ReadonlyMap<PaneId, Rect>;
  readonly homes: ReadonlyMap<PaneId, DropZone>;
  readonly seams: readonly Seam[];
  readonly regions: Regions;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Hit =
  | { readonly kind: "seam"; readonly seam: Seam }
  | { readonly kind: "pane"; readonly id: PaneId };

export const seamReach = 4;
export const dropEdgeWidth = 64;

export function sameSeam(one: Seam | undefined, other: Seam | undefined): boolean {
  if (one === undefined || other === undefined) return false;
  const a = one.handle;
  const b = other.handle;
  if (a.kind === "dock") return b.kind === "dock" && a.side === b.side;
  if (b.kind === "dock") return false;
  return a.path.length === b.path.length && a.path.every((step, index) => step === b.path[index]);
}

export function hitAt(scene: Scene, point: Point): Hit | undefined {
  const seam = scene.seams.find((candidate) => contains(seamZoneRect(candidate), point.x, point.y));
  if (seam !== undefined) return { kind: "seam", seam };
  for (const [id, rect] of scene.rects) {
    if (contains(rect, point.x, point.y)) return { kind: "pane", id };
  }
  return undefined;
}

export function seamZoneRect(seam: Seam): Rect {
  const reach = seamReach * 2;
  return seam.axis === "x"
    ? { x: seam.at - seamReach, y: seam.start, width: reach, height: seam.end - seam.start }
    : { x: seam.start, y: seam.at - seamReach, width: seam.end - seam.start, height: reach };
}

export function ratioAlong(seam: Seam, point: Point): number {
  const along = seam.axis === "x" ? point.x : point.y;
  const fraction = (along - seam.origin) / seam.length;
  return clamp(
    seam.handle.kind === "dock" && seam.handle.side === "right" ? 1 - fraction : fraction,
    0,
    1,
  );
}

export function dropZoneRects(scene: Scene): Readonly<Record<DropZone, Rect>> {
  const { regions } = scene;
  const left = regions.left ?? edgeStrip(regions.main, "left");
  const right = regions.right ?? edgeStrip(regions.main, "right");
  const mainStart = regions.left === undefined ? left.x + left.width : regions.main.x;
  const mainEnd = regions.right === undefined ? right.x : regions.main.x + regions.main.width;
  return {
    left,
    right,
    main: { ...regions.main, x: mainStart, width: Math.max(0, mainEnd - mainStart) },
  };
}

export function dropZoneAt(scene: Scene, point: Point): DropZone | undefined {
  const zones = dropZoneRects(scene);
  return (["left", "right", "main"] as const).find((zone) =>
    contains(zones[zone], point.x, point.y),
  );
}

function edgeStrip(main: Rect, side: DockSide): Rect {
  const width = Math.min(dropEdgeWidth, Math.floor(main.width / 4));
  const x = side === "left" ? main.x : main.x + main.width - width;
  return { ...main, x, width };
}
