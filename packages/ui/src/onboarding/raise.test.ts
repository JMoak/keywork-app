import {
  type Creature,
  createCreature,
  emptyHabitat,
  hasLandmark,
  type Pose,
  poseOf,
  quietContext,
  step,
  withCreatures,
} from "@keywork-app/habitat";
import type { CreatureSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { seatCreatures } from "../panes/stead/habitat.ts";
import { loadSkin } from "../panes/stead/habitat-render.ts";

const t0 = Date.parse("2026-11-05T12:00:00.000Z");
const second = 1000;
const hour = 3600 * second;
const iso = (ms: number): string => new Date(ms).toISOString();

describe("the stead grows its first workshop when the creature is made", () => {
  it("raises the workshop once for a creature seated after it was made, and not on an old stead", () => {
    const made = withCreatures(
      emptyHabitat(),
      [{ slug: "wren", name: "Wren", skin: "kid" }],
      iso(t0 + 1),
    );
    expect(hasLandmark(made, "workshop", "wren")).toBe(true);
    expect(made.history.map((happening) => happening.kind)).toEqual(["raised", "first"]);
    const clips = clipsOf(trace(born(t0), made, t0, 8 * second));
    expect(clips).toContain("raise");
    expect(clips.filter((clip) => clip === "raise")).toHaveLength(1);
    expect(clipsOf(trace(born(t0 + hour), made, t0 + hour, 5 * second))).toEqual(["idle"]);
  });

  it("raises through the stead pane's own seating, at the time GET /creatures says the creature was made", () => {
    const seated = seatCreatures(emptyHabitat(), [onTheWire("wren", iso(t0 + 1))]);
    expect(seated.creatures.wren?.workshop.raisedAt).toBe(iso(t0 + 1));
    expect(clipsOf(trace(born(t0), seated, t0, 8 * second))).toContain("raise");
    const old = seatCreatures(emptyHabitat(), [onTheWire("wren", iso(t0 - hour))]);
    expect(clipsOf(trace(born(t0), old, t0, 5 * second))).toEqual(["idle"]);
  });
});

function onTheWire(slug: string, created: string): CreatureSummary {
  return {
    slug,
    name: slug,
    sigil: slug[0] ?? "c",
    created,
    skin: "kid",
    seed: 0,
    workshop: "host",
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    conversation: null,
    threads: 0,
  };
}

function born(at: number): Creature {
  const loaded = loadSkin("kid");
  if (!loaded.ok) throw new Error(loaded.faults.join("; "));
  return createCreature("wren", at, { rows: loaded.skin.rows, place: "bench" });
}

function trace(
  creature: Creature,
  world: ReturnType<typeof emptyHabitat>,
  from: number,
  ms: number,
): Pose[] {
  const poses: Pose[] = [];
  let current = creature;
  for (let at = from + 100; at <= from + ms; at += 100) {
    current = step(current, world, at, quietContext);
    poses.push(poseOf(current, { reducedMotion: false, tier: "ambient" }));
  }
  return poses;
}

function clipsOf(poses: readonly Pose[]): string[] {
  const names: string[] = [];
  for (const pose of poses) if (names.at(-1) !== pose.clip) names.push(pose.clip);
  return names;
}
