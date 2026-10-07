import { describe, expect, it } from "vitest";
import { isNotice, memoryInboxThreshold, type NeedsYouTrigger, shouldNotify } from "./notify.ts";

const ask: NeedsYouTrigger = { kind: "ask", workspace: "C:/w", sessionId: "s1", callId: "c1" };

describe("shouldNotify", () => {
  it("never interrupts a focused window", () => {
    expect(shouldNotify(ask, true)).toBe(false);
    expect(
      shouldNotify(
        { kind: "memory-inbox", workspace: "C:/w", pending: memoryInboxThreshold },
        true,
      ),
    ).toBe(false);
  });

  it("fires for a pending ask while the window is unfocused", () => {
    expect(shouldNotify(ask, false)).toBe(true);
  });

  it("fires for the memory inbox only at the threshold", () => {
    const inbox = (pending: number): NeedsYouTrigger => ({
      kind: "memory-inbox",
      workspace: "C:/w",
      pending,
    });
    expect(shouldNotify(inbox(memoryInboxThreshold - 1), false)).toBe(false);
    expect(shouldNotify(inbox(memoryInboxThreshold), false)).toBe(true);
  });
});

describe("isNotice", () => {
  it("accepts only a titled, bodied notice with one of the two triggers", () => {
    expect(isNotice({ title: "ask", body: "bash", trigger: ask })).toBe(true);
    expect(
      isNotice({
        title: "inbox",
        body: "5 memories",
        trigger: { kind: "memory-inbox", workspace: "C:/w", pending: 5 },
      }),
    ).toBe(true);
    expect(isNotice({ title: "done", body: "turn finished" })).toBe(false);
    expect(
      isNotice({ title: "x", body: "y", trigger: { kind: "completion", workspace: "C:/w" } }),
    ).toBe(false);
    expect(isNotice({ title: "x", body: "y", trigger: { kind: "ask", workspace: "C:/w" } })).toBe(
      false,
    );
    expect(isNotice(null)).toBe(false);
  });
});
