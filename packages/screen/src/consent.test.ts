import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  admissionGate,
  type ConsentTimers,
  consentTimeoutMs,
  decideConsent,
  deniedReasonFor,
  reconfirmCard,
  requestCard,
} from "./consent.ts";
import { viewGrantTerms } from "./grants.ts";
import { keeper, manualClock, taggedHost } from "./testing.ts";

const realTimers: ConsentTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

describe("the consent card", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("names the tailnet-verified person and device and offers only view or ignore", () => {
    const card = requestCard(keeper, viewGrantTerms);
    expect(card.message).toBe(
      "Jordan (jordan@example.com) on spark-ad4d wants to view this screen",
    );
    expect(card.detail).toContain("nStable1CNTRL");
    expect(card.detail).toContain("View only");
    expect(card.buttons).toEqual(["View only", "Ignore"]);
    expect(card.timeoutMs).toBe(30_000);
  });

  it("denies on its own after 30 seconds and closes the dialog it opened", async () => {
    let closedBy: AbortSignal | undefined;
    const ask = vi.fn((_card, signal: AbortSignal) => {
      closedBy = signal;
      return new Promise<number | undefined>(() => {});
    });
    const answer = decideConsent(requestCard(keeper, viewGrantTerms), ask, realTimers);
    await vi.advanceTimersByTimeAsync(consentTimeoutMs - 1);
    expect(closedBy?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(answer).resolves.toBe("timed-out");
    expect(closedBy?.aborted).toBe(true);
    expect(deniedReasonFor("timed-out")).toBe("timed-out");
  });

  it("allows only on the first button and treats anything else as ignore", async () => {
    const card = requestCard(keeper, viewGrantTerms);
    await expect(decideConsent(card, async () => 0, realTimers)).resolves.toBe("allow");
    await expect(decideConsent(card, async () => 1, realTimers)).resolves.toBe("decline");
    await expect(decideConsent(card, async () => undefined, realTimers)).resolves.toBe("decline");
    await expect(
      decideConsent(card, async () => Promise.reject(new Error("closed")), realTimers),
    ).resolves.toBe("decline");
    expect(deniedReasonFor("decline")).toBe("ignored");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("asks to keep sharing with the same timeout", () => {
    const card = reconfirmCard(keeper, 30 * 60_000);
    expect(card.message).toContain("for 30 minutes");
    expect(card.buttons).toEqual(["Keep sharing", "Stop"]);
    expect(card.timeoutMs).toBe(consentTimeoutMs);
  });
});

describe("request admission", () => {
  it("refuses requesters without a human tailnet identity", () => {
    const gate = admissionGate(manualClock());
    expect(gate.admit(undefined)).toBe("unverified");
    expect(gate.admit(taggedHost)).toBe("unverified");
  });

  it("holds one consent card at a time and rate-limits each peer", () => {
    const clock = manualClock();
    const gate = admissionGate(clock);
    expect(gate.admit(keeper)).toBe("admit");
    expect(gate.admit(keeper)).toBe("busy");
    gate.settled();
    expect(gate.admit(keeper)).toBe("admit");
    gate.settled();
    expect(gate.admit(keeper)).toBe("rate-limited");
    clock.advance(60_000);
    expect(gate.admit(keeper)).toBe("admit");
  });
});
