import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  bodyPose,
  createCreature,
  emptyHabitat,
  type HabitatState,
  type MotionPrefs,
  projectAll,
  quietContext,
  type StepContext,
  step,
} from "@keywork-app/habitat";
import { loadSkin } from "@keywork-app/habitat/skins";
import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { createMirror, followSnapshot, type Mirror } from "./beats.ts";
import { creatureSnapshot } from "./feed.ts";

const slug = "bea";
const tickMs = 250;
const tailMs = 90_000;
const ambient: MotionPrefs = { reducedMotion: false, tier: "ambient" };
const onlyAgentBeats: StepContext = { ...quietContext, doNotDisturb: true };

async function firstLight(): Promise<BusEnvelope[]> {
  const path = join(process.cwd(), "packages/habitat/src/world/fixtures/first-light.jsonl");
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

describe("the companion and the stead, driven from one world", () => {
  it("play the same clip at every tick of first light, and the same frame whenever a clip began together", async () => {
    const stream = await firstLight();
    const loaded = loadSkin("kid");
    if (!loaded.ok) throw new Error(loaded.faults.join("; "));
    const rows = loaded.skin.rows;
    const born = Date.parse(stream[0]?.ts ?? "") + 1;
    const last = Date.parse(stream[stream.length - 1]?.ts ?? "") + tailMs;
    const worldAt = (now: number): HabitatState =>
      projectAll(
        emptyHabitat(),
        stream.filter((envelope) => Date.parse(envelope.ts) <= now),
      );

    let onTheStead = createCreature(slug, born, { rows, place: "bench" });
    let floating: Mirror = createMirror(born, onTheStead.seed);
    const clipsSeen = new Set<string>();
    const statesSeen = new Set<string>();
    for (let now = born; now <= last; now += tickMs) {
      const world = worldAt(now);
      onTheStead = step(onTheStead, world, now, onlyAgentBeats);
      const resident = { slug, name: world.creatures[slug]?.name ?? slug, hueStop: 1 };
      const snapshot = creatureSnapshot(world, resident, now);
      floating = followSnapshot(floating, snapshot, now, ambient, rows);
      const steadPose = bodyPose(onTheStead.body, rows, ambient);
      const companionPose = bodyPose(floating.body, rows, ambient);
      const at = new Date(now).toISOString();
      expect(companionPose.clip, `clip at ${at} (${snapshot.state})`).toBe(steadPose.clip);
      expect(companionPose.facing, `facing at ${at}`).toBe(steadPose.facing);
      if (floating.body.clip.cycleStartedAt === onTheStead.body.clip.cycleStartedAt) {
        expect(companionPose.frame, `frame at ${at} in ${steadPose.clip}`).toBe(steadPose.frame);
      }
      clipsSeen.add(steadPose.clip);
      statesSeen.add(snapshot.state);
    }
    expect([...statesSeen].sort()).toEqual(["back", "idle", "porch", "working"]);
    for (const clip of ["work", "ring", "wait", "carry", "deliver", "celebrate", "idle"]) {
      expect(clipsSeen, clip).toContain(clip);
    }
  });
});
