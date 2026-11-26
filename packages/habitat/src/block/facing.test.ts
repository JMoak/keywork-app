import { describe, expect, it } from "vitest";
import { raisedEye, restCamera } from "./camera.ts";
import { type DrawList, drawList, viewOf, walkerAt } from "./draw-list.ts";
import { type Aspect, aspects } from "./figure-art.ts";
import { seenFrom } from "./figures.ts";
import { firstKit } from "./kits/index.ts";
import type { Part, Side } from "./model.ts";
import { blockScene } from "./scene.ts";
import { noon, sketchTown, slugOf } from "./testing.ts";

const fromEachRest: Readonly<Record<Side, readonly Aspect[]>> = {
  pz: ["front", "left", "back", "right"],
  px: ["right", "front", "left", "back"],
  nz: ["back", "right", "front", "left"],
  nx: ["left", "back", "right", "front"],
};

const residents: Readonly<Record<string, Side>> = {
  [slugOf(0)]: "px",
  [slugOf(1)]: "pz",
  [slugOf(3)]: "nx",
  [slugOf(4)]: "nz",
};

const travelling: readonly (readonly [dx: number, dz: number, facing: Side])[] = [
  [1, 0, "px"],
  [-1, 0, "nx"],
  [0, 1, "pz"],
  [0, -1, "nz"],
];

describe("which side of a creature the eye sees", () => {
  it("draws the right one of the eight for each way a creature faces, from each of the four rests, and a walker facing the way it walks", () => {
    const { world } = blockScene(sketchTown(5), { kit: firstKit, appearance: "night", now: noon });
    const view = viewOf(world, 1008, 580, raisedEye);
    for (const [quarter] of fromEachRest.pz.entries()) {
      const list = drawList(world, restCamera(quarter, raisedEye), view);
      for (const member of world.cast) {
        const facing = residents[member.slug];
        if (facing === undefined) throw new Error(`${member.slug} faces no way this case knows`);
        const seen = fromEachRest[facing][quarter] ?? "front";
        expect(
          bodyDrawn(list, member.slug),
          `${member.slug} facing ${facing}, quarter ${quarter}`,
        ).toBe(bodyOf(member.parts, seen, 0));
      }
    }
    expect(world.cast.map((member) => member.slug).sort()).toEqual(Object.keys(residents).sort());

    const [walker] = world.walkers;
    if (walker === undefined) throw new Error("nobody walks");
    const ways = new Set<Side>();
    for (const [quarter] of fromEachRest.pz.entries()) {
      for (let tick = 1; tick < 400; tick += 7) {
        const before = walkerAt(walker, tick - 1);
        const after = walkerAt(walker, tick + 1);
        const [, , facing] =
          travelling.find(
            ([dx, dz]) =>
              Math.sign(after.x - before.x) === dx && Math.sign(after.z - before.z) === dz,
          ) ?? [];
        if (facing === undefined) continue;
        const seen = fromEachRest[facing][quarter] ?? "front";
        const drawn = bodyDrawn(
          drawList(world, restCamera(quarter, raisedEye), view, tick),
          slugOf(2),
        );
        expect(
          [0, 1].map((bob) => bodyOf(walker.parts, seen, bob)),
          `tick ${tick}, walking toward ${facing}, quarter ${quarter}`,
        ).toContain(drawn);
        ways.add(facing);
      }
    }
    expect([...ways].sort()).toEqual(["nx", "px"]);
  });
});

function bodyDrawn(list: DrawList, slug: string): string | undefined {
  const body = list.quads.find(
    (quad) =>
      quad.hit?.target.kind === "creature" &&
      quad.hit.target.creature === slug &&
      "texture" in quad.paint,
  );
  return body !== undefined && "texture" in body.paint ? body.paint.texture.key : undefined;
}

function bodyOf(parts: readonly Part[], seen: Aspect, frame: number): string | undefined {
  const [body] = seenFrom(parts, aspects.indexOf(seen));
  return body !== undefined && "sprite" in body ? body.sprite.frames[frame]?.key : undefined;
}
