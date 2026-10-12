import type { Usage } from "./events.ts";
import type { CompactionEntry } from "./sessions.ts";

export const effortLevels = ["low", "medium", "high", "xhigh", "max"] as const;

export type EffortLevel = (typeof effortLevels)[number];

export const presetOrder = ["careful", "standard", "open"] as const;

export type PresetName = (typeof presetOrder)[number];

export type ActivePreset = PresetName | "custom";

export type PromptBehavior = "steer" | "queue";

export interface SessionState {
  model?: string;
  thinking: boolean;
  effort?: EffortLevel;
  title: string;
  leafId: string | null;
  arc?: string;
  bot?: string;
  undoable: boolean;
  redoable: boolean;
}

export interface ModelReference {
  provider: string;
  model: string;
}

export type ResolutionFailure = { message: string } & (
  | { code: "unconfigured"; available: readonly string[] }
  | { code: "ambiguous"; reference: string; candidates: readonly string[] }
  | { code: "unknown-provider"; reference: string; provider: string; known: readonly string[] }
  | {
      code: "unknown-model";
      reference: string;
      provider: string | undefined;
      known: readonly string[];
    }
  | { code: "disabled-provider"; reference: string; provider: string }
  | { code: "unavailable-credential"; reference: string; provider: string; expected: string }
  | { code: "unsupported-protocol"; reference: string; protocol: string }
  | { code: "missing-capability"; reference: string; model: string; capability: string }
  | { code: "insecure-endpoint"; reference: string; provider: string; endpoint: string }
);

export interface ModelSwitch {
  model: ModelReference;
  notice: string;
}

export interface ThinkingSwitch {
  thinking: boolean;
}

export interface EffortSwitch {
  effort: EffortLevel | null;
}

export interface Compacted {
  compacted: CompactionEntry | null;
  notices: readonly string[];
}

export interface UndonePrompt {
  entryId: string;
  text: string;
}

export interface Undone {
  prompt: UndonePrompt | null;
  filesNote: string;
  undoable: boolean;
  redoable: boolean;
}

export interface Redone {
  restored: true;
  undoable: boolean;
  redoable: boolean;
}

export interface ContextReport {
  used: number;
  window: number;
  flushAt: number;
  compactAt: number;
  declared: boolean;
  fullness: number;
  flushDue: boolean;
  compactionDue: boolean;
  basis: "estimated";
}

export interface CostRollup {
  nanos: number;
  pricedTurns: number;
  meteredTurns: number;
  unpricedTurns: number;
}

export interface CacheMiss {
  cause: string;
  missedTokens?: number;
}

export interface ModelCost {
  reference: string;
  turns: number;
  usage: Usage;
  rollup: CostRollup;
}

export interface CostReport {
  rollup: CostRollup;
  usage: Usage;
  basis: string;
  modelId?: string;
  cacheMiss?: CacheMiss;
  models: readonly ModelCost[];
}

export type ExportScope = "path" | "tree";

export interface ExportRequest {
  scope?: ExportScope;
  out?: string;
}

export type ExportedSession = { html: string } | { file: string };

export interface Renamed {
  title: string;
}

export interface PresetSwitch {
  from: ActivePreset;
  to: PresetName;
}

export type ControlRefusalKind =
  | "invalid"
  | "unresolved"
  | "busy"
  | "nothing"
  | "outside-scope"
  | "needs-confirmation"
  | "unavailable";

export interface ControlRefusal {
  refused: ControlRefusalKind;
  detail: string;
  failure?: ResolutionFailure;
}

export type SessionVerbReading<Answer> = Answer | ControlRefusal | "missing";

export type ModelReading = SessionVerbReading<ModelSwitch>;
export type ThinkingReading = SessionVerbReading<ThinkingSwitch>;
export type EffortReading = SessionVerbReading<EffortSwitch>;
export type CompactReading = SessionVerbReading<Compacted>;
export type UndoReading = SessionVerbReading<Undone>;
export type RedoReading = SessionVerbReading<Redone>;
export type ExportReading = SessionVerbReading<ExportedSession>;
export type RenameReading = SessionVerbReading<Renamed>;
export type ContextReading = ContextReport | "missing";
export type CostReading = CostReport | "missing";
export type PresetReading = PresetSwitch | ControlRefusal;

export function isControlRefusal(value: unknown): value is ControlRefusal {
  return typeof value === "object" && value !== null && "refused" in value && "detail" in value;
}

export function isEffortLevel(word: string): word is EffortLevel {
  return (effortLevels as readonly string[]).includes(word);
}

export function isPresetName(word: string): word is PresetName {
  return (presetOrder as readonly string[]).includes(word);
}
