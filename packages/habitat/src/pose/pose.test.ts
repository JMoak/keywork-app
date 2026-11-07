import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  advance,
  type Beat,
  type Body,
  bodyPose,
  createBody,
  cycleHolds,
  frameAt,
  jolt,
  type Lane,
  lookToward,
  type MotionPrefs,
  type Place,
  play,
  slotOf,
} from "./pose.ts";
import { poseNames, referenceRows, rowDuration } from "./skin.ts";
import { quickMs } from "./tempo.ts";

const rows = referenceRows;
const full: MotionPrefs = { reducedMotion: false, tier: "active" };
const reduced: MotionPrefs = { reducedMotion: true, tier: "active" };
const hidden: MotionPrefs = { reducedMotion: false, tier: "hidden" };

describe("golden poses", () => {
  const stamps = [0, 100, 250, 700, 1500, 3000, 6600, 9900, 20000];

  for (const name of poseNames) {
    it(`${name} at fixed timestamps`, () => {
      let body = play(createBody(0, 7), { clip: name, lane: "agent" }, full, rows);
      const poses = stamps.map((at) => {
        body = advance(body, at, full, rows);
        const pose = bodyPose(body, rows, full);
        return {
          at,
          clip: pose.clip,
          frame: pose.frame,
          scale: { x: round(pose.scale.x), y: round(pose.scale.y) },
          lift: round(pose.lift),
          blink: pose.blink,
          nextFrameAt: pose.nextFrameAt === undefined ? undefined : round(pose.nextFrameAt),
        };
      });
      expect(poses).toMatchSnapshot();
    });
  }
});

describe("frames follow the manifest's timings", () => {
  it("holds each frame for its jittered time and jitters within fifteen percent", () => {
    const body = play(createBody(0, 3), { clip: "idle", lane: "ambient" }, full, rows);
    const holds = cycleHolds(body.clip, rows);
    holds.forEach((hold, index) => {
      const nominal = rows.idle.ms[index] ?? 0;
      expect(hold).toBeGreaterThanOrEqual(nominal * 0.85 - 1e-9);
      expect(hold).toBeLessThanOrEqual(nominal * 1.15 + 1e-9);
    });
    const firstHold = holds[0] ?? 0;
    expect(frameAt(body.clip, rows, firstHold - 1)).toBe(0);
    expect(frameAt(body.clip, rows, firstHold + 1)).toBe(1);
    expect(frameAt(body.clip, rows, holds.reduce((a, b) => a + b, 0) - 1)).toBe(5);
  });

  it("loops a loop and sends a one-shot back to its fallback on the ambient lane", () => {
    const idle = play(createBody(0, 1), { clip: "idle", lane: "ambient" }, full, rows);
    const later = advance(idle, 60_000, full, rows);
    expect(later.clip.name).toBe("idle");
    expect(later.clip.cycle).toBeGreaterThan(5);
    const wave = play(createBody(0, 1), { clip: "wave", lane: "input" }, full, rows);
    const waving = advance(wave, 300, full, rows);
    expect(waving.clip).toMatchObject({ name: "wave", lane: "input" });
    const waved = advance(waving, quickMs + rowDuration(rows.wave) * 1.2, full, rows);
    expect(waved.clip).toMatchObject({ name: "idle", lane: "ambient" });
    const rung = advance(
      play(createBody(0, 1), { clip: "ring", lane: "needs-you" }, full, rows),
      5_000,
      full,
      rows,
    );
    expect(rung.clip.name).toBe("wait");
  });

  it("plays a one-shot for as many cycles as asked", () => {
    const twice = play(
      createBody(0, 1),
      { clip: "celebrate", lane: "agent", cycles: 2 },
      full,
      rows,
    );
    const once = rowDuration(rows.celebrate);
    expect(advance(twice, quickMs + once * 1.3, full, rows).clip.name).toBe("celebrate");
    expect(advance(twice, quickMs + once * 2.4, full, rows).clip.name).toBe("idle");
  });

  it("never restarts a loop that is already playing, even when a new lane asks for it", () => {
    const working = advance(
      play(createBody(0, 1), { clip: "work", lane: "agent" }, full, rows),
      500,
      full,
      rows,
    );
    const again = play(working, { clip: "work", lane: "agent" }, full, rows);
    expect(again).toBe(working);
    const relabeled = play(working, { clip: "work", lane: "ambient" }, full, rows);
    expect(relabeled.clip.startedAt).toBe(working.clip.startedAt);
    expect(relabeled.clip.lane).toBe("ambient");
  });
});

describe("lanes", () => {
  it("lets input outrank needs-you, needs-you outrank agent state, and agent state outrank ambient", () => {
    const ambient = play(createBody(0, 1), { clip: "stretch", lane: "ambient" }, full, rows);
    const agent = play(ambient, { clip: "work", lane: "agent" }, full, rows);
    expect(agent.pending?.beat.clip ?? agent.clip.name).toBe("work");
    const working = advance(agent, 200, full, rows);
    expect(play(working, { clip: "stretch", lane: "ambient" }, full, rows)).toBe(working);
    const rung = advance(
      play(working, { clip: "ring", lane: "needs-you" }, full, rows),
      working.at + quickMs,
      full,
      rows,
    );
    expect(rung.clip.name).toBe("ring");
    expect(play(rung, { clip: "work", lane: "agent" }, full, rows)).toBe(rung);
    const greeted = advance(
      play(rung, { clip: "greet", lane: "input" }, full, rows),
      rung.at + quickMs,
      full,
      rows,
    );
    expect(greeted.clip.name).toBe("greet");
  });

  it("answers a second input afresh rather than letting the first one-shot run out", () => {
    const greeting = advance(
      play(createBody(0, 17), { clip: "greet", lane: "input" }, full, rows),
      650,
      full,
      rows,
    );
    const asked = play(greeting, { clip: "greet", lane: "input" }, full, rows);
    const soon = advance(asked, greeting.at + quickMs, full, rows);
    expect(soon.clip.name).toBe("greet");
    expect(soon.clip.startedAt).toBeGreaterThan(0);
    expect(soon.clip.startedAt).toBeLessThanOrEqual(greeting.at + quickMs);
    expect(play(soon, { clip: "greet", lane: "agent" }, full, rows).pending).toBeUndefined();
  });

  it("lets anything replace a finished one-shot", () => {
    const greeted = advance(
      play(createBody(0, 1), { clip: "greet", lane: "input" }, full, rows),
      2_000,
      full,
      rows,
    );
    expect(greeted.clip).toMatchObject({ name: "idle", lane: "ambient" });
    expect(play(greeted, { clip: "nap", lane: "ambient" }, full, rows).pending?.beat.clip).toBe(
      "nap",
    );
  });
});

describe("walking", () => {
  it("strides toward a place, faces the way it goes, arrives, then plays what it came to do", () => {
    const body = play(
      createBody(0, 1, "bench"),
      { clip: "wait", lane: "needs-you", walkTo: "porch" },
      full,
      rows,
    );
    expect(body.facing).toBe("left");
    expect(body.walk).toMatchObject({ to: "porch", duration: 2 * 700 });
    expect(advance(body, quickMs, full, rows).clip.name).toBe("walk-left");
    const midway = advance(body, 700, full, rows);
    expect(midway.x).toBeGreaterThan(slotOf("porch"));
    expect(midway.x).toBeLessThan(slotOf("bench"));
    expect(bodyPose(midway, rows, full)).toMatchObject({ place: undefined, heading: "porch" });
    const arrived = advance(body, 1_500, full, rows);
    expect(arrived.x).toBe(slotOf("porch"));
    expect(arrived.place).toBe("porch");
    expect(arrived.walk).toBeUndefined();
    expect(arrived.clip.name).toBe("wait");
  });

  it("keeps a walk already under way when the same beat is asked for again", () => {
    const beat: Beat = { clip: "nap", lane: "ambient", walkTo: "hay" };
    const walking = advance(play(createBody(0, 1, "bench"), beat, full, rows), 300, full, rows);
    expect(play(walking, beat, full, rows)).toBe(walking);
  });

  it("retargets a walk from where the body stands", () => {
    const toMill = play(
      createBody(0, 1, "bench"),
      { clip: "look", lane: "ambient", walkTo: "mill" },
      full,
      rows,
    );
    const midway = advance(toMill, 1_000, full, rows);
    const turned = play(midway, { clip: "work", lane: "agent", walkTo: "bench" }, full, rows);
    expect(turned.walk?.from).toBe(midway.x);
    expect(turned.facing).toBe("left");
    expect(advance(turned, 5_000, full, rows).place).toBe("bench");
  });

  it("lets a bare agent beat interrupt a walk where the body stands, and resumes the walk from there", () => {
    const toBench = play(
      createBody(0, 1, "porch"),
      { clip: "hammer", lane: "agent", walkTo: "bench" },
      full,
      rows,
    );
    const midway = advance(toBench, 400, full, rows);
    expect(midway.clip.name).toBe("walk-right");
    const stopped = advance(
      play(midway, { clip: "hammer", lane: "agent" }, full, rows),
      400 + quickMs,
      full,
      rows,
    );
    expect(stopped.walk).toBeUndefined();
    expect(stopped.clip.name).toBe("hammer");
    expect(stopped.x).toBe(midway.x);
    const resumed = play(stopped, { clip: "work", lane: "agent", walkTo: "bench" }, full, rows);
    expect(resumed.walk?.from).toBe(stopped.x);
    expect(advance(resumed, 5_000, full, rows)).toMatchObject({ place: "bench" });
    expect(advance(resumed, 5_000, full, rows).clip.name).toBe("work");
  });

  it("teleports under reduced motion, because translation is off", () => {
    const body = play(
      createBody(0, 1, "bench"),
      { clip: "wait", lane: "needs-you", walkTo: "porch" },
      reduced,
      rows,
    );
    expect(body.walk).toBeUndefined();
    expect(body.x).toBe(slotOf("porch"));
    expect(body.clip.name).toBe("wait");
  });

  it("knows a parcel beyond the gate as a place", () => {
    const away = advance(
      play(
        createBody(0, 1, "gate"),
        { clip: "look", lane: "ambient", walkTo: "parcel:spark" },
        full,
        rows,
      ),
      5_000,
      full,
      rows,
    );
    expect(away.place).toBe("parcel:spark");
    expect(slotOf("parcel:spark")).toBeGreaterThan(slotOf("gate"));
  });
});

describe("secondary motion", () => {
  it("breathes and squashes while preserving area", () => {
    let body = play(createBody(0, 1), { clip: "idle", lane: "ambient" }, full, rows);
    body = jolt(body);
    for (let at = 16; at < 3_000; at += 16) {
      body = advance(body, at, full, rows);
      const { scale } = bodyPose(body, rows, full);
      expect(scale.x * scale.y).toBeCloseTo(1, 6);
      expect(Math.abs(scale.y - 1)).toBeLessThan(0.05);
    }
  });

  it("looks toward a direction through a spring and settles back when the look ends", () => {
    const looking = advance(lookToward(createBody(0, 1), 2), 2_000, full, rows);
    const pose = bodyPose(looking, rows, full);
    expect(pose.gaze?.direction).toBe(2);
    expect(pose.gaze?.y).toBeCloseTo(1, 2);
    expect(lookToward(looking, 2)).toBe(looking);
    const away = advance(lookToward(looking, undefined), 4_000, full, rows);
    expect(bodyPose(away, rows, full).gaze).toBeUndefined();
    expect(away.gaze.y.value).toBeCloseTo(0, 2);
  });

  it("blinks on a seeded schedule and never under reduced motion", () => {
    let body = createBody(0, 11);
    let blinked = false;
    for (let at = 50; at < 20_000; at += 50) {
      body = advance(body, at, full, rows);
      if (bodyPose(body, rows, full).blink) blinked = true;
      expect(bodyPose(body, rows, reduced).blink).toBe(false);
    }
    expect(blinked).toBe(true);
    expect(body.blinks).toBeGreaterThanOrEqual(2);
  });
});

describe("wakeups", () => {
  it("schedules the next frame boundary, the pending switch or a sample at the tier's rate", () => {
    const body = play(createBody(0, 1), { clip: "work", lane: "agent" }, full, rows);
    const ambient =
      bodyPose(body, rows, { reducedMotion: false, tier: "ambient" }).nextFrameAt ?? 0;
    expect(ambient).toBeGreaterThan(0);
    expect(ambient).toBeLessThanOrEqual(1000 / 15 + 1e-9);
    const rest =
      bodyPose(createBody(0, 1), rows, { reducedMotion: false, tier: "rest" }).nextFrameAt ?? 0;
    expect(rest).toBeGreaterThan(0);
    expect(rest).toBeLessThanOrEqual(1000);
  });

  it("schedules nothing when hidden, and under reduced motion only a meaningful point", () => {
    const still = play(createBody(0, 1), { clip: "work", lane: "agent" }, reduced, rows);
    expect(bodyPose(still, rows, hidden).nextFrameAt).toBeUndefined();
    expect(bodyPose(still, rows, reduced).nextFrameAt).toBeUndefined();
    const celebrating = play(createBody(0, 1), { clip: "celebrate", lane: "agent" }, reduced, rows);
    expect(bodyPose(celebrating, rows, reduced).nextFrameAt).toBe(rowDuration(rows.celebrate));
    expect(bodyPose(celebrating, rows, reduced).frame).toBe(0);
  });
});

describe("properties", () => {
  const lanes: Lane[] = ["input", "needs-you", "agent", "ambient"];
  const places: Place[] = ["tree", "porch", "bench", "hay", "mill", "parcel:spark"];
  const beatArb = fc.record({
    clip: fc.constantFrom(...poseNames),
    lane: fc.constantFrom(...lanes),
    walkTo: fc.option(fc.constantFrom(...places), { nil: undefined }),
  }) as fc.Arbitrary<Beat>;
  type Step =
    | { kind: "play"; beat: Beat }
    | { kind: "wait"; ms: number }
    | { kind: "look"; direction: number | undefined };
  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ kind: fc.constant("play" as const), beat: beatArb }),
    fc.record({ kind: fc.constant("wait" as const), ms: fc.integer({ min: 1, max: 9_000 }) }),
    fc.record({
      kind: fc.constant("look" as const),
      direction: fc.option(fc.integer({ min: 0, max: 7 }), { nil: undefined }),
    }),
  );
  const prefsArb = fc.record({
    reducedMotion: fc.boolean(),
    tier: fc.constantFrom("interact", "active", "ambient", "rest", "hidden"),
  }) as fc.Arbitrary<MotionPrefs>;

  function run(seed: number, steps: readonly Step[], prefs: MotionPrefs): Body {
    let body = createBody(0, seed);
    for (const step of steps) {
      if (step.kind === "play") body = play(body, step.beat, prefs, rows);
      else if (step.kind === "wait") body = advance(body, body.at + step.ms, prefs, rows);
      else body = lookToward(body, step.direction);
    }
    return body;
  }

  it("is total: every sequence yields a pose with a frame inside its row and area preserved", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(stepArb, { maxLength: 40 }),
        prefsArb,
        (seed, steps, prefs) => {
          const body = run(seed, steps, prefs);
          const pose = bodyPose(body, rows, prefs);
          expect(pose.frame).toBeGreaterThanOrEqual(0);
          expect(pose.frame).toBeLessThan(rows[pose.clip].frames);
          expect(pose.scale.x * pose.scale.y).toBeCloseTo(1, 6);
          expect(Number.isFinite(pose.x)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("never sticks: after any history, asking for idle and waiting settles on idle", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(stepArb, { maxLength: 30 }),
        prefsArb,
        (seed, steps, prefs) => {
          const body = play(run(seed, steps, prefs), { clip: "idle", lane: "input" }, prefs, rows);
          const settledBody = advance(body, body.at + 30_000, prefs, rows);
          expect(settledBody.clip.name).toBe("idle");
          expect(settledBody.walk).toBeUndefined();
        },
      ),
      { numRuns: 200 },
    );
  });

  it("answers input within one quick tempo, whatever is playing", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(stepArb, { maxLength: 30 }),
        prefsArb,
        (seed, steps, prefs) => {
          const before = run(seed, steps, prefs);
          const asked = play(before, { clip: "greet", lane: "input" }, prefs, rows);
          const soon = advance(asked, before.at + quickMs, prefs, rows);
          expect(soon.clip.name).toBe("greet");
          expect(soon.clip.startedAt).toBeLessThanOrEqual(before.at + quickMs);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("replays identically from the same seed and history", () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.array(stepArb, { maxLength: 30 }),
        prefsArb,
        (seed, steps, prefs) => {
          expect(bodyPose(run(seed, steps, prefs), rows, prefs)).toEqual(
            bodyPose(run(seed, steps, prefs), rows, prefs),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("schedules no wakeup when hidden, and none when still under reduced motion", () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(stepArb, { maxLength: 30 }), (seed, steps) => {
        const body = run(seed, steps, full);
        expect(bodyPose(body, rows, hidden).nextFrameAt).toBeUndefined();
        const stillBody = advance(body, body.at + 60_000, reduced, rows);
        expect(bodyPose(stillBody, rows, reduced).nextFrameAt).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
