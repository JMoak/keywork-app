import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PeerIdentity } from "@keywork-app/screen";
import type { LoopbackHouse, LoopbackMachine } from "./seams.ts";

const sharer: LoopbackMachine = { stableId: "nLoopbackSharer1", machine: "loopback-sharer" };
const pairId = "pair-loopback";
const signalPath = "/mesh/screen/signal";
const ticketPath = "/mesh/screen/tickets";

const [keyworkRoot = "", viewerJson = "{}"] = process.argv.slice(2);
const viewer = JSON.parse(viewerJson) as PeerIdentity;
const keywork = await loadKeywork(keyworkRoot);
const ticket = keywork.randomToken(32);
const pairSecret = new Uint8Array(randomBytes(32));
const handle = keywork.meshRouter(keywork.meshTrustRoutes(houseTrust()));
const house: LoopbackHouse = {
  listener: await listen(observed("sharer", handle), callerOn(sharer, viewer.user)),
  peerListener: await listen(observed("viewer", handle), callerAs(viewer)),
  ticket,
  pairId,
  sharer,
  viewer: { stableId: viewer.node.stableId, machine: viewer.node.name },
};
report({ event: "listening", house });
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();

interface MeshCaller {
  address: string;
  node: { stableId: string; name: string; os: string; tags: string[] };
  human: { userId: string; loginName: string; displayName: string } | null;
  capMap: Record<string, readonly unknown[]>;
}

type MeshHandler = (request: Request, caller: MeshCaller) => Promise<Response>;

interface HouseTrust {
  pairing: { pairs(): readonly PairRecord[] };
  grants: Record<string, never>;
  audit: Record<string, never>;
  screen: {
    house: string;
    self(): string;
    machine(): string;
    pairSecret(pairId: string): Promise<Uint8Array | undefined>;
  };
}

interface PairRecord {
  id: string;
  peerStableId: string;
  peerUserId: string | null;
  peerTags: string[];
  peerDeviceKey: string;
  role: "console";
  caps: string[];
  endpoint: string | null;
  createdAt: string;
  confirmedBy: "sas";
}

interface KeyworkMesh {
  meshTrustRoutes(trust: HouseTrust): readonly unknown[];
  meshRouter(routes: readonly unknown[]): MeshHandler;
  createMeshServer(options: {
    identify(remoteAddress: string | undefined): Promise<{ admitted: true; caller: MeshCaller }>;
    handle: MeshHandler;
  }): Server;
  randomToken(bytes: number): string;
}

async function loadKeywork(root: string): Promise<KeyworkMesh> {
  const source = (path: string): string => pathToFileURL(join(root, "packages", path)).href;
  const routes = (await import(source("server/src/routes/mesh.ts"))) as Pick<
    KeyworkMesh,
    "meshTrustRoutes"
  >;
  const router = (await import(source("server/src/mesh/router.ts"))) as Pick<
    KeyworkMesh,
    "meshRouter"
  >;
  const engine = (await import(source("engine/src/index.ts"))) as Pick<
    KeyworkMesh,
    "createMeshServer" | "randomToken"
  >;
  return {
    meshTrustRoutes: routes.meshTrustRoutes,
    meshRouter: router.meshRouter,
    createMeshServer: engine.createMeshServer,
    randomToken: engine.randomToken,
  };
}

function houseTrust(): HouseTrust {
  return {
    pairing: { pairs: () => [pairWithViewer()] },
    grants: {},
    audit: {},
    screen: {
      house: ticket,
      self: () => sharer.stableId,
      machine: () => sharer.machine,
      pairSecret: async (id) => (id === pairId ? pairSecret : undefined),
    },
  };
}

function pairWithViewer(): PairRecord {
  return {
    id: pairId,
    peerStableId: viewer.node.stableId,
    peerUserId: viewer.user?.id ?? null,
    peerTags: [...viewer.tags],
    peerDeviceKey: "loopback-device-key",
    role: "console",
    caps: ["screen:view"],
    endpoint: null,
    createdAt: new Date(0).toISOString(),
    confirmedBy: "sas",
  };
}

async function listen(handle: MeshHandler, caller: MeshCaller): Promise<string> {
  const server = keywork.createMeshServer({
    identify: async () => ({ admitted: true, caller }),
    handle,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function callerOn(machine: LoopbackMachine, user: PeerIdentity["user"]): MeshCaller {
  return {
    address: "127.0.0.1",
    node: { stableId: machine.stableId, name: machine.machine, os: process.platform, tags: [] },
    human:
      user === undefined
        ? null
        : { userId: user.id, loginName: user.loginName, displayName: user.displayName },
    capMap: {},
  };
}

function callerAs(peer: PeerIdentity): MeshCaller {
  const caller = callerOn({ stableId: peer.node.stableId, machine: peer.node.name }, peer.user);
  return { ...caller, node: { ...caller.node, tags: [...peer.tags] } };
}

function observed(side: "sharer" | "viewer", handle: MeshHandler): MeshHandler {
  return async (request, caller) => {
    const { pathname } = new URL(request.url);
    const sent = request.method === "POST" ? await request.clone().text() : "";
    const response = await handle(request, caller);
    if (!response.ok) {
      const problem = await response.clone().text();
      report({ event: "refused", side, path: pathname, status: response.status, problem });
    } else if (pathname === signalPath && request.method === "GET") {
      report({ event: "following", side });
    } else if (pathname === signalPath) {
      report({ event: "signal", from: side, message: JSON.parse(sent) as unknown });
    } else if (pathname === ticketPath) {
      report({ event: "ticket", side, status: response.status });
    }
    return response;
  };
}

function report(line: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
