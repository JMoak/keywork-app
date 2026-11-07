import type {
  SignalingEndpoint,
  SignalingListener,
  SignalingTransport,
  SignalMessage,
} from "@keywork-app/screen";
import { z } from "zod";

export type SignalingRoute =
  | { readonly ok: true; readonly endpoint: SignalingEndpoint }
  | { readonly ok: false; readonly problem: string };

export type SignalingRouter = (peer: string, sessionId: string) => Promise<SignalingRoute>;

export type InboundRouter = () => Promise<SignalingRoute>;

export interface SignalingRouteSeams {
  readonly nodeFile: () => Promise<string | undefined>;
  readonly houseFile: () => Promise<string | undefined>;
  readonly census: () => Promise<unknown>;
  readonly pairs: () => Promise<unknown>;
  readonly fetch?: typeof fetch | undefined;
}

export const meshScreenSignalPath = "/mesh/screen/signal";
export const meshScreenTicketPath = "/mesh/screen/tickets";

export function signalingRoutes(seams: SignalingRouteSeams): SignalingRouter {
  return async (peer, sessionId) => {
    const [node, census] = await Promise.all([runningNode(seams), meshCensus(seams)]);
    if (namesThisMachine(peer, node, census)) {
      const house = await localHouse(seams, node, census, peer);
      return house.ok ? viewerRoute(house.listener, house.token, sessionId) : house;
    }
    if (census === undefined) return refuse(`cannot look up ${peer}: no engine answers`);
    const known = census.peers.find((machine) => names(machine, peer));
    if (known === undefined) return refuse(`${peer} is not a machine on this tailnet`);
    const pair = (await meshPairs(seams)).find((entry) => entry.peerStableId === known.stableId);
    if (pair === undefined) return refuse(`${peer} is not paired with this machine`);
    const listener = pair.endpoint ?? known.endpoint;
    if (listener === undefined) return refuse(`${peer} has no node listening on the tailnet`);
    const ticket = await pairTicket(seams, node, census, { peer, pairId: pair.id, sessionId });
    return ticket.ok ? viewerRoute(listener, ticket.token, sessionId) : ticket;
  };
}

export function inboundSignaling(seams: SignalingRouteSeams): InboundRouter {
  return async () => {
    const [node, census] = await Promise.all([runningNode(seams), meshCensus(seams)]);
    const house = await localHouse(seams, node, census, node?.machine ?? "this machine");
    if (!house.ok) return house;
    const url = new URL(meshScreenSignalPath, house.listener);
    url.searchParams.set("party", "sharer");
    return { ok: true, endpoint: { url: url.href, token: house.token } };
  };
}

export function routedTransport(
  route: InboundRouter,
  open: (endpoint: SignalingEndpoint) => SignalingTransport,
): SignalingTransport {
  let current: SignalingTransport | undefined;
  return {
    send: async (message: SignalMessage) => {
      if (current === undefined) throw new Error("no inbound signaling route is open");
      await current.send(message);
    },
    listen: (listener: SignalingListener) => {
      let stopped = false;
      let stop = (): void => {};
      void route().then((resolved) => {
        if (stopped) return;
        if (!resolved.ok) return listener.closed(resolved.problem);
        current = open(resolved.endpoint);
        stop = current.listen(listener);
      });
      return () => {
        stopped = true;
        stop();
      };
    },
  };
}

const nodeFileShape = z.object({
  state: z.string(),
  machine: z.object({ name: z.string() }),
  ports: z.object({ mesh: z.number().int().positive() }),
});

const machineShape = z.object({
  stableId: z.string(),
  machine: z.string(),
  dnsName: z.string().default(""),
  addresses: z.array(z.string()).default([]),
  endpoint: z.string().optional(),
});

const censusShape = z.object({ self: machineShape.nullable(), peers: z.array(machineShape) });

const pairsShape = z.object({
  pairs: z.array(
    z.object({ id: z.string(), peerStableId: z.string(), endpoint: z.string().nullable() }),
  ),
});

const houseShape = z.object({ token: z.string().min(1), listeners: z.array(z.string()) });

const issuedShape = z.object({ token: z.string().min(1) });

const refusalShape = z.object({ error: z.string() });

type House = { readonly ok: true; readonly listener: string; readonly token: string };
type Ticket = { readonly ok: true; readonly token: string };
type Refusal = { readonly ok: false; readonly problem: string };

type LocalNode = { readonly machine: string; readonly meshPort: number };
type Machine = z.infer<typeof machineShape>;
type Census = z.infer<typeof censusShape>;

async function runningNode(seams: SignalingRouteSeams): Promise<LocalNode | undefined> {
  const parsed = nodeFileShape.safeParse(parseJson(await seams.nodeFile().catch(() => undefined)));
  if (!parsed.success || parsed.data.state !== "running") return undefined;
  return { machine: parsed.data.machine.name, meshPort: parsed.data.ports.mesh };
}

async function meshCensus(seams: SignalingRouteSeams): Promise<Census | undefined> {
  const parsed = censusShape.safeParse(await seams.census().catch(() => undefined));
  return parsed.success ? parsed.data : undefined;
}

async function meshPairs(seams: SignalingRouteSeams) {
  const parsed = pairsShape.safeParse(await seams.pairs().catch(() => undefined));
  return parsed.success ? parsed.data.pairs : [];
}

function namesThisMachine(
  peer: string,
  node: LocalNode | undefined,
  census: Census | undefined,
): boolean {
  if (node !== undefined && sameName(node.machine, peer)) return true;
  return census?.self != null && names(census.self, peer);
}

async function localHouse(
  seams: SignalingRouteSeams,
  node: LocalNode | undefined,
  census: Census | undefined,
  peer: string,
): Promise<House | Refusal> {
  if (node === undefined) return refuse(`no node is running on ${peer}: start \`keywork node\``);
  const parsed = houseShape.safeParse(parseJson(await seams.houseFile().catch(() => undefined)));
  if (!parsed.success)
    return refuse(`the node on ${peer} has published no screen ticket: restart \`keywork node\``);
  const listener = preferIpv4(parsed.data.listeners) ?? censusListener(node, census);
  if (listener === undefined) return refuse(`the node on ${peer} has no tailnet address`);
  return { ok: true, listener, token: parsed.data.token };
}

async function pairTicket(
  seams: SignalingRouteSeams,
  node: LocalNode | undefined,
  census: Census | undefined,
  wanted: { peer: string; pairId: string; sessionId: string },
): Promise<Ticket | Refusal> {
  const house = await localHouse(seams, node, census, "this machine");
  if (!house.ok) return refuse(`cannot vouch for this console to ${wanted.peer}: ${house.problem}`);
  const fetchImpl = seams.fetch ?? fetch;
  try {
    const response = await fetchImpl(new URL(meshScreenTicketPath, house.listener).href, {
      method: "POST",
      headers: { authorization: `Bearer ${house.token}`, "content-type": "application/json" },
      body: JSON.stringify({ pairId: wanted.pairId, sessionId: wanted.sessionId }),
    });
    const body: unknown = await response.json().catch(() => undefined);
    const issued = issuedShape.safeParse(body);
    if (response.ok && issued.success) return { ok: true, token: issued.data.token };
    const refusal = refusalShape.safeParse(body);
    const why = refusal.success ? refusal.data.error : `status ${response.status}`;
    return refuse(`this node would not vouch for a view of ${wanted.peer}: ${why}`);
  } catch (error) {
    return refuse(`this node did not answer for a view of ${wanted.peer}: ${String(error)}`);
  }
}

function censusListener(node: LocalNode, census: Census | undefined): string | undefined {
  const addresses = census?.self?.addresses ?? [];
  const address = addresses.find(isIpv4) ?? addresses[0];
  return address === undefined ? undefined : `http://${urlHost(address)}:${node.meshPort}`;
}

function preferIpv4(listeners: readonly string[]): string | undefined {
  return listeners.find((listener) => !listener.includes("[")) ?? listeners[0];
}

function viewerRoute(listener: string, token: string, sessionId: string): SignalingRoute {
  const url = new URL(meshScreenSignalPath, listener);
  url.searchParams.set("session", sessionId);
  return { ok: true, endpoint: { url: url.href, token } };
}

function refuse(problem: string): Refusal {
  return { ok: false, problem };
}

function names(machine: Machine, peer: string): boolean {
  const dnsName = machine.dnsName.replace(/\.$/, "");
  const candidates = [machine.machine, machine.stableId, dnsName, dnsName.split(".")[0] ?? ""];
  return candidates.some((candidate) => candidate !== "" && sameName(candidate, peer));
}

function sameName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isIpv4(address: string): boolean {
  return !address.includes(":");
}

function urlHost(address: string): string {
  return isIpv4(address) ? address : `[${address}]`;
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
