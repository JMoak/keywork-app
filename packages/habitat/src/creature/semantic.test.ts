import { describe, expect, it } from "vitest";
import { day, hour, minute } from "../clock/clock.ts";
import { emptyHabitat, emptyThread, type HabitatState, type Thread } from "../world/types.ts";
import { repairOf } from "./repair.ts";
import {
  clipFor,
  creatureReading,
  glyphs,
  rollup,
  staleAfter,
  threadReading,
  toolBeatMs,
  toolBeatOf,
  toolClip,
  workingBeat,
} from "./semantic.ts";

const t0 = Date.parse("2026-11-05T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function thread(id: string, overrides: Partial<Thread> = {}): Thread {
  return { ...emptyThread(id, iso(t0)), creature: "tinker", ...overrides };
}

function world(...threads: Thread[]): HabitatState {
  return {
    ...emptyHabitat(),
    threads: Object.fromEntries(threads.map((each) => [each.id, each])),
  };
}

const live = (since = t0) => ({
  startedAt: iso(since),
  lastProgressAt: iso(since),
  tool: undefined,
  stumbledAt: undefined,
});

describe("one thread's semantic state", () => {
  it("is at the porch while an ask is open, whatever else is true", () => {
    const asking = thread("s", {
      turn: live(),
      asks: { c1: { callId: "c1", tool: "bash", subject: "rm", askedAt: iso(t0 + 1000) } },
      failure: { at: iso(t0), eventId: 1, message: "boom" },
    });
    const reading = threadReading(asking, world(asking), t0 + 2000);
    expect(reading).toMatchObject({
      state: "porch",
      since: t0 + 1000,
      staleAt: undefined,
      asks: 1,
    });
  });

  it("is blocked after an error for an hour, then lets go in case the lifecycle was lost", () => {
    const blocked = thread("s", { failure: { at: iso(t0), eventId: 1, message: "boom" } });
    expect(threadReading(blocked, world(blocked), t0 + 10 * minute)).toMatchObject({
      state: "blocked",
      staleAt: t0 + staleAfter.blocked,
    });
    expect(threadReading(blocked, world(blocked), t0 + 61 * minute).state).toBe("idle");
  });

  it("comes to the porch with a question after the third failure running, with no TTL", () => {
    const thrice = thread("s", {
      title: "nightly tidy",
      failure: { at: iso(t0), eventId: 9, message: "provider answered 529 overloaded" },
      failures: 3,
    });
    const reading = threadReading(thrice, world(thrice), t0 + 2 * hour);
    expect(reading.state).toBe("porch");
    expect(reading.repair).toEqual({
      thread: "s",
      title: "nightly tidy",
      failure: "provider answered 529 overloaded",
      attempts: 3,
      question:
        "nightly tidy failed three times running, the same way each time: provider answered 529 overloaded. Try again, try differently, or set it down?",
      choices: ["try-again", "try-differently", "set-it-down"],
    });
    expect(repairOf(thread("s", { failures: 2, failure: thrice.failure }))).toBeUndefined();
    expect(repairOf(thread("s", { failures: 4 }))).toBeUndefined();
    expect(repairOf(thread("s", { failures: 4, failure: thrice.failure }))?.question).toContain(
      "4 times running",
    );
    expect(repairOf(thread("s", { failures: 3, failure: thrice.failure }))?.title).toBe(
      "this thread",
    );
  });

  it("works for the whole turn, renewed by progress, and goes stale after thirty quiet minutes", () => {
    const working = thread("s", { turn: live() });
    expect(threadReading(working, world(working), t0 + 29 * minute)).toMatchObject({
      state: "working",
      staleAt: t0 + staleAfter.working,
    });
    expect(threadReading(working, world(working), t0 + 31 * minute).state).toBe("idle");
    const renewed = thread("s", { turn: { ...live(), lastProgressAt: iso(t0 + 25 * minute) } });
    expect(threadReading(renewed, world(renewed), t0 + 50 * minute).state).toBe("working");
  });

  it("pauses when the provider says wait, or when its workshop's parcel is fogged", () => {
    const waiting = thread("s", {
      turn: live(),
      waiting: { reason: "overloaded", since: iso(t0), until: undefined },
    });
    expect(threadReading(waiting, world(waiting), t0 + 1000).state).toBe("paused");
    const working = thread("s", { turn: live() });
    const fogged: HabitatState = {
      ...world(working),
      creatures: {
        tinker: {
          slug: "tinker",
          name: "Tinker",
          skin: undefined,
          seed: undefined,
          workshop: {
            raisedAt: iso(t0),
            parcel: "spark",
            substrate: "sbx",
            health: undefined,
            boardedAt: undefined,
          },
          conversation: undefined,
          chores: [],
        },
      },
      parcels: {
        spark: {
          id: "spark",
          name: "spark",
          roles: ["host"],
          online: false,
          path: undefined,
          fencedAt: iso(t0),
          seenAt: iso(t0),
        },
      },
    };
    expect(threadReading(working, fogged, t0 + 1000).state).toBe("paused");
    expect(threadReading(working, { ...fogged, parcels: {} }, t0 + 1000).state).toBe("working");
  });

  it("is back until viewed, for up to a week, with the crate labelled by the report when one came", () => {
    const back = thread("s", { back: { at: iso(t0), preview: "Done.", changes: ["a.ts"] } });
    expect(threadReading(back, world(back), t0 + day)).toMatchObject({
      state: "back",
      back: { preview: "Done.", report: undefined },
      staleAt: t0 + staleAfter.back,
    });
    expect(threadReading(back, world(back), t0 + 8 * day).state).toBe("idle");
    const emptyHanded = thread("s", {
      back: { at: iso(t0), preview: "Hi.", changes: [] },
      report: "Said hello; nothing to change.",
    });
    expect(threadReading(emptyHanded, world(emptyHanded), t0 + 1).back).toEqual({
      at: iso(t0),
      preview: "Hi.",
      report: "Said hello; nothing to change.",
    });
    expect(creatureReading(world(emptyHanded), "tinker", t0 + 1).crates).toBe(1);
  });

  it("keeps a finished tool at hand for one beat, then lets go of it", () => {
    const hammering = thread("s", {
      turn: {
        ...live(),
        tool: { callId: "c1", name: "bash", since: iso(t0), until: iso(t0 + 100) },
      },
    });
    const at = (now: number) => threadReading(hammering, world(hammering), now).tool?.name;
    expect(at(t0 + 50)).toBe("bash");
    expect(at(t0 + 100 + toolBeatMs - 1)).toBe("bash");
    expect(at(t0 + 100 + toolBeatMs)).toBeUndefined();
  });

  it("plays a tool where the creature stands for one beat before it walks on to the bench", () => {
    const shown = toolBeatOf(undefined, "bash", t0);
    expect(shown).toEqual({ clip: "hammer", shownAt: t0 });
    expect(toolBeatOf(shown, "bash", t0 + 200)).toBe(shown);
    expect(toolBeatOf(shown, undefined, t0 + 200)).toBe(shown);
    expect(toolBeatOf(shown, undefined, t0 + toolBeatMs)).toBeUndefined();
    expect(toolBeatOf(shown, "read", t0 + 200)).toEqual({ clip: "read", shownAt: t0 + 200 });
    expect(workingBeat("bash", shown, t0 + 200)).toEqual({ clip: "hammer", lane: "agent" });
    expect(workingBeat("bash", shown, t0 + toolBeatMs)).toEqual({
      clip: "hammer",
      lane: "agent",
      walkTo: "bench",
    });
    expect(workingBeat(undefined, undefined, t0)).toEqual({
      clip: "work",
      lane: "agent",
      walkTo: "bench",
    });
  });

  it("maps every state to a body loop and a glyph, and tools to hammer, read and carve", () => {
    const reading = (state: Parameters<typeof clipFor>[0]["state"], tool?: string) => ({
      state,
      carrier:
        tool === undefined
          ? undefined
          : {
              thread: "s",
              state,
              since: t0,
              staleAt: undefined,
              tool: { callId: "c", name: tool, since: iso(t0) },
              stumbledAt: undefined,
              asks: 0,
              repair: undefined,
              back: undefined,
            },
      lamps: 0,
      lanterns: 0,
      notes: 0,
      crates: 0,
      asks: 0,
    });
    expect(clipFor(reading("porch"))).toBe("wait");
    expect(clipFor(reading("blocked"))).toBe("blocked");
    expect(clipFor(reading("back"))).toBe("idle");
    expect(clipFor(reading("paused"))).toBe("sit");
    expect(clipFor(reading("idle"))).toBe("idle");
    expect(clipFor(reading("working"))).toBe("work");
    expect(clipFor(reading("working", "bash"))).toBe("hammer");
    expect(clipFor(reading("working", "read"))).toBe("read");
    expect(clipFor(reading("working", "edit"))).toBe("carve");
    expect(toolClip("delegate")).toBe("work");
    expect(glyphs).toEqual({
      porch: "bell",
      blocked: "cross",
      back: "check",
      working: "dot",
      paused: "pause",
      idle: "none",
    });
  });
});

describe("a creature with many threads", () => {
  it("shows the highest priority across them, the most recent on a tie, and counts its lamps, notes and crates", () => {
    const working = thread("w", { turn: live(t0), queued: 2 });
    const later = thread("w2", { turn: live(t0 + 5000) });
    const back = thread("b", { back: { at: iso(t0), preview: "Done.", changes: ["x"] } });
    const reading = creatureReading(world(working, later, back), "tinker", t0 + 6000);
    expect(reading).toMatchObject({ state: "back", lamps: 2, notes: 2, crates: 1, asks: 0 });
    expect(reading.carrier?.thread).toBe("b");
    const twoWorking = creatureReading(world(working, later), "tinker", t0 + 6000);
    expect(twoWorking.carrier?.thread).toBe("w2");
    expect(creatureReading(world(), "tinker", t0)).toMatchObject({
      state: "idle",
      carrier: undefined,
    });
  });

  it("rolls children up to the parent and to its own creature, and counts their lanterns", () => {
    const parent = thread("p", { turn: live(), children: ["c"] });
    const child = thread("c", {
      creature: "researcher",
      kind: "child",
      parent: "p",
      turn: live(t0 + 100),
      asks: { k1: { callId: "k1", tool: "bash", subject: "x", askedAt: iso(t0 + 200) } },
    });
    const both = world(parent, child);
    expect(creatureReading(both, "tinker", t0 + 1000)).toMatchObject({
      state: "porch",
      lamps: 1,
      lanterns: 1,
    });
    expect(creatureReading(both, "researcher", t0 + 1000)).toMatchObject({
      state: "porch",
      lamps: 0,
      lanterns: 1,
    });
    expect(rollup(both, "p", t0 + 1000)?.state).toBe("porch");
    expect(rollup(both, "missing", t0)).toBeUndefined();
    const removed = world(parent, { ...child, removed: true });
    expect(creatureReading(removed, "tinker", t0 + 1000).state).toBe("working");
  });
});
