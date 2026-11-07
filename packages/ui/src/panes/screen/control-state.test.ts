import { describe, expect, it } from "vitest";
import { screenPane } from "./index.tsx";
import { controlLine, controlsInput, startingView, viewState } from "./view-state.ts";

const sessionId = "session-1";
const now = Date.parse("2026-11-06T09:00:00.000Z");

function controlling() {
  const granted = viewState(startingView, {
    kind: "granted",
    sessionId,
    displays: [],
    current: "1",
    expiresAt: "2026-11-06T10:00:00.000Z",
    path: "direct",
    control: { grantId: "grant-control", expiresAt: "2026-11-06T09:23:00.000Z" },
  });
  return viewState(granted, { kind: "connection", sessionId, state: "connected" });
}

describe("the screen pane under control", () => {
  it("shows control, its remaining time and the Stop verb, and only then sends input", () => {
    const live = controlling();
    expect(controlLine(live, now)).toBe("you control this screen · 23 min left · x stops");
    expect(controlsInput(live)).toBe(true);
    expect(controlsInput(viewState(startingView, { kind: "asking", sessionId }))).toBe(false);
  });

  it("says when the keeper's own input paused control, and when control ended with the view still on", () => {
    const paused = viewState(controlling(), {
      kind: "control",
      sessionId,
      state: "paused",
      reason: "the keeper is using this machine",
    });
    expect(controlLine(paused, now)).toBe("control paused · the keeper is using that machine");
    expect(controlsInput(paused)).toBe(false);
    const resumed = viewState(paused, { kind: "control", sessionId, state: "resumed" });
    expect(controlsInput(resumed)).toBe(true);
    const revoked = viewState(resumed, {
      kind: "control",
      sessionId,
      state: "revoked",
      reason: "control went quiet for five minutes",
    });
    expect(controlLine(revoked, now)).toBe(
      "view only · control ended: control went quiet for five minutes",
    );
    expect(revoked.phase).toBe("live");
  });

  it("opens with control asked when the command names it", () => {
    const spec = screenPane.summon?.spec;
    expect(spec?.({} as never, "spark-ad4d control")).toEqual({
      kind: "screen",
      peer: "spark-ad4d",
      control: true,
    });
    expect(spec?.({} as never, "spark-ad4d")).toEqual({ kind: "screen", peer: "spark-ad4d" });
  });
});
