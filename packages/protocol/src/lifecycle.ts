import type { SessionSummary } from "./sessions.ts";

export type RemoveOutcome = SessionSummary | "missing" | "busy";

export type RestoreOutcome = SessionSummary | "missing";

export type DiscardTrashedOutcome = "discarded" | "missing";

export interface PurgedTrash {
  purged: number;
}

export const lifecycleRoutes = [
  { method: "DELETE", path: "/sessions/{id}", operationId: "removeSession" },
  { method: "GET", path: "/trash", operationId: "listTrash" },
  { method: "POST", path: "/trash/{id}/restore", operationId: "restoreSession" },
  { method: "DELETE", path: "/trash/{id}", operationId: "discardTrashedSession" },
  { method: "DELETE", path: "/trash", operationId: "purgeTrash" },
] as const;
