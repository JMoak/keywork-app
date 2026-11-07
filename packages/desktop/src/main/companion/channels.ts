export const companionChannels = {
  publish: "companion:publish",
  preferences: "companion:preferences",
  setPreferences: "companion:set-preferences",
  presence: "companion:presence",
  presenceChanged: "companion:presence-changed",
  show: "companion:show",
  hide: "companion:hide",
  answerRequested: "companion:answer-requested",
  openRequested: "companion:open-requested",
  settingsRequested: "companion:settings-requested",
  switchRequested: "companion:switch-requested",
  snapshot: "companion:snapshot",
  conditions: "companion:conditions",
  ready: "companion:ready",
  interactive: "companion:interactive",
  mask: "companion:mask",
  drag: "companion:drag",
  dragEnd: "companion:drag-end",
  nudge: "companion:nudge",
  home: "companion:home",
  menu: "companion:menu",
  open: "companion:open",
  answer: "companion:answer",
  wakeups: "companion:wakeups",
} as const;

export type PresenceMode = "floating" | "tray" | "pane" | "notification";

export type WindowStanding = "shown" | "tucked" | "none";

export interface Presence {
  mode: PresenceMode | "off";
  window: WindowStanding;
  reason: string;
}

export type Tier = "interact" | "active" | "ambient" | "rest" | "hidden";

export type MotionChoice = "system" | "reduce" | "full";

export type SemanticState = "porch" | "blocked" | "back" | "working" | "paused" | "idle";

export type WorkTool = "bash" | "read" | "edit" | undefined;

export type AnswerPick = "approve" | "once" | "session" | "workspace" | "deny";

export interface NeedsYouBubble {
  title: string;
  line: string;
  callId: string | undefined;
  answers: readonly AnswerPick[];
  accept?: ChoreAccept | undefined;
  overturn?: OverturnOffer | undefined;
}

export interface ChoreAccept {
  creature: string;
  routineId: string;
  digest: string;
}

export interface OverturnOffer {
  recordId: string;
}

export interface HeldDecision {
  recordId: string;
  sessionId: string;
  title: string;
  tool: string;
  ruleClass: string;
}

export interface HeldChoreNeed {
  creature: string;
  routineId: string;
  line: string;
  reason: string;
  digest: string | undefined;
}

export interface CompanionCreature {
  name: string;
  hueStop: number | undefined;
  slug?: string | undefined;
}

export interface CompanionSnapshot {
  creature: CompanionCreature;
  residents?: readonly CompanionCreature[] | undefined;
  state: SemanticState;
  stateLabel: string;
  activeThreads: number;
  finishedUnseen: number;
  threadId: string | undefined;
  tool: WorkTool;
  needsYou: NeedsYouBubble | undefined;
  heldChore?: HeldChoreNeed | undefined;
  decided?: HeldDecision | undefined;
  crate?: boolean | undefined;
  waiting?: number | undefined;
}

export interface CompanionConditions {
  ceiling: Tier;
  onBattery: boolean;
  scale: number;
  still: boolean;
  quiet: boolean;
  motion: MotionChoice;
  reducedTransparency: boolean;
  forcedColors: boolean;
  keyboardReachable: boolean;
  wantsMask: boolean;
}

export interface HitMask {
  width: number;
  height: number;
  bits: Uint8Array;
}

export interface DragDelta {
  dx: number;
  dy: number;
}

export interface NudgeStep {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

export interface MenuRequest {
  x: number;
  y: number;
}

export interface AnswerRequest {
  callId: string;
  pick: AnswerPick;
  accept?: ChoreAccept | undefined;
  overturn?: OverturnOffer | undefined;
}

export const consoleGlobal = "keyworkHost";

export const companionGlobal = "companionPort";
