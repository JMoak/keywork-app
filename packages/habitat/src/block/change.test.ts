import { describe, expect, it } from "vitest";
import type { Raster } from "../render/raster.ts";
import { raisedEye, restCamera } from "./camera.ts";
import { changeFrame, changesBetween, ringFor, ringOver, risingCells } from "./change.ts";
import { drawList, projectorOf, viewOf } from "./draw-list.ts";
import { neonKit } from "./kits/index.ts";
import type { BlockWorld } from "./model.ts";
import { resolveBlockPalette } from "./palette.ts";
import { rasterizePicture } from "./raster.ts";
import { blockScene } from "./scene.ts";
import { noon, pageGround, sketchTown, slugOf } from "./testing.ts";

const camera = restCamera(0, raisedEye);
const palette = resolveBlockPalette(neonKit, "night", pageGround.night);
const glow = [255, 255, 255] as const;

describe("how a change arrives", () => {
  it("ends a new creature's arrival on exactly the still of the new town", () => {
    const before = townOf(4);
    const after = townOf(5);
    const [change] = changesBetween(before, after);
    expect(change).toMatchObject({ kind: "creature", creature: slugOf(4) });
    if (change === undefined) throw new Error("nothing changed");

    const view = viewOf(after, 1008, 580, raisedEye);
    const [x, y] = projectorOf(after, camera, view)(change.at.x, 0, change.at.z);
    const ring = ringFor(change, x, y, view.width / view.scale, view.height / view.scale);
    const frame = (elapsed: number) =>
      changeFrame(
        still(before),
        still(after, risingCells(change, elapsed)),
        ring,
        elapsed,
        view.scale,
        glow,
      );
    const settled = still(after);
    const over = ring.delayMs + ring.ms;

    expect(ringOver(ring, over)).toBe(true);
    expect(differing(frame(over), settled)).toBe(0);
    expect(differing(frame(over + 5_000), settled)).toBe(0);
    expect(differing(frame(0), settled)).toBeGreaterThan(0);
    expect(differing(frame(ring.delayMs + ring.ms / 4), settled)).toBeGreaterThan(0);
  });
});

function differing(one: Raster, other: Raster): number {
  if (one.width !== other.width || one.height !== other.height) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (let at = 0; at < one.rgba.length; at += 1) if (one.rgba[at] !== other.rgba[at]) count += 1;
  return count;
}

function townOf(count: number): BlockWorld {
  const town = sketchTown(5);
  const creatures = Object.fromEntries(Object.entries(town.creatures).slice(0, count));
  return blockScene({ ...town, creatures }, { kit: neonKit, appearance: "night", now: noon }).world;
}

function still(world: BlockWorld, lifts?: ReadonlyMap<string, number>): Raster {
  const list = drawList(world, camera, viewOf(world, 1008, 580, raisedEye), 0, 0, { lifts });
  return rasterizePicture({ list, backdrop: [], lights: [] }, palette);
}
