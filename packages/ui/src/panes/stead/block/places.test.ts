import type { HabitatState, Thread } from "@keywork-app/habitat";
import { noon, sketchTown, slugOf } from "@keywork-app/habitat/block/testing";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  createProjectPlaces,
  createProjectSites,
  creatureSessionsOf,
  type PlaceSeams,
  type PlaceTimers,
  placeReadsAtOnce,
  type SessionPlace,
} from "./places.ts";

describe("where a creature's conversations ran", () => {
  it("asks for each of the creature's conversations once, a few at a time, and settles them together", async () => {
    const reads = manualReads({
      a: { cwd: "/work/lamps", createdAt: "2026-01-01T00:00:00.000Z" },
      b: { cwd: "/work/bells", createdAt: "2026-01-02T00:00:00.000Z" },
      c: { cwd: "/work/lamps", createdAt: "2026-01-03T00:00:00.000Z" },
    });
    const timers = manualTimers();
    const [sessions, setSessions] = createSignal<readonly string[]>(["a", "b", "c"]);
    await inRoot(async () => {
      const known = createProjectPlaces(reads.seams, sessions, timers);
      await settled();
      expect(reads.inFlight()).toBe(placeReadsAtOnce);
      reads.answerAll();
      await settled();
      reads.answerAll();
      await settled();
      expect(known.places()).toEqual({});
      timers.runPending();
      expect(Object.keys(known.places()).sort()).toEqual(["a", "b", "c"]);
      expect(known.places().b).toEqual({
        directory: "/work/bells",
        startedAt: "2026-01-02T00:00:00.000Z",
      });
      setSessions(["a", "b", "c", "a"]);
      await settled();
      expect(reads.asked).toEqual(["a", "b", "c"]);
    });
  });

  it("asks again after a read fails, but not for a conversation the server no longer has", async () => {
    const reads = manualReads({ kept: { cwd: "/work/lamps", createdAt: noonIso } });
    const timers = manualTimers();
    const [sessions, setSessions] = createSignal<readonly string[]>(["kept", "gone"]);
    await inRoot(async () => {
      const known = createProjectPlaces(reads.seams, sessions, timers);
      await settled();
      reads.fail("kept");
      reads.answerAll();
      await settled();
      timers.runPending();
      expect(known.places()).toEqual({});
      setSessions(["kept", "gone", "new"]);
      await settled();
      reads.answerAll();
      await settled();
      timers.runPending();
      expect(Object.keys(known.places())).toEqual(["kept"]);
      expect(reads.asked).toEqual(["kept", "gone", "kept", "new"]);
    });
  });

  it("builds each creature's project sites from the creature's own conversations", async () => {
    const town = sketchTown(2);
    const template = Object.values(town.threads)[0];
    if (template === undefined) throw new Error("the sketch town has no threads");
    const thread = (id: string, creature: string | undefined, removed = false): Thread => ({
      ...template,
      id,
      creature,
      removed,
    });
    const state: HabitatState = {
      ...town,
      threads: {
        mine: thread("mine", slugOf(0)),
        theirs: thread("theirs", slugOf(1)),
        loose: thread("loose", undefined),
        removed: thread("removed", slugOf(0), true),
      },
    };
    expect(creatureSessionsOf(state)).toEqual(["mine", "theirs"]);
    const reads = manualReads({
      mine: { cwd: "/work/lamps", createdAt: noonIso },
      theirs: { cwd: "/work/bells", createdAt: noonIso },
    });
    const timers = manualTimers();
    await inRoot(async () => {
      const sites = createProjectSites(reads.seams, () => state, timers);
      await settled();
      reads.answerAll();
      await settled();
      timers.runPending();
      expect(sites()[slugOf(0)]?.map((site) => site.id)).toEqual(["/work/lamps"]);
      expect(sites()[slugOf(1)]?.map((site) => site.id)).toEqual(["/work/bells"]);
    });
  });
});

const noonIso = new Date(noon).toISOString();

async function inRoot(body: () => Promise<void>): Promise<void> {
  let dispose: (() => void) | undefined;
  const run = createRoot((done) => {
    dispose = done;
    return body();
  });
  try {
    await run;
  } finally {
    dispose?.();
  }
}

async function settled(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

function manualReads(answers: Record<string, SessionPlace>) {
  const asked: string[] = [];
  const pending: { id: string; answer(): void }[] = [];
  const failing = new Set<string>();
  const seams: PlaceSeams = {
    readSession: (id) => {
      asked.push(id);
      return new Promise((resolve, reject) => {
        pending.push({
          id,
          answer: () => (failing.delete(id) ? reject(new Error("offline")) : resolve(answers[id])),
        });
      });
    },
  };
  return {
    seams,
    asked,
    inFlight: () => pending.length,
    fail: (id: string) => failing.add(id),
    answerAll: () => {
      for (const read of pending.splice(0)) read.answer();
    },
  };
}

function manualTimers(): PlaceTimers & { runPending(): void; tick(): void } {
  const once: (() => void)[] = [];
  const repeating: (() => void)[] = [];
  return {
    after: (_ms, run) => {
      once.push(run);
      return () => {
        const index = once.indexOf(run);
        if (index >= 0) once.splice(index, 1);
      };
    },
    every: (_ms, run) => {
      repeating.push(run);
      return () => repeating.splice(repeating.indexOf(run), 1);
    },
    runPending: () => {
      for (const run of once.splice(0)) run();
    },
    tick: () => {
      for (const run of repeating) run();
    },
  };
}
