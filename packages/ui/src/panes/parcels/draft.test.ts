import { describe, expect, it } from "vitest";
import { capsOf, dayMs, expiryOf, grantDraftOf, subjectOf } from "./draft.ts";
import { fixtureNow, ids } from "./fixtures.ts";

const parcels = new Map([
  ["moak-main", ids.house],
  ["spark-ad4d", ids.spark],
]);

const context = {
  target: ids.spark,
  selfId: ids.house,
  parcels,
  now: fixtureNow,
  offsetMinutes: 0,
};

describe("the gate form's fields", () => {
  it("reads caps as clauses split by semicolons and lists split by commas", () => {
    expect(capsOf("exec bun, git status; files:read ~/src/**, docs/**; screen:view")).toEqual({
      ok: true,
      value: [
        { kind: "exec", commands: ["bun", "git status"] },
        { kind: "files:read", paths: ["~/src/**", "docs/**"] },
        { kind: "screen:view" },
      ],
    });
    expect(capsOf("files:write  C:/src/stead/**")).toEqual({
      ok: true,
      value: [{ kind: "files:write", paths: ["C:/src/stead/**"] }],
    });
  });

  it("says what is wrong with caps it cannot read", () => {
    expect(capsOf("  ;  ")).toEqual({
      ok: false,
      problem: "caps: name at least one, such as exec bun",
    });
    expect(capsOf("root everything")).toEqual({
      ok: false,
      problem:
        "caps: root is not a cap; use files:read, files:write, exec, screen:view, screen:control, clipboard",
    });
    expect(capsOf("exec")).toEqual({ ok: false, problem: "caps: exec needs at least one command" });
    expect(capsOf("files:read ,")).toEqual({
      ok: false,
      problem: "caps: files:read needs at least one path",
    });
    expect(capsOf("clipboard all")).toEqual({
      ok: false,
      problem: "caps: clipboard takes no list",
    });
  });

  it("reads expiry as a span, a clock time today or tomorrow, or a full timestamp", () => {
    expect(expiryOf("90m", fixtureNow, 0)).toEqual({
      ok: true,
      value: new Date(fixtureNow + 90 * 60_000).toISOString(),
    });
    expect(expiryOf("2h", fixtureNow, 0)).toEqual({ ok: true, value: "2026-11-05T14:00:00.000Z" });
    expect(expiryOf("1d", fixtureNow, 0)).toEqual({
      ok: true,
      value: new Date(fixtureNow + dayMs).toISOString(),
    });
    expect(expiryOf("18:00", fixtureNow, 0)).toEqual({
      ok: true,
      value: "2026-11-05T18:00:00.000Z",
    });
    expect(expiryOf("18:00", fixtureNow, -300)).toEqual({
      ok: true,
      value: "2026-11-05T23:00:00.000Z",
    });
    expect(expiryOf("09:30", fixtureNow, 0)).toEqual({
      ok: true,
      value: "2026-11-06T09:30:00.000Z",
    });
    expect(expiryOf("2026-11-07T08:00:00Z", fixtureNow, 0)).toEqual({
      ok: true,
      value: "2026-11-07T08:00:00.000Z",
    });
  });

  it("refuses an expiry it cannot read or one already past", () => {
    const unreadable = { ok: false, problem: "until: say 30m, 2h, 1d or a time such as 18:00" };
    expect(expiryOf("soon", fixtureNow, 0)).toEqual(unreadable);
    expect(expiryOf("25:00", fixtureNow, 0)).toEqual(unreadable);
    expect(expiryOf("0m", fixtureNow, 0)).toEqual({
      ok: false,
      problem: "until: 0m has already passed",
    });
    expect(expiryOf("2026-11-01T00:00:00Z", fixtureNow, 0)).toEqual({
      ok: false,
      problem: "until: 2026-11-01T00:00:00Z has already passed",
    });
  });

  it("puts the creature on this machine unless it names another parcel", () => {
    expect(subjectOf("wren", context)).toEqual({
      ok: true,
      value: { creature: "wren", node: ids.house },
    });
    expect(subjectOf(" moss@spark-ad4d ", context)).toEqual({
      ok: true,
      value: { creature: "moss", node: ids.spark },
    });
    expect(subjectOf("Wren", context)).toEqual({
      ok: false,
      problem: "creature: a slug such as wren, lowercase letters, digits and dashes",
    });
    expect(subjectOf("moss@nowhere", context)).toEqual({
      ok: false,
      problem: "creature: no parcel is named nowhere",
    });
    expect(subjectOf("wren", { ...context, selfId: undefined })).toEqual({
      ok: false,
      problem: "creature: this machine is not listed yet; name its parcel as wren@<machine>",
    });
  });

  it("assembles the draft the issue route takes, stopping at the first problem", () => {
    expect(grantDraftOf({ creature: "wren", caps: "exec bun", expiry: "1h" }, context)).toEqual({
      ok: true,
      value: {
        subject: { creature: "wren", node: ids.house },
        target: ids.spark,
        caps: [{ kind: "exec", commands: ["bun"] }],
        expiresAt: "2026-11-05T13:00:00.000Z",
      },
    });
    expect(grantDraftOf({ creature: "", caps: "", expiry: "" }, context)).toMatchObject({
      ok: false,
      problem: expect.stringMatching(/^creature:/),
    });
    expect(grantDraftOf({ creature: "wren", caps: "", expiry: "" }, context)).toMatchObject({
      problem: expect.stringMatching(/^caps:/),
    });
    expect(grantDraftOf({ creature: "wren", caps: "exec bun", expiry: "" }, context)).toMatchObject(
      {
        problem: expect.stringMatching(/^until:/),
      },
    );
  });
});
