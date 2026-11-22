import { describe, expect, it } from "vitest";
import type { HabitatState } from "../world/types.ts";
import { kits } from "./kits/index.ts";
import type { BlockWorld, Box, Part } from "./model.ts";
import { blockScene, residentsOf } from "./scene.ts";
import { noon, sketchPartnerships, sketchTown, slugOf } from "./testing.ts";

const whole = sketchTown(40);

describe("growth", () => {
  for (const kit of kits) {
    it(`${kit.id}: never moves or repaints anything already built when a creature is added, from 1 to 40`, () => {
      let before = built(kit, 1);
      for (let count = 2; count <= 40; count += 1) {
        const after = built(kit, count);
        expect(missingFrom(after, before), `adding creature ${count}`).toEqual([]);
        for (const slug of slugs(count - 1)) {
          expect(buildingOf(after, slug), `${slug}'s workshop at ${count}`).toEqual(
            buildingOf(before, slug),
          );
        }
        expect(lostRoad(before, after), `roads at ${count}`).toEqual([]);
        before = after;
      }
    });
  }

  it("gives each creature the same plot however many arrive after it", () => {
    const kit = kits[0];
    if (kit === undefined) throw new Error("no kit");
    const early = residentsOf(firstOf(5), kit);
    const late = residentsOf(firstOf(40), kit);
    expect(late.slice(0, 5)).toEqual(early);
    expect(new Set(late.map((resident) => `${resident.cell.cx},${resident.cell.cz}`)).size).toBe(
      40,
    );
  });
});

function built(kit: (typeof kits)[number], count: number): BlockWorld {
  return blockScene(firstOf(count), {
    kit,
    appearance: "night",
    now: noon,
    partnerships: sketchPartnerships(count),
  }).world;
}

function firstOf(count: number): HabitatState {
  const kept = new Set(slugs(count));
  return {
    ...whole,
    creatures: Object.fromEntries(
      Object.entries(whole.creatures).filter(([slug]) => kept.has(slug)),
    ),
    threads: Object.fromEntries(
      Object.entries(whole.threads).filter(([, thread]) => kept.has(thread.creature ?? "")),
    ),
    gates: Object.fromEntries(
      Object.entries(whole.gates).filter(([, gate]) => kept.has(gate.creature)),
    ),
  };
}

function slugs(count: number): string[] {
  return Array.from({ length: count }, (_, index) => slugOf(index));
}

function missingFrom(after: BlockWorld, before: BlockWorld): string[] {
  const present = new Set(geometries(after));
  return geometries(before).filter((geometry) => !present.has(geometry));
}

function geometries(world: BlockWorld): string[] {
  return world.cells.flatMap((cell) => [
    ...cell.ground.map((box) => `ground ${extent(box)}`),
    ...cell.items
      .filter((item) => item.what !== "road-lamp")
      .flatMap((item) => item.parts.map(geometryOf)),
  ]);
}

function geometryOf(part: Part): string {
  if ("box" in part) return `box ${extent(part.box)}`;
  const { x, y, z, left, top } = part.sprite;
  return `sprite ${x},${y},${z} ${left},${top}`;
}

function extent(box: Box): string {
  return `${box.x0},${box.x1},${box.y0},${box.y1},${box.z0},${box.z1}`;
}

function buildingOf(world: BlockWorld, slug: string): string[] {
  return world.cells.flatMap((cell) =>
    cell.items
      .filter((item) => item.target?.kind === "workshop" && item.target.creature === slug)
      .flatMap((item) => [...item.parts, ...(item.crown ?? []).map((crowned) => crowned.part)])
      .map((part) =>
        "box" in part
          ? `${extent(part.box)} ${Object.entries(part.box.faces)
              .map(
                ([face, paint]) => `${face}:${"texture" in paint ? paint.texture.key : paint.fill}`,
              )
              .join(" ")}`
          : `${geometryOf(part)} ${part.sprite.frames.map((frame) => frame.key).join(" ")}`,
      ),
  );
}

function lostRoad(before: BlockWorld, after: BlockWorld): string[] {
  const roads = (world: BlockWorld) =>
    new Map(
      world.cells.map((cell) => {
        const top = cell.ground.find((box) => box.y1 === 0)?.faces.top;
        const count =
          top !== undefined && "texture" in top
            ? [...top.texture.indices].filter((index) =>
                /^(path|cobble)/.test(top.texture.roles[index - 1] ?? ""),
              ).length
            : 0;
        return [`${cell.cx},${cell.cz}`, count] as const;
      }),
    );
  const was = roads(before);
  const now = roads(after);
  return [...was.entries()].flatMap(([cell, pixels]) =>
    (now.get(cell) ?? 0) < pixels ? [`${cell}: ${pixels} road texels became ${now.get(cell)}`] : [],
  );
}
