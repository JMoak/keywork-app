import {
  type BegunPairing,
  type CreatureDetail,
  type CreatureDraft,
  type CreatureMessageDraft,
  type CreatureMessageSent,
  type CreaturePatch,
  type CreaturePause,
  type CreatureRemovalChoice,
  type CreatureRemovalOutcome,
  type CreatureReport,
  type CreatureSummary,
  type DemoteOutcome,
  type ForgetSourceApplied,
  type ForgetSourcePreview,
  type MeshAuditPage,
  type MeshAuditQuery,
  type MeshAuditRow,
  type MeshCensus,
  type MeshGrant,
  type MeshGrantDraft,
  type MeshGrantList,
  type MeshPairingsList,
  type MeshPairs,
  type MeshRevocation,
  type ModelAcknowledgement,
  type ModelBenchReport,
  type ModelLicenseRequest,
  type ModelProbeReport,
  type ModelProbeRequest,
  type ModelsReport,
  type ModelTarget,
  type OverturnOutcome,
  type PairingCompletion,
  type PairingConfirmedHere,
  type PairingFailure,
  type PairingResult,
  type PairingTarget,
  type PromoteOutcome,
  type RoutineFile,
  type RoutineHookFired,
  type RoutineHookMint,
  type RoutinePut,
  type RoutineView,
  type RunRow,
  type ScreenAuditRecord,
  type ServedRefusal,
  servedRefusalKindOf,
  type WorkshopDetail,
  type WorkshopHealthReport,
  type WorkshopRemoval,
  type WorkshopSpec,
  type WorkshopSubstrateReport,
  type WorkshopTerminalInput,
  type WorkshopTerminalRun,
  type WorkshopView,
} from "@keywork-app/protocol";

export interface RanchClient {
  creatures(): Promise<readonly CreatureSummary[] | ServedRefusal>;
  createCreature(draft: CreatureDraft): Promise<CreatureSummary | ServedRefusal>;
  creature(slug: string): Promise<CreatureDetail | ServedRefusal>;
  updateCreature(slug: string, patch: CreaturePatch): Promise<CreatureSummary | ServedRefusal>;
  creatureReport(slug: string): Promise<CreatureReport | ServedRefusal>;
  pauseCreature(slug: string): Promise<CreaturePause | ServedRefusal>;
  resumeCreature(slug: string): Promise<CreaturePause | ServedRefusal>;
  removeCreature(
    slug: string,
    choice?: CreatureRemovalChoice,
  ): Promise<CreatureRemovalOutcome | ServedRefusal>;
  routines(creature: string): Promise<readonly RoutineView[] | ServedRefusal>;
  routine(creature: string, id: string): Promise<RoutineView | ServedRefusal>;
  putRoutine(creature: string, id: string, file: RoutineFile): Promise<RoutinePut | ServedRefusal>;
  deleteRoutine(creature: string, id: string): Promise<RoutineView | ServedRefusal>;
  runRoutine(creature: string, id: string): Promise<RunRow | ServedRefusal>;
  cancelRoutine(creature: string, id: string): Promise<RunRow | ServedRefusal>;
  acceptRoutineGrants(
    creature: string,
    id: string,
    digest: string,
  ): Promise<RoutineView | ServedRefusal>;
  routineRuns(
    creature: string,
    id: string,
    limit?: number,
  ): Promise<readonly RunRow[] | ServedRefusal>;
  models(node?: string): Promise<ModelsReport | ServedRefusal>;
  probeModels(request: ModelProbeRequest): Promise<ModelProbeReport | ServedRefusal>;
  acknowledgeModelLicense(
    request: ModelLicenseRequest,
  ): Promise<ModelAcknowledgement | ServedRefusal>;
  benchModel(target: ModelTarget): Promise<ModelBenchReport | ServedRefusal>;
  modelBench(target: ModelTarget): Promise<ModelBenchReport | null | ServedRefusal>;
  workshops(): Promise<readonly WorkshopView[] | ServedRefusal>;
  workshopSubstrates(): Promise<WorkshopSubstrateReport | ServedRefusal>;
  workshop(id: string): Promise<WorkshopDetail | ServedRefusal>;
  execInWorkshop(
    id: string,
    input: WorkshopTerminalInput,
  ): Promise<WorkshopTerminalRun | ServedRefusal>;
  createWorkshop(spec: WorkshopSpec): Promise<WorkshopView | ServedRefusal>;
  startWorkshop(id: string): Promise<WorkshopView | ServedRefusal>;
  stopWorkshop(id: string): Promise<WorkshopView | ServedRefusal>;
  workshopHealth(id: string): Promise<WorkshopHealthReport | ServedRefusal>;
  removeWorkshop(id: string, keepDisk?: boolean): Promise<WorkshopRemoval | ServedRefusal>;
  workshopDisplay(id: string): Promise<ReadableStream<Uint8Array> | ServedRefusal>;
  meshPeers(): Promise<MeshCensus | ServedRefusal>;
  meshPairings(): Promise<MeshPairingsList | ServedRefusal>;
  meshPairs(): Promise<MeshPairs | ServedRefusal>;
  beginMeshPairing(target: PairingTarget): Promise<BegunPairing | PairingFailure | ServedRefusal>;
  completeMeshPairing(
    attemptId: string,
    completion: PairingCompletion,
  ): Promise<PairingResult | ServedRefusal>;
  confirmMeshPairingHere(
    pairingId: string,
    sas: string,
  ): Promise<PairingConfirmedHere | ServedRefusal>;
  removeMeshPair(pairId: string): Promise<MeshRevocation | ServedRefusal>;
  meshGrants(): Promise<MeshGrantList | ServedRefusal>;
  issueMeshGrant(draft: MeshGrantDraft): Promise<MeshGrant | ServedRefusal>;
  revokeMeshGrant(grantId: string): Promise<MeshRevocation | ServedRefusal>;
  meshAudit(query?: MeshAuditQuery): Promise<MeshAuditPage | ServedRefusal>;
  recordScreenAudit(record: ScreenAuditRecord): Promise<{ row: MeshAuditRow } | ServedRefusal>;
  promoteCreatureClass(slug: string, ruleClass: string): Promise<PromoteOutcome | ServedRefusal>;
  demoteCreatureClass(slug: string, ruleClass: string): Promise<DemoteOutcome | ServedRefusal>;
  overturnCreatureDecision(
    slug: string,
    recordId: string,
  ): Promise<OverturnOutcome | ServedRefusal>;
  mintRoutineHook(slug: string, id: string): Promise<RoutineHookMint | ServedRefusal>;
  fireRoutineHook(
    slug: string,
    id: string,
    token: string,
    body: string,
  ): Promise<RoutineHookFired | ServedRefusal>;
  previewMemoryForget(source: string): Promise<ForgetSourcePreview | ServedRefusal>;
  applyMemoryForget(source: string, digest: string): Promise<ForgetSourceApplied | ServedRefusal>;
  sendCreatureMessage(draft: CreatureMessageDraft): Promise<CreatureMessageSent | ServedRefusal>;
  takeCreatureMessage(arrival: unknown): Promise<CreatureMessageSent | ServedRefusal>;
  serveCreatureMcp(slug: string, message: unknown): Promise<CreatureMcpExchange | ServedRefusal>;
  takeCreatureMcpArrival(
    slug: string,
    arrival: unknown,
  ): Promise<CreatureMcpExchange | ServedRefusal>;
}

export interface CreatureMcpExchange {
  status: number;
  body: unknown;
}

export type RanchRequest = (
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit,
) => Promise<Response>;

export const ranchOperations = {
  creatures: "listCreatures",
  createCreature: "createCreature",
  creature: "readCreature",
  updateCreature: "updateCreature",
  creatureReport: "readCreatureReport",
  pauseCreature: "pauseCreature",
  resumeCreature: "resumeCreature",
  removeCreature: "removeCreature",
  routines: "listRoutines",
  routine: "readRoutine",
  putRoutine: "putRoutine",
  deleteRoutine: "deleteRoutine",
  runRoutine: "runRoutine",
  cancelRoutine: "cancelRoutine",
  acceptRoutineGrants: "acceptRoutineGrants",
  routineRuns: "listRoutineRuns",
  models: "listModels",
  probeModels: "probeModels",
  acknowledgeModelLicense: "acknowledgeModelLicense",
  benchModel: "benchModel",
  modelBench: "readModelBench",
  workshops: "listWorkshops",
  workshopSubstrates: "listWorkshopSubstrates",
  workshop: "readWorkshop",
  execInWorkshop: "execInWorkshop",
  createWorkshop: "createWorkshop",
  startWorkshop: "startWorkshop",
  stopWorkshop: "stopWorkshop",
  workshopHealth: "workshopHealth",
  removeWorkshop: "removeWorkshop",
  workshopDisplay: "streamWorkshopDisplay",
  meshPeers: "listMeshPeers",
  meshPairings: "listMeshPairings",
  meshPairs: "listMeshPairs",
  beginMeshPairing: "beginMeshPairing",
  completeMeshPairing: "completeMeshPairing",
  confirmMeshPairingHere: "confirmMeshPairingHere",
  removeMeshPair: "removeMeshPair",
  meshGrants: "listMeshGrants",
  issueMeshGrant: "issueMeshGrant",
  revokeMeshGrant: "revokeMeshGrant",
  meshAudit: "meshAudit",
  recordScreenAudit: "recordScreenAudit",
  promoteCreatureClass: "promoteCreatureClass",
  demoteCreatureClass: "demoteCreatureClass",
  overturnCreatureDecision: "overturnCreatureDecision",
  mintRoutineHook: "mintRoutineHook",
  fireRoutineHook: "fireRoutineHook",
  previewMemoryForget: "previewMemoryForget",
  applyMemoryForget: "applyMemoryForget",
  sendCreatureMessage: "sendCreatureMessage",
  takeCreatureMessage: "takeCreatureMessage",
  serveCreatureMcp: "serveCreatureMcp",
  takeCreatureMcpArrival: "takeCreatureMcpArrival",
} as const satisfies Record<keyof RanchClient, string>;

export function ranchRoutes(request: RanchRequest): RanchClient {
  const creature = (slug: string, tail = ""): string =>
    `/creatures/${encodeURIComponent(slug)}${tail}`;
  const routine = (slug: string, id: string, tail = ""): string =>
    creature(slug, `/routines/${encodeURIComponent(id)}${tail}`);
  const workshop = (id: string, tail = ""): string => `/workshops/${encodeURIComponent(id)}${tail}`;
  const answered = async <T>(response: Response): Promise<T | ServedRefusal> =>
    (await servedRefusalOf(response)) ?? ((await response.json()) as T);
  const exchanged = async (response: Response): Promise<CreatureMcpExchange | ServedRefusal> => {
    if (!response.ok && response.status !== 400) {
      return (
        (await servedRefusalOf(response)) ?? {
          refused: "failed",
          detail: `the server answered ${response.status}`,
        }
      );
    }
    const text = await response.text();
    return { status: response.status, body: text === "" ? undefined : JSON.parse(text) };
  };
  const picked = async <Body, T>(
    response: Response,
    pick: (body: Body) => T,
  ): Promise<T | ServedRefusal> => {
    const body = await answered<Body>(response);
    return isRefusal(body) ? body : pick(body);
  };
  return {
    creatures: async () =>
      picked(
        await request("GET", "/creatures"),
        (body: { creatures: CreatureSummary[] }) => body.creatures,
      ),
    createCreature: async (draft) => answered(await request("POST", "/creatures", draft)),
    creature: async (slug) => answered(await request("GET", creature(slug))),
    removeCreature: async (slug, choice = {}) => {
      const response = await request("DELETE", `${creature(slug)}${removalQuery(choice)}`);
      if (response.status === 409) {
        const body = (await response.json()) as CreatureRemovalOutcome;
        return { removed: false, removal: body.removal };
      }
      return answered(response);
    },
    routines: async (slug) =>
      picked(
        await request("GET", creature(slug, "/routines")),
        (body: { routines: RoutineView[] }) => body.routines,
      ),
    routine: async (slug, id) =>
      picked(
        await request("GET", routine(slug, id)),
        (body: { routine: RoutineView }) => body.routine,
      ),
    putRoutine: async (slug, id, file) => answered(await request("PUT", routine(slug, id), file)),
    deleteRoutine: async (slug, id) =>
      picked(
        await request("DELETE", routine(slug, id)),
        (body: { removed: RoutineView }) => body.removed,
      ),
    runRoutine: async (slug, id) =>
      picked(await request("POST", routine(slug, id, "/run")), (body: { run: RunRow }) => body.run),
    cancelRoutine: async (slug, id) =>
      picked(
        await request("POST", routine(slug, id, "/cancel")),
        (body: { run: RunRow }) => body.run,
      ),
    acceptRoutineGrants: async (slug, id, digest) =>
      picked(
        await request("POST", routine(slug, id, "/accept"), { digest }),
        (body: { routine: RoutineView }) => body.routine,
      ),
    routineRuns: async (slug, id, limit) =>
      picked(
        await request(
          "GET",
          routine(slug, id, limit === undefined ? "/runs" : `/runs?limit=${limit}`),
        ),
        (body: { runs: RunRow[] }) => body.runs,
      ),
    models: async (node) =>
      answered(
        await request(
          "GET",
          node === undefined ? "/models" : `/models?node=${encodeURIComponent(node)}`,
        ),
      ),
    probeModels: async (probe) => answered(await request("POST", "/models/probe", probe)),
    acknowledgeModelLicense: async (acknowledgement) =>
      answered(await request("POST", "/models/acknowledgements", acknowledgement)),
    benchModel: async (target) => answered(await request("POST", "/models/bench", target)),
    modelBench: async (target) =>
      picked(
        await request("GET", `/models/bench?${targetQuery(target)}`),
        (body: { report: ModelBenchReport | null }) => body.report,
      ),
    workshops: async () =>
      picked(
        await request("GET", "/workshops"),
        (body: { workshops: WorkshopView[] }) => body.workshops,
      ),
    createWorkshop: async (spec) => answered(await request("POST", "/workshops", spec)),
    startWorkshop: async (id) => answered(await request("POST", workshop(id, "/start"))),
    stopWorkshop: async (id) => answered(await request("POST", workshop(id, "/stop"))),
    workshopHealth: async (id) => answered(await request("GET", workshop(id, "/health"))),
    removeWorkshop: async (id, keepDisk) =>
      answered(
        await request(
          "DELETE",
          workshop(id, keepDisk === undefined ? "" : `?keepDisk=${keepDisk}`),
        ),
      ),
    workshopDisplay: async (id) => {
      const response = await request("GET", workshop(id, "/display"));
      const refusal = await servedRefusalOf(response);
      if (refusal !== undefined) return refusal;
      return response.body ?? { refused: "failed", detail: "the display stream has no body" };
    },
    updateCreature: async (slug, patch) => answered(await request("PATCH", creature(slug), patch)),
    creatureReport: async (slug) => answered(await request("GET", creature(slug, "/report"))),
    pauseCreature: async (slug) => answered(await request("POST", creature(slug, "/pause"))),
    promoteCreatureClass: async (slug, ruleClass) =>
      answered(await request("POST", creature(slug, "/promote"), { ruleClass })),
    demoteCreatureClass: async (slug, ruleClass) =>
      answered(await request("POST", creature(slug, "/demote"), { ruleClass })),
    overturnCreatureDecision: async (slug, recordId) =>
      answered(await request("POST", creature(slug, "/overturn"), { recordId })),
    mintRoutineHook: async (slug, id) =>
      answered(await request("POST", routine(slug, id, "/hook"))),
    fireRoutineHook: async (slug, id, token, body) =>
      answered(
        await request(
          "POST",
          `/hooks/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`,
          body,
          { headers: { authorization: `Bearer ${token}` } },
        ),
      ),
    previewMemoryForget: async (source) =>
      answered(await request("POST", "/memory/forget/preview", { source })),
    applyMemoryForget: async (source, digest) =>
      answered(await request("POST", "/memory/forget/apply", { source, digest })),
    sendCreatureMessage: async (draft) => answered(await request("POST", "/mesh/messages", draft)),
    takeCreatureMessage: async (arrival) =>
      answered(await request("POST", "/mesh/messages/arrivals", arrival)),
    serveCreatureMcp: async (slug, message) =>
      exchanged(await request("POST", creature(slug, "/mcp"), message)),
    takeCreatureMcpArrival: async (slug, arrival) =>
      exchanged(await request("POST", creature(slug, "/mcp/arrivals"), arrival)),
    resumeCreature: async (slug) => answered(await request("POST", creature(slug, "/resume"))),
    workshopSubstrates: async () => answered(await request("GET", "/workshops/substrates")),
    workshop: async (id) => answered(await request("GET", workshop(id))),
    execInWorkshop: async (id, input) =>
      answered(await request("POST", workshop(id, "/exec"), input)),
    meshPeers: async () => answered(await request("GET", "/mesh/peers")),
    meshPairings: async () => answered(await request("GET", "/mesh/pairings")),
    meshPairs: async () => answered(await request("GET", "/mesh/pairs")),
    beginMeshPairing: async (target) => answered(await request("POST", "/mesh/pairs", target)),
    completeMeshPairing: async (attemptId, completion) =>
      answered(
        await request("POST", `/mesh/pairs/${encodeURIComponent(attemptId)}/complete`, completion),
      ),
    confirmMeshPairingHere: async (pairingId, sas) =>
      answered(
        await request("POST", `/mesh/pairings/${encodeURIComponent(pairingId)}/confirm`, { sas }),
      ),
    removeMeshPair: async (pairId) =>
      answered(await request("DELETE", `/mesh/pairs/${encodeURIComponent(pairId)}`)),
    meshGrants: async () => answered(await request("GET", "/mesh/grants")),
    issueMeshGrant: async (draft) => answered(await request("POST", "/mesh/grants", draft)),
    revokeMeshGrant: async (grantId) =>
      answered(await request("DELETE", `/mesh/grants/${encodeURIComponent(grantId)}`)),
    meshAudit: async (query = {}) =>
      answered(await request("GET", `/mesh/audit${auditQuery(query)}`)),
    recordScreenAudit: async (record) =>
      answered(await request("POST", "/mesh/screen/audit", record)),
  };
}

export async function servedRefusalOf(response: Response): Promise<ServedRefusal | undefined> {
  const refused = servedRefusalKindOf(response.status);
  if (refused === undefined) {
    if (response.ok) return undefined;
    return { refused: "failed", detail: `the server answered ${response.status}` };
  }
  return { refused, detail: await refusalDetailOf(response) };
}

function isRefusal(value: unknown): value is ServedRefusal {
  return typeof value === "object" && value !== null && "refused" in value;
}

async function refusalDetailOf(response: Response): Promise<string> {
  if (response.status === 401) return "the server refused the token";
  try {
    const body = (await response.json()) as { error?: unknown; detail?: unknown };
    if (typeof body.error === "string") return body.error;
    if (typeof body.detail === "string") return body.detail;
  } catch {}
  return `the server answered ${response.status}`;
}

function removalQuery(choice: CreatureRemovalChoice): string {
  const query = new URLSearchParams();
  if (choice.confirmed === true) query.set("confirmed", "true");
  if (choice.keepWorkshop !== undefined) query.set("keepWorkshop", String(choice.keepWorkshop));
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

function targetQuery(target: ModelTarget): string {
  return new URLSearchParams({ endpoint: target.endpoint, model: target.model }).toString();
}

function auditQuery(query: MeshAuditQuery): string {
  const params = new URLSearchParams();
  if (query.after !== undefined) params.set("after", query.after);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}
