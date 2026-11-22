export const rungs = ["glyph", "lantern", "card", "unfold", "stage"] as const;

export type Rung = (typeof rungs)[number];

export type ProposedRung = Exclude<Rung, "glyph">;

export const settingKinds = [
  "file",
  "diff",
  "report",
  "thread",
  "chore",
  "url",
  "note",
  "pane",
] as const;

export type SettingKind = (typeof settingKinds)[number];

// The console's own panes a session may set out (contract 1.34): the `ref` of a "pane" setting.
export const settingPanes = [
  "sessions",
  "arcs",
  "files",
  "context",
  "memory",
  "needs-you",
  "permissions",
  "mcp",
  "workspaces",
] as const;

export type SettingPane = (typeof settingPanes)[number];

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

export const settingSizes = ["card", "readable", "working"] as const;

export type SettingSize = (typeof settingSizes)[number];

export const settingPlaces = ["beside", "outside"] as const;

export type SettingPlace = (typeof settingPlaces)[number];

export const settingWeights = ["lead", "support", "aside"] as const;

export type SettingWeight = (typeof settingWeights)[number];

export const moods = [
  "calm",
  "brisk",
  "eager",
  "playful",
  "urgent",
  "decisive",
  "tentative",
] as const;

export type Mood = (typeof moods)[number];

export const stageLattice = 12;

export interface Seat {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

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
  // Since contract 1.29; absent when none was named, and a keeper's opening never carries one.
  size?: SettingSize | undefined;
  // Since contract 1.33; an older engine sends none of these: read `where` as beside.
  where?: SettingPlace | undefined;
  seat?: Seat | undefined;
  weight?: SettingWeight | undefined;
  mood?: Mood | undefined;
  // Present when an agent outside the session set this out through a creature's MCP server; the
  // name is the one its client gave, when it gave one. The setting is still the creature's.
  agent?: SettingAgent | undefined;
  // A word or two the session asked the keeper to read on the setting while it is out; a change
  // arrives as `show.changed`.
  mark?: string | undefined;
}

export const agentColors = ["cyan", "magenta", "green", "yellow", "blue"] as const;

export type AgentColor = (typeof agentColors)[number];

export interface SettingAgent {
  name?: string | undefined;
  // The colour the engine keeps for this agent, one to each while one is free.
  color?: AgentColor | undefined;
}

export interface ShowChanged {
  setting: Setting;
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
  // How the pane leaves, when the session named a mood in `withdraw`.
  mood?: Mood | undefined;
}

export const arrangementShapes = [
  "grid",
  "columns",
  "rows",
  "lead-and-cards",
  "lead-and-stack",
  "split",
  "board",
] as const;

export type ArrangementShape = (typeof arrangementShapes)[number];

export const arrangementRelations = ["sequence", "alternatives", "tasks", "notes"] as const;

export type ArrangementRelation = (typeof arrangementRelations)[number];

export type ArrangementReach = "room" | "display";

export type ArrangementSide = "left" | "right" | "top" | "bottom";

export interface ArrangedSeat {
  readonly id: string;
  readonly seat: Seat;
}

export interface Arrangement {
  readonly id: string;
  readonly creature: string | null;
  readonly sessionId: string;
  readonly at: string;
  readonly panes: readonly string[];
  readonly shape?: ArrangementShape | undefined;
  readonly relation?: ArrangementRelation | undefined;
  readonly seats?: readonly ArrangedSeat[] | undefined;
  readonly lead?: string | undefined;
  // Where the large seat stands when the console lays the panes out; absent means left.
  readonly side?: ArrangementSide | undefined;
  readonly over?: ArrangementReach | undefined;
  readonly mood?: Mood | undefined;
  // Present when the session's other panes outside should step back beside the conversation.
  readonly rest?: "beside" | undefined;
}

export interface ShowArranged {
  arrangement: Arrangement;
}

export const placementMovers = ["creature", "keeper", "console"] as const;

export type PlacementMover = (typeof placementMovers)[number];

export type PlacementPlace = SettingPlace | "inside";

export interface Placement {
  readonly id: string;
  readonly where: PlacementPlace;
  readonly seat?: Seat | undefined;
  readonly by: PlacementMover;
  // Since contract 1.33; one short plain sentence when a setting is not where it was asked to be.
  readonly note?: string | undefined;
}

export type StageRoom = "beside" | "over" | "display";

export interface Stage {
  readonly room: StageRoom;
  readonly cardsAcross: number;
  readonly cardsDown: number;
  readonly consoleMaximised: boolean;
}

export interface ArrangementAnswer {
  readonly id: string;
  readonly said: string;
}

export interface PlacementsReport {
  readonly stage: Stage;
  readonly placements: readonly Placement[];
  readonly arrangement?: ArrangementAnswer | undefined;
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

export const placementsReportBody = [
  "stage",
  "stage.room",
  "stage.cardsAcross",
  "stage.cardsDown",
  "stage.consoleMaximised",
  "placements",
  "placements.id",
  "placements.where",
  "placements.seat",
  "placements.by",
  "placements.note",
  "arrangement",
  "arrangement.id",
  "arrangement.said",
] as const;

export const showRoutes = [
  { method: "GET", path: "/show", operationId: "listSettings" },
  { method: "POST", path: "/show", operationId: "openSetting" },
  { method: "POST", path: "/show/{id}/answer", operationId: "answerSetting" },
  {
    method: "PUT",
    path: "/sessions/{sessionId}/settings/placements",
    operationId: "reportPlacements",
  },
] as const;
