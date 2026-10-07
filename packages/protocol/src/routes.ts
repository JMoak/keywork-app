export const protocolVersion = "0.1.1";

export type HttpMethod = "GET" | "POST";

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
  { method: "POST", path: "/sessions/{id}/label", operationId: "labelEntry" },
  { method: "POST", path: "/sessions/{id}/leaf", operationId: "moveLeaf" },
  { method: "GET", path: "/sessions/{id}/changes", operationId: "readChanges" },
  { method: "GET", path: "/sessions/{id}/changes/file", operationId: "readChangedFile" },
  { method: "GET", path: "/asks", operationId: "listAsks" },
  { method: "POST", path: "/asks/{callId}", operationId: "answerAsk" },
  { method: "GET", path: "/memory", operationId: "readMemory" },
  { method: "GET", path: "/memory/inbox", operationId: "readMemoryInbox" },
  { method: "POST", path: "/memory/inbox/{id}/approve", operationId: "approveStagedItem" },
  { method: "POST", path: "/memory/inbox/{id}/discard", operationId: "discardStagedItem" },
  { method: "GET", path: "/memory/notes", operationId: "listMemoryNotes" },
  { method: "GET", path: "/memory/notes/{name}", operationId: "readMemoryNote" },
  { method: "GET", path: "/memory/daily", operationId: "listMemoryDailyDates" },
  { method: "GET", path: "/memory/daily/{date}", operationId: "readMemoryDaily" },
  { method: "GET", path: "/memory/ledger", operationId: "readMemoryLedger" },
  { method: "POST", path: "/memory/ledger/{id}/revert", operationId: "revertMemoryLedgerEntry" },
  { method: "POST", path: "/memory/ask", operationId: "askMemory" },
  { method: "GET", path: "/arcs/{slug}/airlock", operationId: "readArcAirlock" },
  {
    method: "POST",
    path: "/arcs/{slug}/airlock/candidates/{note}",
    operationId: "triageAirlockCandidate",
  },
  { method: "POST", path: "/arcs/{slug}/airlock/questions", operationId: "triageAirlockQuestion" },
  { method: "POST", path: "/arcs/{slug}/airlock/deliver", operationId: "deliverAirlockEligible" },
  { method: "POST", path: "/arcs/{slug}/airlock/finish", operationId: "finishArcAirlock" },
  { method: "GET", path: "/workspace", operationId: "readWorkspace" },
  { method: "GET", path: "/tree", operationId: "listTree" },
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
  { method: "POST", path: "/sessions/{id}/bot", operationId: "switchSessionBot" },
  { method: "GET", path: "/workspaces", operationId: "listWorkspaces" },
  { method: "POST", path: "/workspaces", operationId: "createWorkspace" },
  { method: "POST", path: "/workspaces/use", operationId: "useWorkspace" },
  { method: "POST", path: "/workspaces/{slug}/focus", operationId: "focusWorkspaceDir" },
  { method: "POST", path: "/workspaces/{slug}/unfocus", operationId: "unfocusWorkspaceDir" },
  { method: "GET", path: "/flavors", operationId: "listFlavors" },
] as const satisfies readonly RouteShape[];

export type OperationId = (typeof routes)[number]["operationId"];

export const operationIds: readonly OperationId[] = routes.map((route) => route.operationId);
