import type {
  AbortOutcome,
  AirlockDelivery,
  AirlockFinish,
  AirlockReading,
  AirlockTriage,
  AnswerOutcome,
  ApproveOutcome,
  ArcCloseOutcome,
  ArcSummary,
  ArcsView,
  AskRefusal,
  AskScope,
  AskVerdict,
  BotDraft,
  BotEntry,
  BotSummary,
  BusEnvelope,
  CandidateChoice,
  ChangedFileReading,
  ChangesReading,
  CompactReading,
  ContextReading,
  ControlRefusal,
  ControlRefusalKind,
  CostReading,
  DiscardOutcome,
  DiscardTrashedOutcome,
  EffortLevel,
  EffortReading,
  EntryLabel,
  EntryRefusal,
  ExportReading,
  ExportRequest,
  FileRange,
  FileReading,
  FocusedDir,
  ForkedSession,
  ForkOutcome,
  InjectOutcome,
  LabelOutcome,
  LeafOutcome,
  McpServerStatus,
  MemoryAnswer,
  MemoryDaily,
  MemoryDailyDates,
  MemoryGarden,
  MemoryInbox,
  MemoryLedger,
  MemoryNoteDetail,
  MemoryNotes,
  MemoryQuestion,
  ModelReading,
  PendingAsk,
  PermissionRule,
  PermissionsView,
  PresetName,
  PresetReading,
  PromptBehavior,
  PromptInjection,
  PromptOutcome,
  PurgedTrash,
  QuestionChoice,
  RedoReading,
  RemoveOutcome,
  RenameReading,
  ResolutionFailure,
  RestoreOutcome,
  RevertReply,
  RevokeOutcome,
  SessionBinding,
  SessionDetail,
  SessionEntries,
  SessionSummary,
  SurfaceRefusal,
  ThemesView,
  ThinkingReading,
  TreeReading,
  TrustOutcome,
  UndoReading,
  WorkspaceChoice,
  WorkspaceUse,
  WorkspaceView,
  WriteResult,
} from "@keywork-app/protocol";
import {
  envelopeOf,
  type FrameReader,
  frameId,
  noticesOf,
  type StreamNotice,
  sseFrames,
} from "./sse.ts";

export interface KeyworkClient {
  readonly url: string;
  document(): Promise<ServerDocument>;
  sessions(): Promise<readonly SessionSummary[]>;
  session(id: string): Promise<SessionDetail | undefined>;
  createSession(): Promise<SessionSummary>;
  prompt(id: string, text: string, behavior: PromptBehavior): Promise<PromptOutcome>;
  inject(id: string, injection: PromptInjection): Promise<InjectOutcome>;
  abort(id: string): Promise<AbortOutcome>;
  entries(id: string): Promise<SessionEntries | undefined>;
  fork(id: string, entryId: string): Promise<ForkOutcome>;
  labelEntry(id: string, entryId: string, label: string | null): Promise<LabelOutcome>;
  moveLeaf(id: string, entryId: string | null): Promise<LeafOutcome>;
  changes(id: string): Promise<ChangesReading>;
  changedFile(id: string, path: string): Promise<ChangedFileReading>;
  removeSession(id: string): Promise<RemoveOutcome>;
  listTrash(): Promise<readonly SessionSummary[]>;
  restoreSession(id: string): Promise<RestoreOutcome>;
  discardTrashedSession(id: string): Promise<DiscardTrashedOutcome>;
  purgeTrash(): Promise<PurgedTrash>;
  setModel(id: string, reference: string): Promise<ModelReading>;
  setThinking(id: string, on: boolean): Promise<ThinkingReading>;
  setEffort(id: string, level: EffortLevel | null): Promise<EffortReading>;
  compact(id: string, focus?: string): Promise<CompactReading>;
  undo(id: string): Promise<UndoReading>;
  redo(id: string): Promise<RedoReading>;
  context(id: string): Promise<ContextReading>;
  cost(id: string): Promise<CostReading>;
  exportSession(id: string, request?: ExportRequest): Promise<ExportReading>;
  rename(id: string, title: string): Promise<RenameReading>;
  applyPreset(name: PresetName, confirmed?: boolean): Promise<PresetReading>;
  asks(): Promise<readonly PendingAsk[]>;
  answerAsk(callId: string, verdict: AskVerdict, scope?: AskScope): Promise<AnswerOutcome>;
  permissions(): Promise<PermissionsView>;
  revokeWorkspaceGrant(rule: PermissionRule): Promise<RevokeOutcome>;
  revokeSessionGrant(sessionId: string, rule: PermissionRule): Promise<RevokeOutcome>;
  events(options?: EventStreamOptions): AsyncIterable<BusEnvelope>;
  memory(): Promise<MemoryGarden>;
  memoryInbox(): Promise<MemoryInbox>;
  approveStagedItem(id: string): Promise<ApproveOutcome>;
  discardStagedItem(id: string): Promise<DiscardOutcome>;
  memoryNotes(layer?: string): Promise<MemoryNotes | undefined>;
  memoryNote(name: string): Promise<MemoryNoteDetail | undefined>;
  memoryDailyDates(): Promise<MemoryDailyDates>;
  memoryDaily(date: string): Promise<MemoryDaily>;
  memoryLedger(): Promise<MemoryLedger>;
  revertLedgerEntry(id: string): Promise<RevertReply>;
  askMemory(question: MemoryQuestion): Promise<MemoryAnswer>;
  airlock(slug: string): Promise<AirlockReading | undefined>;
  triageAirlockCandidate(
    slug: string,
    note: string,
    choice: CandidateChoice,
  ): Promise<AirlockTriage>;
  triageAirlockQuestion(
    slug: string,
    title: string,
    choice: QuestionChoice,
  ): Promise<AirlockTriage>;
  deliverAirlock(slug: string): Promise<AirlockDelivery>;
  finishAirlock(slug: string, force?: boolean): Promise<AirlockFinish>;
  workspace(): Promise<WorkspaceView>;
  tree(path: string): Promise<TreeReading>;
  file(path: string, range?: FileRange): Promise<FileReading>;
  trustWorkspace(): Promise<TrustOutcome>;
  mcpServers(): Promise<readonly McpServerStatus[]>;
  restartMcpServer(name: string): Promise<McpServerStatus | SurfaceRefusal>;
  setMcpServerEnabled(name: string, on: boolean): Promise<McpServerStatus | SurfaceRefusal>;
  mcpServerTools(name: string): Promise<readonly string[] | SurfaceRefusal>;
  arcs(): Promise<ArcsView | SurfaceRefusal>;
  createArc(slug: string): Promise<ArcSummary | SurfaceRefusal>;
  closeArc(slug: string, direction?: string): Promise<ArcCloseOutcome | SurfaceRefusal>;
  abandonArc(slug: string): Promise<"abandoned" | SurfaceRefusal>;
  setArcTheme(slug: string, theme: string | null): Promise<ArcSummary | SurfaceRefusal>;
  bindSessionArc(id: string, slug: string | null): Promise<SessionBinding | SurfaceRefusal>;
  bots(): Promise<readonly BotSummary[]>;
  createBot(draft: BotDraft): Promise<BotEntry | SurfaceRefusal>;
  bindSessionBot(id: string, name: string | null): Promise<SessionBinding | SurfaceRefusal>;
  workspaces(): Promise<readonly WorkspaceChoice[]>;
  createWorkspace(slug: string): Promise<{ slug: string } | SurfaceRefusal>;
  useWorkspace(slug: string | null): Promise<WorkspaceUse | SurfaceRefusal>;
  focusWorkspaceDir(slug: string | null, dir: string): Promise<FocusedDir | SurfaceRefusal>;
  unfocusWorkspaceDir(slug: string | null, dir: string): Promise<FocusedDir | SurfaceRefusal>;
  themes(): Promise<ThemesView>;
}

export interface ServerDocument {
  version: string;
  operationIds: string[];
}

export interface ServerTicket {
  url: string;
  token: string;
}

export interface EventStreamOptions {
  since?: number | undefined;
  session?: string | undefined;
  signal?: AbortSignal | undefined;
  onOpen?: (() => void) | undefined;
  onNotice?: ((notice: StreamNotice) => void) | undefined;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type Delay = (ms: number, signal: AbortSignal | undefined) => Promise<void>;

export interface ClientSeams {
  fetch?: Fetch;
  readFrames?: FrameReader;
  delay?: Delay;
}

export class ServerRefusal extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ServerRefusal";
    this.status = status;
  }
}

export const reconnectDelaysMs = { first: 250, ceiling: 5000 } as const;

export function reconnectDelayMs(attempt: number): number {
  return Math.min(reconnectDelaysMs.first * 2 ** attempt, reconnectDelaysMs.ceiling);
}

export function keyworkClient(ticket: ServerTicket, seams: ClientSeams = {}): KeyworkClient {
  return clientOver(
    ticket.url.replace(/\/+$/, ""),
    authorizedFetch(ticket, seams.fetch ?? fetch),
    seams,
  );
}

export function keyworkClientOver(transport: Fetch, seams: ClientSeams = {}): KeyworkClient {
  return clientOver("", transport, seams);
}

export function authorizedFetch(ticket: ServerTicket, transport: Fetch): Fetch {
  return (input, init = {}) =>
    transport(input, {
      ...init,
      headers: { authorization: `Bearer ${ticket.token}`, ...(init.headers ?? {}) },
    });
}

function clientOver(url: string, transport: Fetch, seams: ClientSeams): KeyworkClient {
  const readFrames = seams.readFrames ?? sseFrames;
  const delay = seams.delay ?? sleep;
  const request = (method: string, path: string, body?: unknown, init: RequestInit = {}) =>
    transport(`${url}${path}`, {
      ...init,
      method,
      headers: {
        ...(body !== undefined && { "content-type": "application/json" }),
        ...(init.headers ?? {}),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  return {
    url,
    document: async () => documentOf(await json<OpenApiShape>(await request("GET", "/doc"))),
    sessions: async () => {
      const listed = await json<{ sessions: SessionSummary[] }>(await request("GET", "/sessions"));
      return listed.sessions;
    },
    session: async (id) => {
      const response = await request("GET", `/sessions/${encodeURIComponent(id)}`);
      return response.status === 404 ? undefined : json<SessionDetail>(response);
    },
    createSession: () => request("POST", "/sessions").then(json<SessionSummary>),
    prompt: async (id, text, behavior) => {
      const response = await request("POST", `/sessions/${encodeURIComponent(id)}/prompt`, {
        text,
        behavior,
      });
      if (response.status === 404) return "missing";
      const outcome = await json<{ queued: boolean }>(response);
      return outcome.queued ? "queued" : "started";
    },
    inject: async (id, injection) => {
      const response = await request(
        "POST",
        `/sessions/${encodeURIComponent(id)}/inject`,
        injection,
      );
      if (response.status === 404) return "missing";
      const outcome = await json<{ queued: boolean }>(response);
      return outcome.queued ? "queued" : "started";
    },
    abort: async (id) => {
      const response = await request("POST", `/sessions/${encodeURIComponent(id)}/abort`);
      if (response.status === 404) return "missing";
      const outcome = await json<{ interrupted: boolean }>(response);
      return outcome.interrupted ? "aborted" : "idle";
    },
    entries: async (id) => {
      const response = await request("GET", `/sessions/${encodeURIComponent(id)}/entries`);
      return response.status === 404 ? undefined : json<SessionEntries>(response);
    },
    fork: async (id, entryId) => {
      const response = await request("POST", `/sessions/${encodeURIComponent(id)}/fork`, {
        entryId,
      });
      if (response.status === 404) return entryRefusalOf(response);
      return json<ForkedSession>(response);
    },
    labelEntry: async (id, entryId, label) => {
      const response = await request("POST", `/sessions/${encodeURIComponent(id)}/label`, {
        entryId,
        label,
      });
      if (response.status === 404) return entryRefusalOf(response);
      return json<EntryLabel>(response);
    },
    moveLeaf: async (id, entryId) => {
      const response = await request("POST", `/sessions/${encodeURIComponent(id)}/leaf`, {
        entryId,
      });
      if (response.status === 404) return entryRefusalOf(response);
      if (response.status === 409) return "busy";
      return json<{ leafId: string | null }>(response);
    },
    changes: async (id) => {
      const response = await request("GET", `/sessions/${encodeURIComponent(id)}/changes`);
      if (response.status === 404) return "missing";
      if (response.status === 409) return "no-baseline";
      return json<ChangesReading>(response);
    },
    changedFile: async (id, path) => {
      const query = new URLSearchParams({ path });
      const response = await request(
        "GET",
        `/sessions/${encodeURIComponent(id)}/changes/file?${query}`,
      );
      if (response.status === 403) return "outside-scope";
      if (response.status === 404) return "missing";
      if (response.status === 409) return "no-baseline";
      return json<ChangedFileReading>(response);
    },
    ...lifecycleRoutes(request),
    asks: async () => {
      const listed = await json<{ asks: PendingAsk[] }>(await request("GET", "/asks"));
      return listed.asks;
    },
    answerAsk: async (callId, verdict, scope) => {
      const response = await request("POST", `/asks/${encodeURIComponent(callId)}`, {
        verdict,
        ...(scope !== undefined && { scope }),
      });
      if (response.status === 404) return "missing";
      if (response.status === 409) return "already-settled";
      if (response.status === 400) return askRefusalOf(response);
      await json(response);
      return "settled";
    },
    permissions: () => request("GET", "/permissions").then(json<PermissionsView>),
    revokeWorkspaceGrant: async (rule) => {
      const response = await request("POST", "/permissions/workspace/revoke", { rule });
      if (response.status === 400)
        return { refused: "invalid", detail: await refusalDetail(response) };
      if (response.status === 404)
        return { refused: "missing", detail: await refusalDetail(response) };
      return json<RevokeOutcome>(response);
    },
    revokeSessionGrant: async (sessionId, rule) => {
      const response = await request(
        "POST",
        `/permissions/session/${encodeURIComponent(sessionId)}/revoke`,
        { rule },
      );
      if (response.status === 400)
        return { refused: "invalid", detail: await refusalDetail(response) };
      if (response.status === 404)
        return { refused: "missing", detail: await refusalDetail(response) };
      return json<RevokeOutcome>(response);
    },
    ...sessionVerbRoutes(request),
    ...memoryRoutes(request),
    ...workspaceRoutes(request),
    ...surfaceRoutes(request),
    events: (options = {}) =>
      resumingEvents(
        options,
        (lastId) =>
          request("GET", eventsPath(options), undefined, {
            ...(options.signal !== undefined && { signal: options.signal }),
            headers: lastId === undefined ? {} : { "last-event-id": String(lastId) },
          }),
        readFrames,
        delay,
      ),
  };
}

type Request = (method: string, path: string, body?: unknown) => Promise<Response>;

type SessionVerbRoutes = Pick<
  KeyworkClient,
  | "setModel"
  | "setThinking"
  | "setEffort"
  | "compact"
  | "undo"
  | "redo"
  | "context"
  | "cost"
  | "exportSession"
  | "rename"
  | "applyPreset"
>;

function sessionVerbRoutes(request: Request): SessionVerbRoutes {
  const verb = (id: string, name: string, body?: unknown): Promise<Response> =>
    request("POST", `/sessions/${encodeURIComponent(id)}/${name}`, body);
  const reading = (id: string, name: string): Promise<Response> =>
    request("GET", `/sessions/${encodeURIComponent(id)}/${name}`);
  return {
    setModel: async (id, reference) => {
      const response = await verb(id, "model", { reference });
      return response.status === 400 ? unresolvedModel(response) : answered(response);
    },
    setThinking: async (id, on) => answered(await verb(id, "thinking", { on })),
    setEffort: async (id, level) => answered(await verb(id, "effort", { level })),
    compact: async (id, focus) =>
      answered(await verb(id, "compact", focus === undefined ? {} : { focus })),
    undo: async (id) => answered(await verb(id, "undo")),
    redo: async (id) => answered(await verb(id, "redo")),
    context: async (id) => {
      const response = await reading(id, "context");
      return response.status === 404 ? "missing" : json(response);
    },
    cost: async (id) => {
      const response = await reading(id, "cost");
      return response.status === 404 ? "missing" : json(response);
    },
    exportSession: async (id, exportRequest = {}) => {
      const response = await verb(id, "export", exportRequest);
      return response.status === 200 ? { html: await response.text() } : answered(response);
    },
    rename: async (id, title) => answered(await verb(id, "rename", { title })),
    applyPreset: async (name, confirmed = false) => {
      const response = await request("POST", "/preset", {
        name,
        ...(confirmed && { confirmed: true }),
      });
      return (await controlRefusalOf(response, "needs-confirmation")) ?? json(response);
    },
  };
}

type LifecycleRoutes = Pick<
  KeyworkClient,
  "removeSession" | "listTrash" | "restoreSession" | "discardTrashedSession" | "purgeTrash"
>;

function lifecycleRoutes(request: Request): LifecycleRoutes {
  const trashed = (id: string, tail = ""): string => `/trash/${encodeURIComponent(id)}${tail}`;
  return {
    removeSession: async (id) => {
      const response = await request("DELETE", `/sessions/${encodeURIComponent(id)}`);
      if (response.status === 404) return "missing";
      if (response.status === 409) return "busy";
      return json<SessionSummary>(response);
    },
    listTrash: async () =>
      (await json<{ sessions: SessionSummary[] }>(await request("GET", "/trash"))).sessions,
    restoreSession: async (id) => {
      const response = await request("POST", trashed(id, "/restore"));
      return response.status === 404 ? "missing" : json<SessionSummary>(response);
    },
    discardTrashedSession: async (id) => {
      const response = await request("DELETE", trashed(id));
      if (response.status === 404) return "missing";
      await json(response);
      return "discarded";
    },
    purgeTrash: () => request("DELETE", "/trash").then(json<PurgedTrash>),
  };
}

const missingSessionDetail = "no session has that id";

async function answered<T>(response: Response): Promise<T | ControlRefusal | "missing"> {
  if (response.status === 404) {
    const detail = await refusalDetail(response);
    return detail === missingSessionDetail ? "missing" : { refused: "nothing", detail };
  }
  return (await controlRefusalOf(response, "busy")) ?? json<T>(response);
}

async function controlRefusalOf(
  response: Response,
  conflict: ControlRefusalKind,
): Promise<ControlRefusal | undefined> {
  const refused = controlRefusalKindOf(response.status, conflict);
  return refused === undefined ? undefined : { refused, detail: await refusalDetail(response) };
}

function controlRefusalKindOf(
  status: number,
  conflict: ControlRefusalKind,
): ControlRefusalKind | undefined {
  switch (status) {
    case 400:
      return "invalid";
    case 403:
      return "outside-scope";
    case 409:
      return conflict;
    case 501:
      return "unavailable";
    default:
      return undefined;
  }
}

async function unresolvedModel(response: Response): Promise<ControlRefusal> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    failure?: ResolutionFailure;
  };
  const detail = body.error ?? `the server answered ${response.status}`;
  return body.failure === undefined
    ? { refused: "invalid", detail }
    : { refused: "unresolved", detail, failure: body.failure };
}

const askRefusalKinds: ReadonlyMap<string, AskRefusal["refused"]> = new Map([
  ["write and edit are approved once at a time", "write-once"],
  ["this call has nothing a grant could remember; approve it once", "nothing-to-remember"],
]);

async function askRefusalOf(response: Response): Promise<AskRefusal> {
  const detail = await refusalDetail(response);
  const refused = askRefusalKinds.get(detail);
  if (refused === undefined) throw new ServerRefusal(400, detail);
  return { refused, detail };
}

function eventsPath(options: EventStreamOptions): string {
  if (options.session === undefined) return "/events";
  const query = new URLSearchParams({ session: options.session });
  return `/events?${query}`;
}

type MemoryRoutes = Pick<
  KeyworkClient,
  | "memory"
  | "memoryInbox"
  | "approveStagedItem"
  | "discardStagedItem"
  | "memoryNotes"
  | "memoryNote"
  | "memoryDailyDates"
  | "memoryDaily"
  | "memoryLedger"
  | "revertLedgerEntry"
  | "askMemory"
  | "airlock"
  | "triageAirlockCandidate"
  | "triageAirlockQuestion"
  | "deliverAirlock"
  | "finishAirlock"
>;

type TrustedNote = (MemoryNoteDetail & { trusted: true }) | { trusted: false };

function memoryRoutes(request: Request): MemoryRoutes {
  const airlock = (slug: string, tail = ""): string =>
    `/arcs/${encodeURIComponent(slug)}/airlock${tail}`;
  const layered = (path: string, layer: string | undefined): string =>
    layer === undefined ? path : `${path}?layer=${encodeURIComponent(layer)}`;
  return {
    memory: () => request("GET", "/memory").then(json<MemoryGarden>),
    memoryInbox: () => request("GET", "/memory/inbox").then(json<MemoryInbox>),
    approveStagedItem: async (id) => {
      const response = await request("POST", `/memory/inbox/${encodeURIComponent(id)}/approve`);
      const refusal = writeRefusalOf(response);
      if (refusal !== undefined) return refusal;
      const approved = await json<WriteResult | Record<string, never>>(response);
      return { kind: "approved", result: isWriteResult(approved) ? approved : null };
    },
    discardStagedItem: async (id) => {
      const response = await request("POST", `/memory/inbox/${encodeURIComponent(id)}/discard`);
      const refusal = writeRefusalOf(response);
      if (refusal !== undefined) return refusal;
      await json(response);
      return "discarded";
    },
    memoryNotes: async (layer) => {
      const response = await request("GET", layered("/memory/notes", layer));
      return response.status === 404 ? undefined : json<MemoryNotes>(response);
    },
    memoryNote: async (name) => {
      const response = await request("GET", `/memory/notes/${encodeURIComponent(name)}`);
      if (response.status === 404) return undefined;
      const reading = await json<TrustedNote>(response);
      return reading.trusted ? reading : undefined;
    },
    memoryDailyDates: () => request("GET", "/memory/daily").then(json<MemoryDailyDates>),
    memoryDaily: (date) =>
      request("GET", `/memory/daily/${encodeURIComponent(date)}`).then(json<MemoryDaily>),
    memoryLedger: () => request("GET", "/memory/ledger").then(json<MemoryLedger>),
    revertLedgerEntry: async (id) => {
      const response = await request("POST", `/memory/ledger/${encodeURIComponent(id)}/revert`);
      const refusal = writeRefusalOf(response);
      if (refusal !== undefined) return refusal;
      const reverted = await json<{ outcome: "reverted" | "needs-rebase" }>(response);
      return { kind: reverted.outcome };
    },
    askMemory: (question) => request("POST", "/memory/ask", question).then(json<MemoryAnswer>),
    airlock: async (slug) => {
      const response = await request("GET", airlock(slug));
      return response.status === 404 ? undefined : json<AirlockReading>(response);
    },
    triageAirlockCandidate: (slug, note, choice) =>
      triage(
        request("POST", airlock(slug, `/candidates/${encodeURIComponent(note)}`), { choice }),
        "ineligible",
      ),
    triageAirlockQuestion: (slug, title, choice) =>
      triage(request("POST", airlock(slug, "/questions"), { title, choice }), "no-successor"),
    deliverAirlock: async (slug) => {
      const response = await request("POST", airlock(slug, "/deliver"));
      const refusal = writeRefusalOf(response);
      if (refusal !== undefined) return refusal;
      const delivery = await json<{ delivered: number }>(response);
      return { kind: "delivered", delivered: delivery.delivered };
    },
    finishAirlock: async (slug, force = false) => {
      const response = await request("POST", airlock(slug, "/finish"), { force });
      const refusal = writeRefusalOf(response);
      if (refusal !== undefined) return refusal;
      return { kind: "finished", outcome: await json(response) };
    },
  };
}

function isWriteResult(answer: WriteResult | Record<string, never>): answer is WriteResult {
  return "ledgerId" in answer;
}

async function triage(
  pending: Promise<Response>,
  conflict: "ineligible" | "no-successor",
): Promise<AirlockTriage> {
  const response = await pending;
  const refusal = writeRefusalOf(response);
  if (refusal !== undefined) return refusal;
  if (response.status === 409) return { kind: conflict, detail: await refusalDetail(response) };
  return { kind: "digest", digest: await json(response) };
}

function writeRefusalOf(response: Response): "inert" | "missing" | undefined {
  if (response.status === 403) return "inert";
  if (response.status === 404) return "missing";
  return undefined;
}

interface OpenApiShape {
  info: { version: string };
  paths: Record<string, Record<string, { operationId: string }>>;
}

function documentOf(doc: OpenApiShape): ServerDocument {
  const operationIds = Object.values(doc.paths)
    .flatMap((item) => Object.values(item))
    .map((operation) => operation.operationId)
    .sort();
  return { version: doc.info.version, operationIds };
}

async function* resumingEvents(
  options: EventStreamOptions,
  connect: (lastId: number | undefined) => Promise<Response>,
  readFrames: FrameReader,
  delay: Delay,
): AsyncIterable<BusEnvelope> {
  const { signal } = options;
  const aborted = (): boolean => signal?.aborted === true;
  let lastId = options.since;
  let attempt = 0;
  while (!aborted()) {
    const body = await openStream(connect, lastId, aborted);
    if (body !== undefined) {
      options.onOpen?.();
      try {
        for await (const frame of readFrames(body)) {
          for (const notice of noticesOf(frame)) options.onNotice?.(notice);
          const id = frameId(frame);
          if (id !== undefined) lastId = id;
          const envelope = envelopeOf(frame);
          if (envelope === undefined) continue;
          attempt = 0;
          yield envelope;
        }
      } catch {
        if (aborted()) return;
      }
    }
    if (aborted()) return;
    await delay(reconnectDelayMs(attempt), signal);
    attempt += 1;
  }
}

async function openStream(
  connect: (lastId: number | undefined) => Promise<Response>,
  lastId: number | undefined,
  aborted: () => boolean,
): Promise<ReadableStream<Uint8Array> | undefined> {
  let response: Response;
  try {
    response = await connect(lastId);
  } catch {
    return undefined;
  }
  if (response.status === 401) throw new ServerRefusal(401, "the server refused the token");
  if (!response.ok || response.body === null || aborted()) return undefined;
  return response.body;
}

async function json<T = unknown>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  throw new ServerRefusal(response.status, await refusalDetail(response));
}

async function entryRefusalOf(response: Response): Promise<EntryRefusal> {
  const detail = await refusalDetail(response);
  return detail === missingSessionDetail ? "missing" : "unknown-entry";
}

async function refusalDetail(response: Response): Promise<string> {
  if (response.status === 401) return "the server refused the token";
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
  } catch {}
  return `the server answered ${response.status}`;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(finish, ms);
    timer.unref?.();
    signal?.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
}

type WorkspaceRoutes = Pick<KeyworkClient, "workspace" | "tree" | "file" | "trustWorkspace">;

function workspaceRoutes(request: Request): WorkspaceRoutes {
  return {
    workspace: () => request("GET", "/workspace").then(json<WorkspaceView>),
    tree: async (path) => {
      const response = await request(
        "GET",
        `/tree?${new URLSearchParams({ path, hidden: "true" })}`,
      );
      if (response.status === 403) return "outside-scope";
      if (response.status === 404) return "missing";
      return json(response);
    },
    file: async (path, range = {}) => {
      const query = new URLSearchParams({ path });
      if (range.from !== undefined) query.set("from", String(range.from));
      if (range.to !== undefined) query.set("to", String(range.to));
      const response = await request("GET", `/files?${query}`);
      if (response.status === 403) return "outside-scope";
      if (response.status === 404) return "missing";
      if (response.status === 413) return "too-large";
      if (response.status === 415) return "binary";
      return json(response);
    },
    trustWorkspace: async () => {
      const response = await request("POST", "/workspace/trust", {});
      if (response.status === 409)
        return { refused: "untrusted", message: await refusalDetail(response) };
      if (response.status === 400)
        return { refused: "home", message: await refusalDetail(response) };
      return json(response);
    },
  };
}

type SurfaceRoutes = Pick<
  KeyworkClient,
  | "mcpServers"
  | "restartMcpServer"
  | "setMcpServerEnabled"
  | "mcpServerTools"
  | "arcs"
  | "createArc"
  | "closeArc"
  | "abandonArc"
  | "setArcTheme"
  | "bindSessionArc"
  | "bots"
  | "createBot"
  | "bindSessionBot"
  | "workspaces"
  | "createWorkspace"
  | "useWorkspace"
  | "focusWorkspaceDir"
  | "unfocusWorkspaceDir"
  | "themes"
>;

type ConflictMeaning = SurfaceRefusal["refused"];

function surfaceRoutes(request: Request): SurfaceRoutes {
  const mcp = (name: string, tail: string): string => `/mcp/${encodeURIComponent(name)}${tail}`;
  const arc = (slug: string, tail: string): string => `/arcs/${encodeURIComponent(slug)}${tail}`;
  const session = (id: string, tail: string): string =>
    `/sessions/${encodeURIComponent(id)}${tail}`;
  const workspace = (slug: string | null, tail: string): string =>
    `/workspaces/${encodeURIComponent(slug ?? "default")}${tail}`;
  const answered = async <T>(
    response: Response,
    conflict: ConflictMeaning,
  ): Promise<T | SurfaceRefusal> =>
    (await surfaceRefusalOf(response, conflict)) ?? json<T>(response);
  return {
    mcpServers: async () =>
      (await json<{ servers: McpServerStatus[] }>(await request("GET", "/mcp"))).servers,
    restartMcpServer: async (name) =>
      answered<McpServerStatus>(await request("POST", mcp(name, "/restart")), "busy"),
    setMcpServerEnabled: async (name, on) =>
      answered<McpServerStatus>(await request("POST", mcp(name, "/enabled"), { on }), "busy"),
    mcpServerTools: async (name) => {
      const response = await request("GET", mcp(name, "/tools"));
      const refusal = await surfaceRefusalOf(response, "busy");
      return refusal ?? (await json<{ tools: string[] }>(response)).tools;
    },
    arcs: async () => answered<ArcsView>(await request("GET", "/arcs"), "archived"),
    createArc: async (slug) =>
      answered<ArcSummary>(await request("POST", "/arcs", { slug }), "exists"),
    closeArc: async (slug, direction) =>
      answered<ArcCloseOutcome>(
        await request("POST", arc(slug, "/close"), direction === undefined ? {} : { direction }),
        "archived",
      ),
    abandonArc: async (slug) => {
      const response = await request("POST", arc(slug, "/abandon"));
      const refusal = await surfaceRefusalOf(response, "archived");
      if (refusal !== undefined) return refusal;
      await json(response);
      return "abandoned";
    },
    setArcTheme: async (slug, theme) =>
      answered<ArcSummary>(await request("POST", arc(slug, "/theme"), { theme }), "invalid"),
    bindSessionArc: async (id, slug) =>
      answered<SessionBinding>(await request("POST", session(id, "/arc"), { slug }), "archived"),
    bots: async () => (await json<{ bots: BotSummary[] }>(await request("GET", "/bots"))).bots,
    createBot: async (draft) => answered<BotEntry>(await request("POST", "/bots", draft), "exists"),
    bindSessionBot: async (id, name) =>
      answered<SessionBinding>(await request("POST", session(id, "/bot"), { name }), "busy"),
    workspaces: async () =>
      (await json<{ workspaces: WorkspaceChoice[] }>(await request("GET", "/workspaces")))
        .workspaces,
    createWorkspace: async (slug) =>
      answered<{ slug: string }>(await request("POST", "/workspaces", { slug }), "exists"),
    useWorkspace: async (slug) =>
      answered<WorkspaceUse>(await request("POST", "/workspaces/use", { slug }), "missing"),
    focusWorkspaceDir: async (slug, dir) =>
      answered<FocusedDir>(await request("POST", workspace(slug, "/focus"), { dir }), "invalid"),
    unfocusWorkspaceDir: async (slug, dir) =>
      answered<FocusedDir>(await request("POST", workspace(slug, "/unfocus"), { dir }), "invalid"),
    themes: () => request("GET", "/themes").then(json<ThemesView>),
  };
}

async function surfaceRefusalOf(
  response: Response,
  conflict: ConflictMeaning,
): Promise<SurfaceRefusal | undefined> {
  const kind = refusalKindOf(response.status, conflict);
  return kind === undefined ? undefined : { refused: kind, detail: await refusalDetail(response) };
}

function refusalKindOf(
  status: number,
  conflict: ConflictMeaning,
): SurfaceRefusal["refused"] | undefined {
  switch (status) {
    case 400:
      return "invalid";
    case 403:
      return "not-ready";
    case 404:
      return "missing";
    case 409:
      return conflict;
    default:
      return undefined;
  }
}
