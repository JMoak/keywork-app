import type { SteadPlace } from "@keywork-app/protocol";
import type { DrawList, Quad } from "./draw-list.ts";
import type { Target } from "./model.ts";

export interface ArtRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type PlaceRects = ReadonlyMap<string, ArtRect>;

export function placeRectsOf(list: DrawList): PlaceRects {
  const bounds = new Map<string, Bounds>();
  for (const quad of list.quads) {
    const place = quad.hit === undefined ? undefined : placeOfTarget(quad.hit.target);
    if (place === undefined) continue;
    const key = placeKey(place);
    bounds.set(key, widened(bounds.get(key), cornersOf(quad)));
  }
  return new Map([...bounds].map(([key, held]) => [key, rectOf(held)]));
}

export function rectOfPlace(rects: PlaceRects, place: SteadPlace): ArtRect | undefined {
  const own = rects.get(placeKey(place));
  if (own !== undefined || place.kind !== "project") return own;
  return rects.get(placeKey({ kind: "workshop", creature: place.creature }));
}

export function placeOfTarget(target: Target): SteadPlace | undefined {
  switch (target.kind) {
    case "workshop":
      return { kind: "workshop", creature: target.creature };
    case "shed":
      return { kind: "project", creature: target.creature, directory: target.project };
    case "house":
      return { kind: "porch" };
    case "storehouse":
      return { kind: "store" };
    case "mill":
      return { kind: "mill" };
    case "creature":
      return undefined;
  }
}

export function placeKey(place: SteadPlace): string {
  switch (place.kind) {
    case "workshop":
      return `workshop ${place.creature}`;
    case "project":
      return `project ${place.creature} ${forwardSlashed(place.directory)}`;
    default:
      return place.kind;
  }
}

export function samePlace(one: SteadPlace | undefined, other: SteadPlace | undefined): boolean {
  return one !== undefined && other !== undefined && placeKey(one) === placeKey(other);
}

interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

function cornersOf(quad: Quad): Bounds {
  const [a, b, c, d, e, f] = quad.matrix;
  const xs = [0, a * quad.width, c * quad.height, a * quad.width + c * quad.height].map(
    (x) => x + e,
  );
  const ys = [0, b * quad.width, d * quad.height, b * quad.width + d * quad.height].map(
    (y) => y + f,
  );
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function widened(held: Bounds | undefined, more: Bounds): Bounds {
  if (held === undefined) return more;
  return {
    left: Math.min(held.left, more.left),
    top: Math.min(held.top, more.top),
    right: Math.max(held.right, more.right),
    bottom: Math.max(held.bottom, more.bottom),
  };
}

function rectOf({ left, top, right, bottom }: Bounds): ArtRect {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function forwardSlashed(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
