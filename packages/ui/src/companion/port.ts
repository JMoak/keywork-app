export type Tier = "interact" | "active" | "ambient" | "rest" | "hidden";

export type PresenceMode = "floating" | "tray" | "pane" | "notification";

export interface Presence {
  mode: PresenceMode | "off";
  window: "shown" | "tucked" | "none";
  reason: string;
}

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
  residents?: readonly CompanionCreature[] | undefined;
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

export const restingConditions: CompanionConditions = {
  ceiling: "ambient",
  onBattery: false,
  scale: 100,
  still: false,
  quiet: false,
  motion: "system",
  reducedTransparency: false,
  forcedColors: false,
  keyboardReachable: true,
  wantsMask: false,
};

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

export interface AnswerRequest {
  callId: string;
  pick: AnswerPick;
  accept?: ChoreAccept | undefined;
  overturn?: OverturnOffer | undefined;
}

export interface WakeupReport {
  count: number;
  tier: Tier;
}

export interface CompanionPort {
  onSnapshot(listener: (snapshot: CompanionSnapshot) => void): () => void;
  onConditions(listener: (conditions: CompanionConditions) => void): () => void;
  ready(): void;
  setInteractive(inside: boolean): void;
  sendMask(mask: HitMask): void;
  drag(delta: DragDelta): void;
  dragEnd(): void;
  nudge(step: NudgeStep): void;
  home(): void;
  openMenu(at: { x: number; y: number }): void;
  open(threadId: string | undefined): void;
  answer(request: AnswerRequest): void;
  reportWakeups(report: WakeupReport): void;
}

export interface CompanionPreferences {
  version: 1;
  enabled: boolean;
  optInOffered: boolean;
  mode: PresenceMode;
  hidden: boolean;
  still: boolean;
  quiet: boolean;
  onlyWhileBusy: boolean;
  size: number;
  shortcut: string | null;
  motion: MotionChoice;
  positions: Record<string, unknown>;
  selfTest?: { result: "clear" | "opaque" | "unknown"; gpu: string; at: string } | undefined;
}

export type PreferencePatch = Partial<Omit<CompanionPreferences, "version">>;

export interface CompanionHost {
  publish(snapshot: CompanionSnapshot): void;
  preferences(): Promise<CompanionPreferences>;
  setPreferences(patch: PreferencePatch): Promise<CompanionPreferences>;
  presence(): Promise<Presence>;
  show(): Promise<void>;
  hide(): Promise<void>;
  onPresenceChanged(listener: (presence: Presence) => void): () => void;
  onAnswerRequested(listener: (request: AnswerRequest) => void): () => void;
  onOpenRequested(listener: (threadId: string | undefined) => void): () => void;
  onSettingsRequested(listener: () => void): () => void;
  onSwitchRequested(listener: (creature: string) => void): () => void;
}

export const companionGlobal = "companionPort";

export function companionPortFromWindow(): CompanionPort | undefined {
  const candidate = (globalThis as Record<string, unknown>)[companionGlobal];
  return isCompanionPort(candidate) ? candidate : undefined;
}

export function companionPageRequested(
  location: Pick<Location, "search"> = window.location,
): boolean {
  return new URLSearchParams(location.search).has("companion");
}

function isCompanionPort(candidate: unknown): candidate is CompanionPort {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "onSnapshot" in candidate &&
    "setInteractive" in candidate &&
    "drag" in candidate
  );
}
