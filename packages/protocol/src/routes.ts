import { lifecycleRoutes } from "./lifecycle.ts";
import { permissionRoutes } from "./permissions.ts";

export const protocolVersion = "0.1.1";

export type HttpMethod = "GET" | "POST" | "DELETE";

export interface RouteShape {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
}

export const routes = [
  { method: "GET", path: "/doc", operationId: "getDocument" },
  { method: "GET", path: "/events", operationId: "streamEvents" },
  { method: "GET", path: "/sessions", operationId: "listSessions" },
  { method: "POST", path: "/sessions", operationId: "createSession" },
  { method: "GET", path: "/sessions/{id}", operationId: "readSession" },
  { method: "POST", path: "/sessions/{id}/prompt", operationId: "promptSession" },
  { method: "POST", path: "/sessions/{id}/inject", operationId: "injectPrompt" },
  { method: "POST", path: "/sessions/{id}/abort", operationId: "abortSession" },
  { method: "GET", path: "/sessions/{id}/entries", operationId: "readSessionEntries" },
  { method: "POST", path: "/sessions/{id}/fork", operationId: "forkSession" },
  { method: "POST", path: "/sessions/{id}/label", operationId: "labelSessionEntry" },
  { method: "POST", path: "/sessions/{id}/leaf", operationId: "moveSessionLeaf" },
  { method: "GET", path: "/sessions/{id}/changes", operationId: "readSessionChanges" },
  { method: "GET", path: "/sessions/{id}/changes/file", operationId: "readChangedFile" },
  { method: "POST", path: "/sessions/{id}/model", operationId: "setSessionModel" },
  { method: "POST", path: "/sessions/{id}/thinking", operationId: "setSessionThinking" },
  { method: "POST", path: "/sessions/{id}/effort", operationId: "setSessionEffort" },
  { method: "POST", path: "/sessions/{id}/compact", operationId: "compactSession" },
  { method: "POST", path: "/sessions/{id}/undo", operationId: "undoSession" },
  { method: "POST", path: "/sessions/{id}/redo", operationId: "redoSession" },
  { method: "GET", path: "/sessions/{id}/context", operationId: "readSessionContext" },
  { method: "GET", path: "/sessions/{id}/cost", operationId: "readSessionCost" },
  { method: "POST", path: "/sessions/{id}/export", operationId: "exportSession" },
  { method: "POST", path: "/sessions/{id}/rename", operationId: "renameSession" },
  { method: "POST", path: "/preset", operationId: "applyPreset" },
  { method: "GET", path: "/asks", operationId: "listAsks" },
  { method: "POST", path: "/asks/{callId}", operationId: "answerAsk" },
  { method: "GET", path: "/memory", operationId: "readMemory" },
  { method: "GET", path: "/memory/inbox", operationId: "listMemoryInbox" },
  { method: "POST", path: "/memory/inbox/{id}/approve", operationId: "approveStagedItem" },
  { method: "POST", path: "/memory/inbox/{id}/discard", operationId: "discardStagedItem" },
  { method: "GET", path: "/memory/notes", operationId: "listMemoryNotes" },
  { method: "GET", path: "/memory/notes/{name}", operationId: "readMemoryNote" },
  { method: "GET", path: "/memory/daily", operationId: "listMemoryDailyDates" },
  { method: "GET", path: "/memory/daily/{date}", operationId: "readMemoryDaily" },
  { method: "GET", path: "/memory/ledger", operationId: "readMemoryLedger" },
  { method: "POST", path: "/memory/ledger/{id}/revert", operationId: "revertMemoryLedgerEntry" },
  { method: "POST", path: "/memory/ask", operationId: "askMemory" },
  { method: "GET", path: "/arcs/{slug}/airlock", operationId: "readAirlock" },
  {
    method: "POST",
    path: "/arcs/{slug}/airlock/candidates/{note}",
    operationId: "triageAirlockCandidate",
  },
  { method: "POST", path: "/arcs/{slug}/airlock/questions", operationId: "triageAirlockQuestion" },
  { method: "POST", path: "/arcs/{slug}/airlock/deliver", operationId: "deliverAirlock" },
  { method: "POST", path: "/arcs/{slug}/airlock/finish", operationId: "finishAirlock" },
  { method: "GET", path: "/workspace", operationId: "readWorkspace" },
  { method: "GET", path: "/tree", operationId: "readTree" },
  { method: "GET", path: "/files", operationId: "readFile" },
  { method: "POST", path: "/workspace/trust", operationId: "trustWorkspace" },
  { method: "GET", path: "/mcp", operationId: "listMcpServers" },
  { method: "POST", path: "/mcp/{name}/restart", operationId: "restartMcpServer" },
  { method: "POST", path: "/mcp/{name}/enabled", operationId: "setMcpServerEnabled" },
  { method: "GET", path: "/mcp/{name}/tools", operationId: "listMcpServerTools" },
  { method: "GET", path: "/arcs", operationId: "listArcs" },
  { method: "POST", path: "/arcs", operationId: "createArc" },
  { method: "POST", path: "/arcs/{slug}/close", operationId: "closeArc" },
  { method: "POST", path: "/arcs/{slug}/abandon", operationId: "abandonArc" },
  { method: "POST", path: "/sessions/{id}/arc", operationId: "bindSessionArc" },
  { method: "GET", path: "/bots", operationId: "listBots" },
  { method: "POST", path: "/bots", operationId: "createBot" },
  { method: "POST", path: "/sessions/{id}/bot", operationId: "bindSessionBot" },
  { method: "GET", path: "/workspaces", operationId: "listWorkspaces" },
  { method: "POST", path: "/workspaces", operationId: "createWorkspace" },
  { method: "POST", path: "/workspaces/use", operationId: "useWorkspace" },
  { method: "POST", path: "/workspaces/{slug}/focus", operationId: "focusWorkspaceDir" },
  { method: "POST", path: "/workspaces/{slug}/unfocus", operationId: "unfocusWorkspaceDir" },
  { method: "GET", path: "/themes", operationId: "listThemes" },
  ...lifecycleRoutes,
  ...permissionRoutes,
] as const satisfies readonly RouteShape[];

export type OperationId = (typeof routes)[number]["operationId"];

export const operationIds: readonly OperationId[] = routes.map((route) => route.operationId);
