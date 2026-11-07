import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { controlReconfirmCard, decideConsent, requestCard } from "./consent.ts";
import { type Clock, controlGrantTerms, grantBook, minute, viewGrantTerms } from "./grants.ts";
import type { PeerIdentity } from "./messages.ts";
import { parseSignal } from "./messages.ts";

const keeper: PeerIdentity = {
  node: { stableId: "nSparkStable1", name: "spark-ad4d" },
  user: { id: "u-keeper", loginName: "jordan@example.com", displayName: "Jordan" },
  tags: [],
};

const viewRequest = {
  id: "grant-view",
  sessionId: "session-1",
  token: "t".repeat(43),
  grantee: keeper,
  displays: ["1"],
};

function manualClock(): Clock & { advance(ms: number): void } {
  let now = Date.parse("2026-11-06T09:00:00.000Z");
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
}

const realTimers = {
  set: (run: () => void, ms: number) => setTimeout(run, ms),
  clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

describe("the control grant over a view grant", () => {
  it("is one book with two scopes: control rides on a live view and names it", () => {
    const clock = manualClock();
    const book = grantBook(clock);
    expect(book.allowControl("grant-view", "grant-control")).toBeUndefined();
    book.issue(viewRequest);
    const control = book.allowControl("grant-view", "grant-control");
    expect(control).toMatchObject({
      scope: "control",
      over: "grant-view",
      sessionId: "session-1",
      expiresAt: clock.now() + 60 * minute,
      idleTimeoutMs: 5 * minute,
      maxDurationMs: 60 * minute,
      reconfirmEveryMs: 30 * minute,
    });
    expect(book.controlOver("grant-view")?.id).toBe("grant-control");
    expect(book.bySession("session-1")?.id).toBe("grant-view");
    expect(book.byToken(viewRequest.token)?.id).toBe("grant-view");
  });

  it("is revocable without ending the view, and ends with the view", () => {
    const book = grantBook(manualClock());
    book.issue(viewRequest);
    book.allowControl("grant-view", "grant-control");
    book.revoke("grant-control");
    expect(book.controlOver("grant-view")).toBeUndefined();
    expect(book.standing("grant-view")).toMatchObject({ live: true });
    book.allowControl("grant-view", "grant-control-2");
    book.revoke("grant-view");
    expect(book.standing("grant-control-2")).toEqual({ live: false, reason: "unknown" });
  });

  it("expires with its own lifetime, never past the view's, and lapses when idle", () => {
    const clock = manualClock();
    const book = grantBook(clock, { ...viewGrantTerms, lifetimeMs: 20 * minute });
    book.issue(viewRequest);
    const control = book.allowControl("grant-view", "grant-control");
    expect(control?.expiresAt).toBe(clock.now() + 20 * minute);
    clock.advance(4 * minute);
    book.touched("grant-view");
    clock.advance(minute);
    expect(book.standing("grant-control")).toEqual({ live: false, reason: "idle" });
    expect(book.standing("grant-view")).toMatchObject({ live: true });
  });

  it("asks again every 30 minutes, apart from the view's own question", () => {
    const clock = manualClock();
    const book = grantBook(clock, { ...viewGrantTerms, reconfirmEveryMs: 45 * minute });
    book.issue(viewRequest);
    book.allowControl("grant-view", "grant-control");
    for (let elapsed = 0; elapsed < 30; elapsed += 1) {
      clock.advance(minute);
      book.touched("grant-view");
      book.touched("grant-control");
    }
    expect(book.due()).toEqual([
      { grant: expect.objectContaining({ id: "grant-control" }), due: "reconfirm" },
    ]);
    book.reconfirmed("grant-control");
    expect(book.due()).toEqual([]);
  });

  it("never survives a restart: a new book knows no grant", () => {
    const book = grantBook(manualClock());
    book.issue(viewRequest);
    book.allowControl("grant-view", "grant-control");
    expect(grantBook(manualClock()).standing("grant-control")).toEqual({
      live: false,
      reason: "unknown",
    });
  });
});

describe("the control consent cards", () => {
  it("offer Allow control, View only and Ignore, auto-denied after 30 s", async () => {
    const card = requestCard(keeper, viewGrantTerms, "control");
    expect(card.buttons).toEqual(["Allow control", "View only", "Ignore"]);
    expect(card.message).toBe(
      "Jordan (jordan@example.com) on spark-ad4d wants to control this screen",
    );
    expect(card.timeoutMs).toBe(30_000);
    await expect(decideConsent(card, async () => 0, realTimers)).resolves.toBe("allow");
    await expect(decideConsent(card, async () => 1, realTimers)).resolves.toBe("view-only");
    await expect(decideConsent(card, async () => 2, realTimers)).resolves.toBe("decline");
    expect(requestCard(keeper, viewGrantTerms).buttons).toEqual(["View only", "Ignore"]);
  });

  it("re-confirm control without touching the view", async () => {
    const card = controlReconfirmCard(keeper, controlGrantTerms.reconfirmEveryMs);
    expect(card.title).toBe("Keep allowing control?");
    expect(card.buttons).toEqual(["Keep control", "View only"]);
    await expect(decideConsent(card, async () => 1, realTimers)).resolves.toBe("view-only");
  });
});

describe("control on the signaling wire", () => {
  it("asks with scope control, grants control inside granted, and moves its state", () => {
    const base = { v: 1, sessionId: "session-1" };
    expect(parseSignal({ ...base, kind: "request", scope: "control" }).ok).toBe(true);
    expect(parseSignal({ ...base, kind: "request", scope: "files" }).ok).toBe(false);
    expect(
      parseSignal({ ...base, kind: "control", grantId: "grant-view", state: "paused" }).ok,
    ).toBe(true);
    expect(parseSignal({ ...base, kind: "denied", reason: "agent-control" }).ok).toBe(true);
  });
});

describe("the shared consent rules, against the grant book", () => {
  const rules = JSON.parse(
    readFileSync(new URL("../../../fixtures/screen/consent-rules.json", import.meta.url), "utf8"),
  ) as ConsentRules;

  for (const rule of rules.cases) {
    it(rule.name, () => {
      const clock = manualClock();
      let book = grantBook(clock);
      for (const step of rule.steps) {
        if (step.do === "grant") {
          book = grantBook(clock, viewGrantTerms, {
            ...controlGrantTerms,
            lifetimeMs: step.lifetimeMs,
          });
          book.issue(viewRequest);
          book.allowControl("grant-view", "grant-control");
        }
        if (step.do === "wait") clock.advance(step.ms);
        if (step.do === "restart") book = grantBook(clock);
        if (step.do === "input") {
          const applied = book.controlOver("grant-view") !== undefined;
          expect(applied ? "applied" : "refused").toBe(step.expect);
          if (applied) book.touched("grant-control");
        }
      }
    });
  }
});

interface ConsentRules {
  readonly cases: readonly {
    readonly name: string;
    readonly steps: readonly (
      | { do: "grant"; lifetimeMs: number }
      | { do: "wait"; ms: number }
      | { do: "restart" }
      | { do: "input"; expect: "applied" | "refused" }
    )[];
  }[];
}
