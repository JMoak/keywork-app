export const rungs = ["glyph", "lantern", "card", "unfold", "stage"] as const;

export type Rung = (typeof rungs)[number];

export type ProposedRung = Exclude<Rung, "glyph">;

export const settingKinds = ["file", "diff", "report", "thread", "chore", "url", "note"] as const;

export type SettingKind = (typeof settingKinds)[number];

export interface SettingSubject {
  kind: SettingKind;
  ref: string;
  title?: string;
}

export type IsoTime = string;

export type SettingUntil = "seen" | "rests" | IsoTime;

export const settingStates = ["live", "seen", "pinned", "dismissed", "withdrawn"] as const;

export type SettingState = (typeof settingStates)[number];

export const settingOrigins = ["creature", "keeper"] as const;

export type SettingOrigin = (typeof settingOrigins)[number];

export interface Setting {
  id: string;
  creature: string | null;
  sessionId: string;
  what: SettingSubject;
  rung: Rung;
  why: string;
  at: string;
  until: SettingUntil;
  state: SettingState;
  // Since contract 1.28; an older engine sends none of these: read `from` and `replaces` as null,
  // `origin` as creature.
  from?: string | null | undefined;
  origin?: SettingOrigin | undefined;
  replaces?: string | null | undefined;
}

export const showOutcomes = ["seen", "pinned", "unpinned", "dismissed", "withdrawn"] as const;

export type ShowOutcome = (typeof showOutcomes)[number];

export type KeeperShowOutcome = Exclude<ShowOutcome, "withdrawn">;

export type ShowSettledBy = "keeper" | "creature" | "time";

export interface ShowProposed {
  setting: Setting;
}

export interface ShowSettled {
  id: string;
  outcome: ShowOutcome;
  by: ShowSettledBy;
}

export interface ShowListing {
  settings: Setting[];
}

export interface ShowAnswer {
  outcome: KeeperShowOutcome;
}

export interface ShowAnswered {
  setting: Setting;
}

export interface ShowOpening {
  what: SettingSubject;
  from: string;
  rung: "unfold";
}

export interface ShowOpened {
  setting: Setting;
}

export const showAnswerBody = ["outcome"] as const;

export const showOpeningBody = ["what", "from", "rung"] as const;

export const showRoutes = [
  { method: "GET", path: "/show", operationId: "listSettings" },
  { method: "POST", path: "/show", operationId: "openSetting" },
  { method: "POST", path: "/show/{id}/answer", operationId: "answerSetting" },
] as const;
