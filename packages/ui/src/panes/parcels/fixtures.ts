import type { Fetch } from "@keywork-app/client";
import type { ParcelClock } from "./copy.ts";
import { type MeshOperation, meshOperations } from "./routes.ts";
import type {
  AuditPage,
  AuditRow,
  BegunPairing,
  Census,
  CensusPeer,
  Grant,
  GrantList,
  PairRecord,
  PairsReading,
} from "./wire.ts";

export const fixtureNow = Date.UTC(2026, 10, 5, 12, 0, 0);

export const fixtureClock: ParcelClock = { now: () => fixtureNow, offsetMinutes: () => 0 };

export const at = (minutesFromNow: number): string =>
  new Date(fixtureNow + minutesFromNow * 60_000).toISOString();

export const ids = {
  house: "nMoakMainCNTRL",
  spark: "nSparkAd4dCNTRL",
  build: "nBuildBoxCNTRL",
  lab: "nLabMacCNTRL",
  laptop: "nOldLaptopCNTRL",
} as const;

const keeper = {
  id: "7000000000000001",
  loginName: "keeper@example.com",
  displayName: "Jordan Moak",
};

const claimedNode = { product: "keywork", version: "0.9.0", pairing: "claimed" } as const;

export const housePeer: CensusPeer = {
  stableId: ids.house,
  machine: "moak-main",
  os: "windows",
  addresses: ["100.124.48.125", "fd7a:115c:a1e0::7c30:307d"],
  tags: [],
  user: keeper,
  online: true,
  path: { kind: "unknown" },
  node: claimedNode,
  manifest: { roles: ["console"] },
};

export const sparkPeer: CensusPeer = {
  stableId: ids.spark,
  machine: "spark-ad4d",
  os: "linux",
  addresses: ["100.85.160.9", "fd7a:115c:a1e0::5541:a009"],
  tags: [],
  user: keeper,
  online: true,
  path: { kind: "direct", endpoint: "192.168.4.58:41641" },
  node: claimedNode,
  manifest: { roles: ["host", "reachable"] },
  endpoint: "http://100.85.160.9:47800",
};

export const buildPeer: CensusPeer = {
  stableId: ids.build,
  machine: "build-box",
  os: "linux",
  addresses: ["fd7a:115c:a1e0::b0b0", "100.71.3.4"],
  tags: ["tag:ci"],
  user: null,
  online: true,
  path: { kind: "derp", region: "ord" },
  node: { product: "keywork", version: "0.9.0", pairing: "unclaimed" },
  manifest: null,
};

export const labPeer: CensusPeer = {
  stableId: ids.lab,
  machine: "lab-mac",
  os: "macOS",
  addresses: ["100.99.12.40"],
  tags: [],
  user: keeper,
  online: true,
  path: { kind: "peer-relay", relay: "100.85.160.9:40000" },
  node: claimedNode,
};

export const laptopPeer: CensusPeer = {
  stableId: ids.laptop,
  machine: "old-laptop",
  os: "windows",
  addresses: ["100.64.9.9"],
  tags: [],
  user: keeper,
  online: false,
  path: { kind: "offline" },
  node: null,
};

export const census: Census = {
  self: housePeer,
  peers: [sparkPeer, buildPeer, labPeer, laptopPeer],
  policy: { checkedAt: at(-20), findings: [] },
};

export const sparkPair: PairRecord = {
  id: "pair-spark",
  peerStableId: ids.spark,
  peerUserId: keeper.id,
  peerTags: [],
  role: "target",
  caps: [],
  endpoint: "http://100.85.160.9:47800",
  createdAt: at(-60 * 24),
  confirmedBy: "claim-code",
};

export const pairsReading: PairsReading = {
  claim: "claimed",
  owner: { tailnetId: "TSteadE5f6CNTRL", userId: keeper.id, claimedAt: at(-60 * 48) },
  pairs: [sparkPair],
  pending: [
    {
      pairingId: "pairing-lab",
      peerStableId: ids.lab,
      peerUserId: keeper.id,
      role: "console",
      caps: [],
      confirmation: "on-device",
      phase: "confirming",
      sas: "105377",
      expiresAt: at(4),
    },
  ],
};

export const wrenGate: Grant = {
  id: "grant-wren",
  issuer: ids.house,
  subject: { creature: "wren", node: ids.house },
  target: ids.spark,
  caps: [
    { kind: "exec", commands: ["bun", "git status"] },
    { kind: "files:read", paths: ["~/src/**"] },
  ],
  issuedAt: at(-30),
  expiresAt: at(6 * 60),
};

export const mossGate: Grant = {
  id: "grant-moss",
  issuer: ids.lab,
  subject: { creature: "moss", node: ids.spark },
  target: ids.house,
  caps: [{ kind: "screen:view" }],
  issuedAt: at(-15),
  expiresAt: at(90),
};

export const grantList: GrantList = { issued: [wrenGate], installed: [mossGate] };

export const auditRows: AuditRow[] = [
  auditRow(1, at(-178), ids.spark, "pair.confirm", "allow", "paired by claim code"),
  auditRow(2, at(-40), ids.spark, "exec", "allow", "grant-wren"),
  auditRow(3, at(-25), ids.spark, "exec", "deny", "rm outside the grant"),
  auditRow(4, at(-12), ids.spark, "screen:view", "allow", "grant-moss"),
  auditRow(5, at(-3), ids.lab, "pair.hello", "allow", "identified"),
];

export const auditPage: AuditPage = {
  rows: auditRows,
  chain: { intact: true, head: "hash-5", rows: auditRows.length },
};

export const begunBuild: BegunPairing = {
  attemptId: "attempt-build",
  sas: "482913",
  confirmation: "on-device",
  expiresAt: at(5),
};

export type OperationName = keyof typeof meshOperations;

export interface MeshRequest {
  readonly operation: OperationName;
  readonly id: string | undefined;
  readonly query: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface MeshAnswer {
  readonly status: number;
  readonly body: unknown;
}

export type MeshHandler = (request: MeshRequest) => MeshAnswer;

export type MeshHandlers = Partial<Record<OperationName, MeshHandler | undefined>>;

export const firstLightRunThree = {
  censusOnDerp: censusWithSpark({ kind: "derp", region: "ord" }),
  censusDirect: censusWithSpark(sparkPeer.path),
  sparkWentDirect: {
    change: "lanes",
    peers: [{ stableId: ids.spark, path: { kind: "direct", endpoint: "192.168.4.58:41641" } }],
  },
} as const;

function censusWithSpark(path: CensusPeer["path"]): Census {
  return {
    ...census,
    peers: census.peers.map((peer) => (peer.stableId === ids.spark ? { ...peer, path } : peer)),
  };
}

export interface FakeMeshServer {
  readonly fetch: Fetch;
  readonly calls: MeshRequest[];
  callsTo(operation: OperationName): MeshRequest[];
}

export const servedHandlers: MeshHandlers = {
  census: () => ok(census),
  pairs: () => ok(pairsReading),
  grants: () => ok(grantList),
  audit: () => ok(auditPage),
  beginPairing: () => ({ status: 201, body: begunBuild }),
  completePairing: (request) =>
    (request.body as { matches?: unknown } | undefined)?.matches === true
      ? ok({ paired: { ...sparkPair, id: "pair-build", peerStableId: ids.build } })
      : { status: 409, body: { failed: "cancelled", detail: "the keeper said the codes differ" } },
  confirmHere: () => ok({ state: "confirming" }),
  unpair: (request) => ok(revocation("pair", request.id ?? "", ids.spark)),
  issueGrant: (request) => ({
    status: 201,
    body: { ...wrenGate, ...(request.body as object), id: "grant-new", issuedAt: at(0) },
  }),
  revokeGrant: (request) => ok(revocation("grant", request.id ?? "", ids.spark)),
};

export function fakeMeshServer(overrides: MeshHandlers = {}): FakeMeshServer {
  const handlers: MeshHandlers = { ...servedHandlers, ...overrides };
  const calls: MeshRequest[] = [];
  const fetch: Fetch = async (input, init = {}) => {
    const url = new URL(input, "http://node.invalid");
    const routed = routeOf(init.method ?? "GET", url.pathname);
    if (routed === undefined) return answer({ status: 404, body: { error: "no such route" } });
    const request: MeshRequest = {
      operation: routed.operation,
      id: routed.id,
      query: Object.fromEntries(url.searchParams.entries()),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(request);
    const handle = handlers[routed.operation];
    return answer(
      handle === undefined ? { status: 404, body: { error: "no such route" } } : handle(request),
    );
  };
  return {
    fetch,
    calls,
    callsTo: (operation) => calls.filter((call) => call.operation === operation),
  };
}

export function ok(body: unknown): MeshAnswer {
  return { status: 200, body };
}

export function meshEnvelope(id: number, type: string, payload: object) {
  return { id, ts: at(0), sessionId: "", type, payload };
}

function routeOf(
  method: string,
  pathname: string,
): { operation: OperationName; id: string | undefined } | undefined {
  for (const [operation, spec] of Object.entries(meshOperations) as [
    OperationName,
    MeshOperation,
  ][]) {
    if (spec.method !== method) continue;
    const pattern = new RegExp(`^${spec.path.replace("{id}", "([^/]+)")}$`);
    const match = pathname.match(pattern);
    if (match !== null) {
      const id = match[1];
      return { operation, id: id === undefined ? undefined : decodeURIComponent(id) };
    }
  }
  return undefined;
}

function answer(reply: MeshAnswer): Response {
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "content-type": "application/json" },
  });
}

function auditRow(
  index: number,
  ts: string,
  actor: string,
  capability: string,
  decision: AuditRow["decision"],
  reason: string,
): AuditRow {
  return {
    ts,
    actorStableID: actor,
    actorUserID: keeper.id,
    actorTags: [],
    targetStableID: ids.house,
    capability,
    requestDigest: `digest-${index}`,
    decision,
    reason,
    prevHash: index === 1 ? "0".repeat(64) : `hash-${index - 1}`,
    hash: `hash-${index}`,
  };
}

function revocation(kind: "grant" | "pair", id: string, target: string) {
  return {
    kind,
    id,
    issuer: ids.house,
    target,
    revokedAt: at(0),
    nonce: "nonce",
    signature: "signature",
  };
}
