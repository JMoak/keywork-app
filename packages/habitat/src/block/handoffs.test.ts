import type { CreatureHandoff, CreatureHandoffChange } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  handoffsFor,
  noHandoffs,
  partnershipsOf,
  roadGradeFor,
  tallyAfter,
  tallyOf,
} from "./handoffs.ts";
import { neonKit } from "./kits/index.ts";
import { doorSegment } from "./roads.ts";
import { blockScene, type Partnership } from "./scene.ts";
import { noon, sketchTown, slugOf } from "./testing.ts";

describe("roads from real hand-offs", () => {
  it("lays a trodden path from the first hand-off, a cart track from five and a paved road from twenty", () => {
    expect(handoffsFor).toEqual({ trodden: 1, cart: 5, paved: 20 });
    expect([0, 1, 4, 5, 19, 20, 400].map(roadGradeFor)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it("adds a pair's two directions together and leaves out a creature's hand-offs to itself", () => {
    const tally = tallyOf([
      handoff("wren", "pip", 3),
      handoff("pip", "wren", 2),
      handoff("ada", "bea", 1),
      handoff("bea", "bea", 40),
    ]);
    expect(partnershipsOf(tally)).toEqual([
      { between: ["pip", "wren"], handoffs: 5, grade: 2 },
      { between: ["ada", "bea"], handoffs: 1, grade: 1 },
    ]);
  });

  it("orders pairs busiest first, then by name, so a creature walks its busiest road", () => {
    const tally = tallyOf([handoff("c", "d", 2), handoff("a", "b", 2), handoff("e", "f", 30)]);
    expect(partnershipsOf(tally).map((pair) => pair.between.join("-"))).toEqual([
      "e-f",
      "a-b",
      "c-d",
    ]);
  });

  it("takes each counted change as the pair's whole count, and forgets a pair the engine drops", () => {
    const counted = [1, 2, 3].reduce(
      (tally, count) => tallyAfter(tally, change("counted", handoff("wren", "pip", count, count))),
      noHandoffs,
    );
    expect(Object.values(counted)).toEqual([handoff("wren", "pip", 3, 3)]);
    const dropped = tallyAfter(counted, change("dropped", handoff("wren", "pip", 3, 3)));
    expect(dropped).toEqual({});
    expect(tallyAfter(noHandoffs, change("dropped", handoff("wren", "pip", 3)))).toEqual({});
  });

  it("ignores a change older than the row it holds, so a cold start and the stream can meet in any order", () => {
    const listed = tallyOf([handoff("wren", "pip", 7, 7)]);
    expect(tallyAfter(listed, change("counted", handoff("wren", "pip", 6, 6)))).toBe(listed);
    expect(tallyAfter(listed, change("counted", handoff("wren", "pip", 7, 7)))).toEqual(listed);
    const madeAgain = tallyOf([handoff("wren", "pip", 1, 9)]);
    expect(tallyAfter(madeAgain, change("dropped", handoff("wren", "pip", 7, 7)))).toBe(madeAgain);
  });

  it("paves the road between two busy creatures and takes it up when the engine drops the pair", () => {
    const state = sketchTown(5);
    const busy = tallyOf([handoff(slugOf(0), slugOf(3), 12), handoff(slugOf(3), slugOf(0), 9)]);
    const paved = town(state, partnershipsOf(busy));
    expect(partnershipsOf(busy)).toMatchObject([{ grade: 3, handoffs: 21 }]);
    expect(lamps(paved)).toBeGreaterThan(0);

    const gone = [handoff(slugOf(0), slugOf(3), 12), handoff(slugOf(3), slugOf(0), 9)].reduce(
      (tally, row) => tallyAfter(tally, change("dropped", row)),
      busy,
    );
    const after = town(state, partnershipsOf(gone));
    const none = town(state, []);
    expect(after.roads.segments()).toEqual(none.roads.segments());
    expect(lamps(after)).toBe(0);
    for (const resident of after.residents) {
      const door = doorSegment({ cell: resident.cell, door: resident.door }).segment;
      expect(after.roads.gradeOf(door), resident.slug).toBe(1);
    }
  });
});

function handoff(from: string, to: string, count: number, minute = 0): CreatureHandoff {
  return { from, to, count, lastAt: new Date(Date.UTC(2026, 10, 22, 9, minute)).toISOString() };
}

function change(
  kind: CreatureHandoffChange["change"],
  row: CreatureHandoff,
): CreatureHandoffChange {
  return { change: kind, handoff: row };
}

function town(state: ReturnType<typeof sketchTown>, partnerships: readonly Partnership[]) {
  return blockScene(state, { kit: neonKit, appearance: "night", now: noon, partnerships });
}

function lamps(scene: ReturnType<typeof blockScene>): number {
  return scene.world.cells.flatMap((cell) => cell.items).filter((item) => item.what === "road-lamp")
    .length;
}
