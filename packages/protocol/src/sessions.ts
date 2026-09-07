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
  messages: readonly Message[];
}

export type PromptOutcome = "accepted" | "missing";

export type AbortOutcome = "aborted" | "idle" | "missing";
