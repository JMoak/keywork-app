import type { Usage } from "./events.ts";

export const delegateToolName = "delegate";

export const childOutcomes = ["completed", "interrupted", "failed", "denied"] as const;

export type ChildOutcome = (typeof childOutcomes)[number];

export interface RefusedCall {
  tool: string;
  callId: string;
}

export interface ChildStarted {
  callId: string;
  sessionId?: string;
  title: string;
  bot?: string;
}

export interface ChildFinished {
  callId: string;
  sessionId?: string;
  outcome: ChildOutcome;
  usage: Usage;
  costNanos?: number;
  refused?: readonly RefusedCall[];
}

export interface ChildProvenance {
  sessionId: string | undefined;
  bot: string | undefined;
  outcome: ChildOutcome;
}

export function childProvenanceOf(delegateResult: string): ChildProvenance | undefined {
  const match = provenanceLine.exec(delegateResult.split("\n", 1)[0] ?? "");
  if (match === null) return undefined;
  const [, sessionId, bot, outcome] = match;
  return {
    sessionId: sessionId === unsavedChild ? undefined : sessionId,
    bot,
    outcome: outcome as ChildOutcome,
  };
}

export function childAnswerOf(delegateResult: string): string {
  return delegateResult.split("\n").slice(2).join("\n");
}

const unsavedChild = "unsaved";

const provenanceLine =
  /^↳ child (\S+)(?: · ([a-z0-9][a-z0-9-]*))? · (completed|interrupted|failed|denied)$/;
