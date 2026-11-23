import { describe, expect, it } from "vitest";
import { levelEye, raisedEye, restCamera } from "./camera.ts";
import { type DrawList, drawList, type Quad, viewOf } from "./draw-list.ts";
import { covers } from "./hit.ts";
import { kits } from "./kits/index.ts";
import type { BlockWorld } from "./model.ts";
import { blockScene } from "./scene.ts";
import { noon, sketchPartnerships, sketchTown } from "./testing.ts";
import { opaqueAt } from "./texture.ts";

const views = [0, 1, 2, 3].flatMap((quarter) => [
  { quarter, corner: false },
  { quarter, corner: true },
]);

describe("the creatures of the town, from every side and every corner", () => {
  it("shows every creature in the frame of a town of 1, 5 and 9, and stands each one at home in the open", () => {
    for (const kit of kits) {
      for (const count of [1, 5, 9]) {
        const eye = count >= 3 ? raisedEye : levelEye;
        const world = blockScene(sketchTown(count), {
          kit,
          appearance: "night",
          now: noon,
          partnerships: sketchPartnerships(count),
        }).world;
        for (const { quarter, corner } of views) {
          const view = `${kit.id}, ${count} creatures, quarter ${quarter}${corner ? " corner" : ""}`;
          const list = drawList(
            world,
            restCamera(quarter, eye, corner),
            viewOf(world, 1008, 580, eye),
          );
          const seen = seenIn(list);
          for (const slug of everyone(world)) {
            const shown = seen.get(slug) ?? { body: 0, open: 0, through: 0 };
            expect(shown.open + shown.through, `${slug} in ${view}`).toBeGreaterThan(0);
          }
          for (const member of world.cast) {
            const shown = seen.get(member.slug) ?? { body: 1, open: 0, through: 0 };
            expect(shown.open / shown.body, `${member.slug} in ${view}`).toBeGreaterThanOrEqual(
              corner ? 0.1 : 0.5,
            );
          }
        }
      }
    }
  });
});

interface Seen {
  body: number;
  open: number;
  through: number;
}

function everyone(world: BlockWorld): string[] {
  return [
    ...world.cast.map((member) => member.slug),
    ...world.walkers.flatMap((walker) =>
      walker.target?.kind === "creature" ? [walker.target.creature] : [],
    ),
  ];
}

function seenIn(list: DrawList): Map<string, Seen> {
  const bounds = list.quads.map(boundsOf);
  const seen = new Map<string, Seen>();
  list.quads.forEach((quad, drawn) => {
    const target = quad.hit?.target;
    if (target?.kind !== "creature") return;
    const held = seen.get(target.creature) ?? { body: 0, open: 0, through: 0 };
    seen.set(target.creature, held);
    if (!("texture" in quad.paint)) {
      held.through += 1;
      return;
    }
    const texture = quad.paint.texture;
    const [, , , , left = 0, top = 0] = quad.matrix;
    const over = list.quads.filter((_, later) => {
      const box = bounds[later];
      return (
        later > drawn &&
        box !== undefined &&
        box.right > left &&
        box.left < left + texture.width &&
        box.bottom > top &&
        box.top < top + texture.height
      );
    });
    for (let v = 0; v < texture.height; v += 1) {
      for (let u = 0; u < texture.width; u += 1) {
        if (!opaqueAt(texture, u, v)) continue;
        held.body += 1;
        if (!over.some((nearer) => covers(nearer, left + u + 0.5, top + v + 0.5))) held.open += 1;
      }
    }
  });
  return seen;
}

function boundsOf(quad: Quad): { left: number; top: number; right: number; bottom: number } {
  const [a, b, c, d, e, f] = quad.matrix;
  const xs = [0, a * quad.width, c * quad.height, a * quad.width + c * quad.height];
  const ys = [0, b * quad.width, d * quad.height, b * quad.width + d * quad.height];
  return {
    left: e + Math.min(...xs),
    top: f + Math.min(...ys),
    right: e + Math.max(...xs),
    bottom: f + Math.max(...ys),
  };
}
