import { describe, expect, it } from "vitest";
import { raisedEye, restCamera } from "./camera.ts";
import { type DrawList, drawList, type Hit, type Quad, viewOf } from "./draw-list.ts";
import { covers, hitAt } from "./hit.ts";
import { neonKit } from "./kits/index.ts";
import { blockScene } from "./scene.ts";
import { noon, plotProjects, sketchPartnerships, sketchTown, slugOf } from "./testing.ts";

describe("what is under the pointer", () => {
  const world = blockScene(sketchTown(5), {
    kit: neonKit,
    appearance: "night",
    now: noon,
    partnerships: sketchPartnerships(5),
    projects: { [slugOf(3)]: plotProjects(3) },
  }).world;

  it("finds a creature, a workshop by its face, a shed, the storehouse, the mill and the house", () => {
    const seen = new Set<string>();
    for (const quarter of [0, 1, 2, 3]) {
      const list = drawList(
        world,
        restCamera(quarter, raisedEye),
        viewOf(world, 1008, 580, raisedEye),
      );
      for (const hit of reachableHits(list)) {
        seen.add(hit.target.kind === "workshop" ? `workshop ${hit.meaning}` : hit.target.kind);
      }
    }
    expect([...seen].sort()).toEqual([
      "creature",
      "house",
      "mill",
      "shed",
      "storehouse",
      "workshop bench",
      "workshop board",
      "workshop door",
      "workshop shelf",
      "workshop undefined",
    ]);
  });

  it("names the creature whose figure it is, and passes through the empty corners of a sprite", () => {
    const list = drawList(world, restCamera(0, raisedEye), viewOf(world, 1008, 580, raisedEye));
    const figure = list.quads.find(
      (quad) => quad.hit?.target.kind === "creature" && quad.hit.target.creature === slugOf(1),
    );
    if (figure === undefined) throw new Error("wren's figure was not drawn");
    const [, , , , left, top] = figure.matrix;
    expect(covers(figure, left + 0.5, top + 0.5)).toBe(false);
    const inside = reachableHits(list).find(
      (hit) => hit.target.kind === "creature" && hit.target.creature === slugOf(1),
    );
    expect(inside).toBeDefined();
  });

  it("finds nothing off the world", () => {
    const list = drawList(world, restCamera(0, raisedEye), viewOf(world, 1008, 580, raisedEye));
    expect(hitAt(list, -50, -50)).toBeUndefined();
  });
});

function reachableHits(list: DrawList): Hit[] {
  const hits: Hit[] = [];
  for (const quad of list.quads) {
    if (quad.hit === undefined) continue;
    const point = visiblePoint(list, quad);
    if (point !== undefined) hits.push(point);
  }
  return hits;
}

function visiblePoint(list: DrawList, quad: Quad): Hit | undefined {
  const [a, b, c, d, e, f] = quad.matrix;
  for (let v = 0.5; v < quad.height; v += 1) {
    for (let u = 0.5; u < quad.width; u += 1) {
      const x = e + a * u + c * v;
      const y = f + b * u + d * v;
      if (!covers(quad, x, y)) continue;
      const found = hitAt(list, x, y);
      if (found === quad.hit) return found;
    }
  }
  return undefined;
}
