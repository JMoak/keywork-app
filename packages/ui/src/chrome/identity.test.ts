import type { SessionSummary } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { arcHueRank, titleBot } from "./identity.ts";

const session = (extra: Partial<SessionSummary>): SessionSummary => ({
  id: "s1",
  title: "t",
  createdAt: "2026-10-07T00:00:00.000Z",
  lastActivityAt: "2026-10-07T00:00:00.000Z",
  messageCount: 1,
  ...extra,
});

const bots = [{ name: "reviewer", sigil: "◆" }];

describe("identity in the title row", () => {
  it("spells a bound bot as sigil and name, typographic and never a hue", () => {
    expect(titleBot(session({ bot: "reviewer" }), bots)).toEqual({ sigil: "◆", name: "reviewer" });
  });

  it("falls back to the bare name while the bots surface has not listed it", () => {
    expect(titleBot(session({ bot: "scribe" }), bots)).toEqual({ name: "scribe" });
  });

  it("shows nothing for an unbound or unknown session", () => {
    expect(titleBot(session({}), bots)).toBeUndefined();
    expect(titleBot(undefined, bots)).toBeUndefined();
  });

  it("takes the arc hue from the arc's ordinal and leaves spawn rank to decide otherwise", () => {
    const ordinals = { "arc-0": 0, pricing: 2 };
    expect(arcHueRank(session({ arc: "pricing" }), ordinals)).toBe(2);
    expect(arcHueRank(session({ arc: "vanished" }), ordinals)).toBeUndefined();
    expect(arcHueRank(session({}), ordinals)).toBeUndefined();
  });
});
