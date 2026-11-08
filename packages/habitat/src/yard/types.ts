import { type Rung, rungs, type Setting, type SettingKind } from "@keywork-app/protocol";
import { parseTs } from "../clock/clock.ts";
import type { Budget, GateContext, Verdict } from "../creature/gate.ts";
import type { MotionPrefs } from "../pose/pose.ts";
import type { SessionId, Slug } from "../world/types.ts";

export interface YardState {
  readonly settings: Readonly<Record<string, YardSetting>>;
  readonly rules: readonly YardRule[];
  readonly budget: Budget;
  readonly decisions: readonly YardDecision[];
}

export interface YardSetting extends Setting {
  readonly shown: Rung;
  readonly depth: number;
  readonly seenAt?: string | undefined;
  readonly pinnedAt?: string | undefined;
}

export type RuleLasts = "while-present" | "always";

export interface YardRule {
  readonly creature: Slug | null;
  readonly kind: SettingKind;
  readonly rung: Rung;
  readonly lasts: RuleLasts;
}

export interface YardContext extends GateContext {
  readonly focusedThread: SessionId | undefined;
  readonly keeperSpokeAt: Readonly<Record<SessionId, number>>;
  readonly rules: readonly YardRule[];
}

export interface YardDecision {
  readonly at: number;
  readonly id: string;
  readonly creature: Slug | null;
  readonly kind: SettingKind;
  readonly proposed: Rung;
  readonly rung: Rung;
  readonly verdict: Verdict;
  readonly reason: string;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Layer = "front" | "mid" | "back";

export interface Placement {
  readonly id: string;
  readonly rect: Rect;
  readonly rung: Rung;
  readonly layer: Layer;
}

export interface YardLayout {
  readonly viewport: Rect;
  readonly hub: Rect;
  readonly settings: readonly YardSetting[];
  readonly prefs: MotionPrefs;
}

export const emptyYard: YardState = {
  settings: {},
  rules: [],
  budget: { played: [] },
  decisions: [],
};

export function yardOf(state: { readonly yard?: YardState | undefined }): YardState {
  return state.yard ?? emptyYard;
}

export function rankOf(rung: Rung): number {
  return rungs.indexOf(rung);
}

export function stillShown(setting: Pick<Setting, "state">): boolean {
  return setting.state === "live" || setting.state === "pinned";
}

export function byArrival(a: YardSetting, b: YardSetting): number {
  return parseTs(a.at) - parseTs(b.at) || byId(a, b);
}

export function byId(a: Pick<Setting, "id">, b: Pick<Setting, "id">): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type YardOwner =
  | { readonly kind: "creature"; readonly slug: Slug }
  | { readonly kind: "thread"; readonly sessionId: SessionId };

export function ownerOf(setting: Pick<Setting, "creature" | "sessionId">): YardOwner {
  return setting.creature === null
    ? { kind: "thread", sessionId: setting.sessionId }
    : { kind: "creature", slug: setting.creature };
}

export function belongsTo(
  setting: Pick<Setting, "creature" | "sessionId">,
  owner: YardOwner,
): boolean {
  return owner.kind === "creature"
    ? setting.creature === owner.slug
    : setting.creature === null && setting.sessionId === owner.sessionId;
}
