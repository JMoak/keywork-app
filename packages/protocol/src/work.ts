import type { QueuedPrompt } from "./events.ts";

export interface SessionWork {
  id: string;
  title: string;
  working: boolean;
  queued: number;
  asks: number;
  children: number;
}

export interface WorkInFlight {
  sessions: readonly SessionWork[];
  asks: number;
  children: number;
}

export interface StoppedSession {
  id: string;
  interrupted: boolean;
  setAside: readonly QueuedPrompt[];
}

export interface WoundDown {
  sessions: readonly StoppedSession[];
  asks: number;
}

export const workRoutes = [
  { method: "GET", path: "/work", operationId: "readWork" },
  { method: "POST", path: "/shutdown", operationId: "shutDown" },
] as const;
