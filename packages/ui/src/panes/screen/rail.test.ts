import { describe, expect, it } from "vitest";
import type { ScreenViewEvent } from "./port.ts";
import {
  controlLine,
  grantOf,
  type ScreenViewState,
  startingView,
  statusLine,
  viewState,
} from "./view-state.ts";

const sessionId = "session-1";
const now = Date.parse("2026-11-06T08:38:00.000Z");

describe("the screen rail's grant", () => {
  it("says view only for a view grant and nothing of control", () => {
    const viewing = live();
    expect(grantOf(viewing)).toBe("view");
    expect(rail(viewing)).toBe(`view only · LG TV SSCR2 · until ${untilOf(viewing)}`);
  });

  it("says control, never view only, while the viewer holds control", () => {
    const controlling = live(controlGrant);
    expect(grantOf(controlling)).toBe("control");
    expect(rail(controlling)).not.toContain("view only");
    expect(rail(controlling)).toContain("you control this screen · 60 min left · x stops");
  });

  it("follows the session's control state through pause, resume and revoke, saying the grant once", () => {
    const controlling = live(controlGrant);
    const paused = after(controlling, { kind: "control", sessionId, state: "paused" });
    expect(grantOf(paused)).toBe("paused");
    expect(rail(paused)).not.toContain("view only");
    expect(occurrences(rail(paused), "control paused")).toBe(1);
    const resumed = after(paused, { kind: "control", sessionId, state: "resumed" });
    expect(grantOf(resumed)).toBe("control");
    const revoked = after(resumed, {
      kind: "control",
      sessionId,
      state: "revoked",
      reason: "the keeper took it back",
    });
    expect(grantOf(revoked)).toBe("view");
    expect(occurrences(rail(revoked), "view only")).toBe(1);
  });
});

type ControlGrant = NonNullable<Extract<ScreenViewEvent, { kind: "granted" }>["control"]>;

const controlGrant: ControlGrant = {
  grantId: "grant-control",
  expiresAt: "2026-11-06T09:38:00.000Z",
};

function live(control?: ControlGrant): ScreenViewState {
  const granted = after(startingView, {
    kind: "granted",
    sessionId,
    displays: [
      { id: "1", label: "LG TV SSCR2", width: 2560, height: 1440, scaleFactor: 1, primary: true },
    ],
    current: "1",
    expiresAt: "2026-11-06T09:38:00.000Z",
    path: "direct",
    ...(control !== undefined && { control }),
  });
  return after(granted, { kind: "connection", sessionId, state: "connected" });
}

function after(state: ScreenViewState, event: ScreenViewEvent): ScreenViewState {
  return viewState(state, event);
}

function rail(state: ScreenViewState): string {
  return [statusLine(state, "moak-main"), controlLine(state, now)]
    .filter((segment) => segment !== "")
    .join(" · ");
}

function untilOf(state: ScreenViewState): string {
  return statusLine(state, "moak-main").split("until ")[1] ?? "";
}

function occurrences(text: string, phrase: string): number {
  return text.split(phrase).length - 1;
}
