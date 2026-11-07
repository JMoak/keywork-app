import { describe, expect, it } from "vitest";
import { creatureReading } from "../creature/semantic.ts";
import { composeStead, inOrderOfRaising } from "../render/stead.ts";
import { project, withCreatures } from "./project.ts";
import { emptyHabitat } from "./types.ts";

const at = "2026-11-06T09:00:00.000Z";
const now = Date.parse(at) + 60_000;

describe("a paused creature", () => {
  it("reads paused from the summary and sits until the summary or the wire resumes it", () => {
    const seated = withCreatures(emptyHabitat(), [{ slug: "wren", name: "Wren", seed: 4 }], at);
    expect(creatureReading(seated, "wren", now).state).toBe("idle");
    const paused = withCreatures(seated, [{ slug: "wren", name: "Wren", paused: at }], at);
    expect(paused.creatures.wren?.paused).toBe(at);
    expect(paused.creatures.wren?.seed).toBe(4);
    expect(creatureReading(paused, "wren", now).state).toBe("paused");
    const resumed = project(paused, {
      id: 9,
      ts: at,
      type: "creature.changed",
      payload: { slug: "wren", change: "resumed" },
    });
    expect(resumed.creatures.wren?.paused).toBeUndefined();
    expect(creatureReading(resumed, "wren", now).state).toBe("idle");
    const pausedByTheWire = project(resumed, {
      id: 10,
      ts: at,
      type: "creature.changed",
      payload: { slug: "wren", change: "paused" },
    });
    expect(creatureReading(pausedByTheWire, "wren", now).state).toBe("paused");
    const stillWorking = withCreatures(pausedByTheWire, [{ slug: "wren", name: "Wren" }], at);
    expect(stillWorking.creatures.wren?.paused).toBe(at);
  });
});

describe("the stead with several creatures", () => {
  it("raises each workshop after the last, in the order the creatures were made, whatever their slugs", () => {
    const first = withCreatures(emptyHabitat(), [{ slug: "wren", name: "Wren" }], at);
    const second = withCreatures(first, [{ slug: "ada", name: "Ada" }], "2026-11-06T10:00:00.000Z");
    const third = withCreatures(
      second,
      [{ slug: "moss", name: "Moss" }],
      "2026-11-06T11:00:00.000Z",
    );
    expect(inOrderOfRaising(Object.values(third.creatures)).map((c) => c.slug)).toEqual([
      "wren",
      "ada",
      "moss",
    ]);
    const scene = composeStead(third, now);
    const doors = scene.hotspots
      .filter((spot) => spot.target.kind === "workshop")
      .map((spot) => ({
        x: spot.x,
        creature: spot.target.kind === "workshop" ? spot.target.creature : "",
      }));
    expect(doors.map((door) => door.creature)).toEqual(["wren", "ada", "moss"]);
    expect(doors[0]?.x).toBeLessThan(doors[1]?.x ?? 0);
    expect(doors[1]?.x).toBeLessThan(doors[2]?.x ?? 0);
    const withTwo = composeStead(second, now);
    const wrenBefore = withTwo.hotspots.find(
      (spot) => spot.target.kind === "workshop" && spot.target.creature === "wren",
    );
    expect(doors[0]?.x).toBe(wrenBefore?.x);
  });
});
