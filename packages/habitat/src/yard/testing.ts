import type { BusEnvelope, Setting, ShowSettled } from "@keywork-app/protocol";
import type { YardContext, YardSetting } from "./types.ts";

export const noon = Date.parse("2026-11-08T12:00:00.000Z");

export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

export function aSetting(overrides: Partial<Setting> = {}): Setting {
  return {
    id: "set-1",
    creature: "bea",
    sessionId: "s1",
    what: { kind: "note", ref: "a note", title: "A note" },
    rung: "card",
    why: "you will want this",
    at: isoAt(noon),
    until: "seen",
    state: "live",
    ...overrides,
  };
}

export function aYardSetting(overrides: Partial<YardSetting> = {}): YardSetting {
  return { ...aSetting(overrides), shown: "glyph", depth: 0, ...overrides };
}

export const calm: YardContext = {
  visible: true,
  focused: true,
  fullscreen: false,
  doNotDisturb: false,
  tier: "active",
  reducedMotion: false,
  quietHours: false,
  focusedThread: undefined,
  keeperSpokeAt: {},
  rules: [],
};

export function askedIn(thread: string, spokeAt: number): Partial<YardContext> {
  return { focusedThread: thread, keeperSpokeAt: { [thread]: spokeAt } };
}

export function proposed(id: number, setting: Setting): BusEnvelope {
  return {
    id,
    ts: setting.at,
    sessionId: setting.sessionId,
    type: "show.proposed",
    payload: { setting },
  };
}

export function settled(
  id: number,
  ts: string,
  sessionId: string,
  payload: ShowSettled,
): BusEnvelope {
  return { id, ts, sessionId, type: "show.settled", payload };
}
