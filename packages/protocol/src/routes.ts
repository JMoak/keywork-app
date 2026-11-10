import { campaignRequestBodies, campaignRoutes } from "./campaigns.ts";
import { creatureProjectRoutes, projectThreadBody } from "./creature-projects.ts";
import {
  creatureDraftBody,
  creaturePatchBody,
  creatureRoutes,
  recordIdBody,
  ruleClassBody,
} from "./creatures.ts";
import { lifecycleRoutes } from "./lifecycle.ts";
import { forgetApplyBody, forgetSourceBody } from "./memory.ts";
import { creatureMessageBody, meshRoutes } from "./mesh.ts";
import { modelRoutes } from "./models.ts";
import { permissionRoutes } from "./permissions.ts";
import { routineFileBody, routineRoutes } from "./routines.ts";
import { hunkVerdictBody, promptInjectionBody } from "./sessions.ts";
import { showAnswerBody, showOpeningBody, showRoutes } from "./show.ts";
import { workshopRoutes, workshopTerminalBody } from "./workshops.ts";

export const protocolVersion = "0.4.1";

export const contractVersion = "1.31";

export function contractMajorOf(contract: string): number {
  return Number.parseInt(contract.split(".")[0] ?? "", 10);
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteShape {
  readonly method: HttpMethod;
  readonly path: string;
  readonly operationId: string;
}

export const requestBodies: Readonly<Record<string, readonly string[]>> = {
  ...campaignRequestBodies,
  startCreatureProjectThread: projectThreadBody,
  discussCreatureProjectSession: projectThreadBody,
  receiveCreatureProjectWork: [
    ...projectThreadBody,
    "creature",
    "creature.workspace",
    "creature.slug",
    "project",
  ],
  createCreature: creatureDraftBody,
  updateCreature: creaturePatchBody,
  promoteCreatureClass: ruleClassBody,
  demoteCreatureClass: ruleClassBody,
  overturnCreatureDecision: recordIdBody,
  execInWorkshop: workshopTerminalBody,
  injectPrompt: promptInjectionBody,
  recordHunkVerdict: hunkVerdictBody,
  putRoutine: routineFileBody,
  previewMemoryForget: forgetSourceBody,
  applyMemoryForget: forgetApplyBody,
  sendCreatureMessage: creatureMessageBody,
  answerSetting: showAnswerBody,
  openSetting: showOpeningBody,
};

export const routes = [
  ...creatureProjectRoutes,
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
  { method: "GET", path: "/sessions/{id}/changes/verdicts", operationId: "readHunkVerdicts" },
  { method: "POST", path: "/sessions/{id}/changes/verdicts", operationId: "recordHunkVerdict" },
  { method: "POST", path: "/sessions/{id}/model", operationId: "setSessionModel" },
  { method: "POST", path: "/sessions/{id}/thinking", operationId: "setSessionThinking" },
  { method: "POST", path: "/sessions/{id}/effort", operationId: "setSessionEffort" },
  { method: "POST", path: "/sessions/{id}/compact", operationId: "compactSession" },
  { method: "POST", path: "/sessions/{id}/undo", operationId: "undoSession" },
  { method: "POST", path: "/sessions/{id}/redo", operationId: "redoSession" },
  { method: "POST", path: "/sessions/{id}/restore", operationId: "restoreSessionTurn" },
  { method: "GET", path: "/sessions/{id}/restore", operationId: "previewSessionRestore" },
  { method: "GET", path: "/sessions/{id}/context", operationId: "readSessionContext" },
  { method: "GET", path: "/sessions/{id}/cost", operationId: "readSessionCost" },
  { method: "POST", path: "/sessions/{id}/export", operationId: "exportSession" },
  { method: "POST", path: "/sessions/{id}/rename", operationId: "renameSession" },
  { method: "POST", path: "/sessions/{id}/quiet", operationId: "setSessionQuiet" },
  { method: "POST", path: "/sessions/{id}/flush", operationId: "flushSessionMemory" },
  { method: "POST", path: "/sessions/{id}/forget", operationId: "forgetSessionEntry" },
  { method: "POST", path: "/sessions/{id}/queue/{itemId}/move", operationId: "moveQueuedPrompt" },
  { method: "DELETE", path: "/sessions/{id}/queue/{itemId}", operationId: "cancelQueuedPrompt" },
  { method: "GET", path: "/sessions/{id}/spills/{spillId}", operationId: "readSessionSpill" },
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
  { method: "POST", path: "/memory/forget/preview", operationId: "previewMemoryForget" },
  { method: "POST", path: "/memory/forget/apply", operationId: "applyMemoryForget" },
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
  { method: "POST", path: "/arcs/{slug}/theme", operationId: "setArcTheme" },
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
  ...creatureRoutes,
  ...routineRoutes,
  ...modelRoutes,
  ...workshopRoutes,
  ...meshRoutes,
  ...showRoutes,
  ...campaignRoutes,
] as const satisfies readonly RouteShape[];

export type OperationId = (typeof routes)[number]["operationId"];

export const operationIds: readonly OperationId[] = routes.map((route) => route.operationId);
