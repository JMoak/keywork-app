import { describe, expect, it } from "vitest";
import { accessibleName, announcer } from "./announce.ts";
import type { CompanionSnapshot } from "./port.ts";

const idle: CompanionSnapshot = {
  creature: { name: "pip", hueStop: 1 },
  state: "idle",
  stateLabel: "idle",
  activeThreads: 0,
  finishedUnseen: 0,
  threadId: undefined,
  tool: undefined,
  needsYou: undefined,
};

const porch: CompanionSnapshot = {
  ...idle,
  state: "porch",
  stateLabel: "at the porch",
  activeThreads: 1,
  threadId: "t1",
  needsYou: {
    title: "rename the ledger",
    line: "asks to run a command",
    callId: "c1",
    answers: ["approve"],
  },
};

describe("accessibleName", () => {
  it("is creature, state label, active threads", () => {
    expect(accessibleName(idle)).toBe("pip, idle, 0 active threads");
    expect(accessibleName(porch)).toBe("pip, at the porch, 1 active thread");
  });
});

describe("announcer", () => {
  it("announces needs-you once and assertively, back and blocked politely, nothing for idle or working", () => {
    const voice = announcer();
    expect(voice.next(idle)).toBeUndefined();
    expect(voice.next({ ...idle, state: "working", stateLabel: "working" })).toBeUndefined();
    expect(voice.next(porch)).toEqual({
      text: "pip, at the porch, 1 active thread: rename the ledger, asks to run a command",
      priority: "assertive",
    });
    expect(voice.next(porch)).toBeUndefined();
    expect(voice.next(idle)).toBeUndefined();
    expect(voice.next(porch)).toBeUndefined();
    expect(
      voice.next({ ...idle, state: "back", stateLabel: "back with work", finishedUnseen: 1 }),
    ).toEqual({
      text: "pip, back with work, 0 active threads",
      priority: "polite",
    });
    expect(voice.next({ ...idle, state: "blocked", stateLabel: "blocked" })).toMatchObject({
      priority: "polite",
    });
  });
});
