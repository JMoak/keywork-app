import {
  type Rung,
  rungs,
  type Setting,
  type SettingKind,
  type SettingOrigin,
  type SettingSize,
} from "@keywork-app/protocol";
import { parseTs } from "../clock/clock.ts";
import type { Budget, GateContext, Verdict } from "../creature/gate.ts";
import type { MotionPrefs } from "../pose/pose.ts";
import type { SessionId, Slug } from "../world/types.ts";

export interface YardState {
  readonly settings: Readonly<Record<string, YardSetting>>;
  readonly rules: readonly YardRule[];
  readonly budget: YardBudget;
  readonly decisions: readonly YardDecision[];
  readonly ruledThings?: readonly string[] | undefined;
  readonly ancestors?: Readonly<Record<string, TrailMark>> | undefined;
  readonly visit?: Visit | undefined;
  readonly awaySince?: number | undefined;
}

export interface YardSetting extends Setting {
  readonly shown: Rung;
  readonly depth: number;
  readonly seenAt?: string | undefined;
  readonly pinnedAt?: string | undefined;
  readonly unfolded?: Unfolded | undefined;
  readonly ruled?: boolean | undefined;
  readonly attention?: Attention | undefined;
  readonly headStart?: Decaying | undefined;
  readonly folded?: string | undefined;
}

export interface Unfolded {
  readonly at: number;
  readonly slot: number;
  readonly focus: SessionId | undefined;
  readonly byHand: boolean;
  readonly lane?: number | undefined;
}

export type Size = "card" | "readable" | "working";

export const sizes: readonly Size[] = ["card", "readable", "working"];

export type AttendKind = "enter" | "leave" | "interact";

export interface Decaying {
  readonly score: number;
  readonly lastAt: number;
}

export interface Attention extends Decaying {
  readonly dwellMs: number;
  readonly entries: number;
  readonly interactions: number;
  readonly interactedAt?: number | undefined;
}

export interface Visit {
  readonly id: string;
  readonly since: number;
  readonly counted: boolean;
}

export interface TrailMark
  extends Pick<Setting, "id" | "from" | "what" | "at" | "creature" | "sessionId"> {
  readonly replaceable?: boolean | undefined;
  readonly pendingFold?: boolean | undefined;
  readonly foldedOnLeaving?: readonly string[] | undefined;
}

export interface YardBudget extends Budget {
  readonly lastUnfolds?: readonly OwnerUnfold[] | undefined;
  readonly outside?: readonly number[] | undefined;
}

export interface OwnerUnfold {
  readonly owner: YardOwner;
  readonly at: number;
}

export type RuleLasts = "while-present" | "always";

export interface YardRule {
  readonly creature: Slug | null;
  readonly kind: SettingKind;
  readonly rung: Rung;
  readonly lasts: RuleLasts;
  readonly thread?: SessionId | undefined;
}

export interface YardContext extends GateContext {
  readonly focusedThread: SessionId | undefined;
  readonly keeperSpokeAt: Readonly<Record<SessionId, number>>;
  readonly rules: readonly YardRule[];
  readonly draftOpen?: boolean | undefined;
  readonly streaming?: boolean | undefined;
  readonly displayShared?: boolean | undefined;
  readonly fullscreenElsewhere?: boolean | undefined;
  readonly railFocused?: boolean | undefined;
  readonly returnedAt?: number | undefined;
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
  readonly slot?: number | undefined;
  readonly size: Size;
  readonly parent: string | null;
}

export interface YardLayout {
  readonly viewport: Rect;
  readonly hub: Rect;
  readonly settings: readonly YardSetting[];
  readonly prefs: MotionPrefs;
  readonly inside?: string | undefined;
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

export function sizeOf(setting: Pick<YardSetting, "size">): SettingSize {
  return setting.size ?? "readable";
}

export function originOf(setting: Pick<Setting, "origin">): SettingOrigin {
  return setting.origin ?? "creature";
}

export function fromOf(setting: Pick<Setting, "from">): string | null {
  return setting.from ?? null;
}

export function byArrival(a: Pick<Setting, "at" | "id">, b: Pick<Setting, "at" | "id">): number {
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

export function ownerKeyOf(owner: YardOwner): string {
  return owner.kind === "creature" ? `creature:${owner.slug}` : `thread:${owner.sessionId}`;
}

export function sameOwner(a: YardOwner, b: YardOwner): boolean {
  return ownerKeyOf(a) === ownerKeyOf(b);
}

export function thingOf(setting: Pick<Setting, "creature" | "sessionId" | "what">): string {
  return [ownerKeyOf(ownerOf(setting)), setting.what.kind, setting.what.ref].join("\n");
}
