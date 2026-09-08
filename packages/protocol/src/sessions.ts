import type { Message } from "./events.ts";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  costNanos?: number;
  arc?: string;
  bot?: string;
}

export interface SessionDetail extends SessionSummary {
  cwd: string;
  live: boolean;
  asOf: number;
  messages: readonly Message[];
}

export type PromptOutcome = "accepted" | "missing";

export type AbortOutcome = "aborted" | "idle" | "missing";

export interface PendingAsk {
  sessionId: string;
  callId: string;
  tool: string;
  arguments: unknown;
  askedAt: string;
}

export type AskVerdict = "granted" | "denied";

export type AnswerOutcome = "settled" | "missing" | "already-settled";
