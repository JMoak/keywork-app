import { dirname } from "node:path";
import type { ServerDocument, ServerTicket } from "@keywork-app/client";
import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import type { RecentStore, RecentWorkspace } from "./recents.ts";
import { runtimeFailure } from "./runtime-failure.ts";
import {
  type ContractMismatch,
  type EngineOrigin,
  type EngineSource,
  healthCheck,
  type NodeTicketOwner,
  type ServeFailure,
  type ServerProcess,
  type ServeSpec,
  type ServeState,
  withSource,
} from "./serve-process.ts";
import type { LiveServer } from "./ticket.ts";
import type { TicketLocation } from "./workspace-identity.ts";

export interface OpenedWorkspace {
  workspace: string;
  server: ServerTicket;
  attached: boolean;
  version: string;
  binary: string | undefined;
  servedByNode?: boolean | undefined;
}

export type WorkspaceOpen =
  | { ok: true; opened: OpenedWorkspace }
  | { ok: false; failure: ServeFailure };

export interface EngineLaunch {
  origin: Exclude<EngineOrigin, "ticket">;
  command: string;
  entry: readonly string[];
  from: string;
}

export interface SiblingCheckout {
  root: string;
  cli: string;
}

export interface EngineSeams {
  packaged: boolean;
  bundledBinary: string;
  keyworkBin: string | undefined;
  siblingCheckout(): Promise<SiblingCheckout | undefined>;
  keyworkOnPath(): Promise<string | undefined>;
}

export interface WorkspaceClock {
  every(ms: number, beat: () => Promise<void>): () => void;
  wait(ms: number): Promise<void>;
}

export interface NodeRun {
  code: number | null;
  output: string;
}

export interface NodeServing {
  required?: boolean;
  serves(): Promise<boolean>;
  add(folder: string, home?: boolean): Promise<NodeRun>;
  renew?(folder: string, home?: boolean): Promise<NodeRun>;
  remove(folder: string): Promise<NodeRun>;
}

export type FolderServing = "node" | "console";

export interface WorkspaceSeams {
  homePath?: string;
  profile?: ProductProfile;
  locateTickets(workspace: string): Promise<TicketLocation>;
  readText(path: string): Promise<string | undefined>;
  removeFile(path: string): Promise<void>;
  probeTicket(ticket: ServerTicket): Promise<LiveServer | undefined>;
  fetchDocument(ticket: ServerTicket): Promise<ServerDocument>;
  supervise(spec: ServeSpec): ServerProcess;
  engine(): Promise<EngineLaunch>;
  recents: RecentStore;
  clock?: WorkspaceClock | undefined;
  node?: NodeServing | undefined;
}

export interface WorkspaceHost {
  openHome?(): Promise<WorkspaceOpen>;
  open(path: string): Promise<WorkspaceOpen>;
  restart(path: string): Promise<WorkspaceOpen>;
  stopServing(path: string): Promise<WorkspaceOpen>;
  servingOf(path: string): FolderServing | undefined;
  close(path: string): Promise<void>;
  closeAll(): Promise<void>;
  recent(): Promise<readonly RecentWorkspace[]>;
  openRoots(): readonly string[];
  ticketFor(path: string): ServerTicket | undefined;
  suspect(path: string): void;
  onServerLost(listener: (loss: ServerLoss) => void): () => void;
  onServerRegained(listener: (regained: ServerRegained) => void): () => void;
}

export interface ServerLoss {
  workspace: string;
  failure: ServeFailure;
  reattaching: boolean;
}

export interface ServerRegained {
  workspace: string;
  opened: OpenedWorkspace;
}

export const heartbeatMs = 4000;

export const missesBeforeLoss = 2;

export const reattachWaitsMs: readonly number[] = [500, 1000, 2000, 4000];

export const nodeTicketWaitsMs: readonly number[] = [
  250, 500, 750, 1000, 1500, 2000, 3000, 4000, 7000,
];

interface Held {
  opened: OpenedWorkspace;
  process: ServerProcess | undefined;
  source: EngineSource;
  unwatch: () => void;
  down: boolean;
  reattaching: Promise<WorkspaceOpen> | undefined;
}

interface Reopened {
  result: WorkspaceOpen;
  process: ServerProcess | undefined;
  source: EngineSource;
}

export function workspaceHost(seams: WorkspaceSeams): WorkspaceHost {
  const held = new Map<string, Held>();
  const opening = new Map<string, Promise<WorkspaceOpen>>();
  const homes = new Set<string>();
  const clock = seams.clock ?? stillClock;
  const lossListeners = new Set<(loss: ServerLoss) => void>();
  const regainListeners = new Set<(regained: ServerRegained) => void>();

  const announceLoss = (workspace: string, failure: ServeFailure, reattaching: boolean): void => {
    for (const listener of [...lossListeners]) listener({ workspace, failure, reattaching });
  };
  const announceRegained = (workspace: string, opened: OpenedWorkspace): void => {
    for (const listener of [...regainListeners]) listener({ workspace, opened });
  };

  const attach = async (path: string): Promise<Reopened | undefined> => {
    const location = await seams.locateTickets(path);
    for (const file of location.files) {
      const ticket = await readTicket(file, seams.readText);
      const server = ticket === undefined ? undefined : await seams.probeTicket(ticket);
      if (ticket === undefined || server === undefined) continue;
      if (!servesIdentity(server, location.identity)) continue;
      const checked = await healthCheck(ticket, seams.fetchDocument);
      if (!checked.ok && checked.failure.kind === "unreachable") continue;
      const source = ticketSource(ticket);
      const result: WorkspaceOpen = checked.ok
        ? { ok: true, opened: attachedTo(path, ticket, checked.version) }
        : { ok: false, failure: withSource(checked.failure, source) };
      return { result, process: undefined, source };
    }
    return undefined;
  };

  const spawn = async (path: string): Promise<Reopened> => {
    const engine = await seams.engine();
    const source = engineSource(engine);
    const process = seams.supervise(serveSpecFor(engine, path, homes.has(path)));
    const started = await process.start();
    if (!started.ok) {
      return {
        result: { ok: false, failure: withSource(started.failure, source) },
        process,
        source,
      };
    }
    const opened: OpenedWorkspace = {
      workspace: path,
      server: started.ticket,
      attached: false,
      version: started.version,
      binary: engine.from,
    };
    return { result: { ok: true, opened }, process, source };
  };

  const consoleOnly = new Set<string>();

  const servingNode = async (path: string): Promise<NodeServing | undefined> => {
    const node = seams.node;
    if (node === undefined || consoleOnly.has(path)) return undefined;
    return (await node.serves().catch(() => false)) ? node : undefined;
  };

  const nodeTicket = async (path: string): Promise<Reopened | undefined> => {
    for (const waitMs of [0, ...nodeTicketWaitsMs]) {
      await clock.wait(waitMs);
      const attached = await attach(path);
      if (attached !== undefined) return attached;
    }
    return undefined;
  };

  const handToNode = async (path: string, node: NodeServing): Promise<Reopened> => {
    const ran = await node.add(path, homes.has(path));
    if (ran.code !== 0) return refusedBy(nodeRefusal(ran));
    const attached = await nodeTicket(path);
    if (attached === undefined) return refusedBy(nodeSilence(nodeTicketWaitsMs));
    return attached.result.ok ? servedByTheNode(attached, attached.result.opened) : attached;
  };

  const serve = async (path: string): Promise<Reopened> => {
    const node = await servingNode(path);
    if (node !== undefined) return handToNode(path, node);
    if (seams.node?.required === true) return refusedBy(sharedRuntimeUnavailable());
    return (await attach(path)) ?? spawn(path);
  };

  const serveAgain = async (path: string): Promise<Reopened> => {
    const node = await servingNode(path);
    if (node === undefined && seams.node?.required === true)
      return refusedBy(sharedRuntimeUnavailable());
    return node === undefined ? spawn(path) : handToNode(path, node);
  };

  const untilLetGo = async (ticket: ServerTicket): Promise<void> => {
    for (const waitMs of [0, ...nodeTicketWaitsMs]) {
      await clock.wait(waitMs);
      if ((await seams.probeTicket(ticket)) === undefined) return;
    }
  };

  const reattach = async (path: string, entry: Held): Promise<Reopened> => {
    for (const waitMs of reattachWaitsMs) {
      await clock.wait(waitMs);
      if (held.get(path) !== entry) {
        return { result: closedMeanwhile(entry), process: undefined, source: entry.source };
      }
      const attached = await attach(path);
      if (attached !== undefined) {
        return entry.opened.servedByNode && attached.result.ok
          ? servedByTheNode(attached, attached.result.opened)
          : attached;
      }
    }
    return serveAgain(path);
  };

  const release = async (entry: Held): Promise<void> => {
    entry.unwatch();
    if (entry.opened.servedByNode === true && seams.node?.required)
      await seams.node.remove(entry.opened.workspace);
    if (entry.process === undefined) return;
    await entry.process.stop();
    await clearStaleTickets(entry.opened.workspace, entry.opened.server.url);
  };

  const releasing = new Set<Promise<void>>();
  const releaseTracked = (entry: Held): Promise<void> => {
    const done = release(entry).finally(() => releasing.delete(done));
    releasing.add(done);
    return done;
  };

  const clearStaleTickets = async (workspace: string, url: string): Promise<void> => {
    for (const file of (await seams.locateTickets(workspace)).files) {
      const ticket = await readTicket(file, seams.readText);
      if (ticket?.url === url) await seams.removeFile(file);
    }
  };

  const lose = (path: string, entry: Held): Promise<WorkspaceOpen> => {
    if (entry.reattaching !== undefined) return entry.reattaching;
    entry.down = true;
    entry.unwatch();
    announceLoss(path, { kind: "gone", url: entry.opened.server.url }, true);
    entry.reattaching = reattach(path, entry).then((reopened) => settle(path, entry, reopened));
    return entry.reattaching;
  };

  const settle = async (path: string, entry: Held, reopened: Reopened): Promise<WorkspaceOpen> => {
    const { result, process, source } = reopened;
    const stillWanted = held.get(path) === entry;
    if (!stillWanted || !result.ok) await process?.stop();
    if (!stillWanted) return result;
    if (!result.ok) {
      announceLoss(path, result.failure, false);
      return result;
    }
    hold(path, result.opened, process, source);
    announceRegained(path, result.opened);
    return result;
  };

  const heartbeat = (path: string, entry: Held): (() => void) => {
    let misses = 0;
    let beats = 0;
    return clock.every(heartbeatMs, async () => {
      if (held.get(path) !== entry || entry.down) return;
      if (entry.opened.servedByNode && seams.node?.renew !== undefined && ++beats % 3 === 0) {
        const renewed = await seams.node.renew(path, homes.has(path));
        if (renewed.code !== 0) {
          entry.down = true;
          announceLoss(path, nodeRefusal(renewed), false);
          return;
        }
      }
      misses = (await seams.probeTicket(entry.opened.server)) === undefined ? misses + 1 : 0;
      if (misses >= missesBeforeLoss) void lose(path, entry);
    });
  };

  const followProcess = (path: string, entry: Held, process: ServerProcess): (() => void) =>
    process.watch((state) => {
      if (held.get(path) !== entry) return;
      const failure = lossOf(state);
      if (failure !== undefined) {
        entry.down = true;
        announceLoss(
          path,
          withSource(failure, entry.source),
          state.kind === "failed" && state.retrying === true,
        );
      }
      if (state.kind !== "ready") return;
      entry.opened = { ...entry.opened, server: state.ticket, version: state.version };
      if (!entry.down) return;
      entry.down = false;
      announceRegained(path, entry.opened);
    });

  const hold = (
    path: string,
    opened: OpenedWorkspace,
    process: ServerProcess | undefined,
    source: EngineSource,
  ): void => {
    const entry: Held = {
      opened,
      process,
      source,
      unwatch: () => undefined,
      down: false,
      reattaching: undefined,
    };
    held.set(path, entry);
    entry.unwatch =
      process === undefined ? heartbeat(path, entry) : followProcess(path, entry, process);
  };

  const standingOf = async (path: string, entry: Held): Promise<WorkspaceOpen | undefined> => {
    if (entry.process !== undefined) {
      const recovering = entry.down && entry.process.state.kind !== "starting";
      return recovering ? undefined : { ok: true, opened: entry.opened };
    }
    if (entry.reattaching === undefined) {
      const alive = (await seams.probeTicket(entry.opened.server)) !== undefined;
      if (alive) return { ok: true, opened: entry.opened };
    }
    const reopened = await lose(path, entry);
    if (!reopened.ok && held.get(path) === entry) held.delete(path);
    return reopened;
  };

  const openFresh = async (path: string): Promise<WorkspaceOpen> => {
    const { result, process, source } = await serve(path);
    if (!result.ok) {
      await process?.stop();
      return result;
    }
    hold(path, result.opened, process, source);
    if (!homes.has(path)) await seams.recents.touch(path);
    return result;
  };

  const forget = async (path: string): Promise<void> => {
    const entry = held.get(path);
    if (entry === undefined) return;
    held.delete(path);
    await releaseTracked(entry);
  };

  const host: WorkspaceHost = {
    openHome: () => {
      if (seams.homePath === undefined)
        return Promise.resolve({
          ok: false,
          failure: {
            kind: "unresolved",
            message: "The private creature home is unavailable.",
            nextAction: "Restart the app after preparing its shared engine.",
          },
        });
      homes.add(seams.homePath);
      return host.open(seams.homePath);
    },
    open: (path) => {
      const pending = opening.get(path);
      if (pending !== undefined) return pending;
      const next = (async () => {
        const already = held.get(path);
        const standing = already === undefined ? undefined : await standingOf(path, already);
        if (standing !== undefined) return standing;
        await forget(path);
        return openFresh(path);
      })().finally(() => opening.delete(path));
      opening.set(path, next);
      return next;
    },
    restart: async (path) => {
      await forget(path);
      return host.open(path);
    },
    stopServing: async (path) => {
      if (seams.node?.required === true)
        return {
          ok: false,
          failure: {
            kind: "unresolved",
            message: "The shared engine keeps other clients and authorized work running.",
            nextAction: "Close this workspace to release this window's connection.",
          },
        };
      if (seams.node === undefined)
        return { ok: false, failure: notServedByTheNode(seams.profile ?? keyworkProfile) };
      const ran = await seams.node.remove(path);
      if (ran.code !== 0) return { ok: false, failure: nodeKeptServing(ran) };
      consoleOnly.add(path);
      const letGo = held.get(path)?.opened.server;
      await forget(path);
      if (letGo !== undefined) await untilLetGo(letGo);
      return openFresh(path);
    },
    close: async (path) => {
      await Promise.allSettled([opening.get(path)]);
      await forget(path);
    },
    closeAll: async () => {
      await Promise.allSettled([...opening.values()]);
      for (const path of [...held.keys()]) await forget(path);
      await Promise.all([...releasing]);
    },
    recent: () => seams.recents.list(),
    openRoots: () => [...held.keys()],
    servingOf: (path) => {
      const entry = held.get(path);
      if (entry === undefined) return undefined;
      return entry.opened.servedByNode === true ? "node" : "console";
    },
    ticketFor: (path) => {
      const entry = held.get(path);
      return entry === undefined || entry.down ? undefined : entry.opened.server;
    },
    suspect: (path) => {
      const entry = held.get(path);
      if (entry === undefined || entry.down || entry.process !== undefined) return;
      void seams.probeTicket(entry.opened.server).then((server) => {
        if (server === undefined && held.get(path) === entry) void lose(path, entry);
      });
    },
    onServerLost: (listener) => {
      lossListeners.add(listener);
      return () => lossListeners.delete(listener);
    },
    onServerRegained: (listener) => {
      regainListeners.add(listener);
      return () => regainListeners.delete(listener);
    },
  };
  return host;
}

export async function readTicket(
  file: string,
  readText: (path: string) => Promise<string | undefined>,
): Promise<ServerTicket | undefined> {
  const text = await readText(file);
  if (text === undefined) return undefined;
  try {
    const parsed = JSON.parse(text) as { url?: unknown; token?: unknown };
    if (typeof parsed.url === "string" && typeof parsed.token === "string") {
      return { url: parsed.url, token: parsed.token };
    }
  } catch {}
  return undefined;
}

export async function chooseEngine(seams: EngineSeams): Promise<EngineLaunch> {
  if (seams.packaged) return sidecarEngine(seams.bundledBinary);
  if (seams.keyworkBin !== undefined && seams.keyworkBin !== "") {
    return directEngine("KEYWORK_BIN", seams.keyworkBin);
  }
  const sibling = await seams.siblingCheckout();
  if (sibling !== undefined) {
    return { origin: "sibling repo", command: "bun", entry: [sibling.cli], from: sibling.cli };
  }
  const onPath = await seams.keyworkOnPath();
  return onPath === undefined ? sidecarEngine(seams.bundledBinary) : directEngine("PATH", onPath);
}

export async function launchableEngine(seams: EngineSeams): Promise<string> {
  const engine = await chooseEngine(seams);
  if (engine.entry.length === 0) return engine.command;
  const withoutSibling: EngineSeams = { ...seams, siblingCheckout: async () => undefined };
  return (await chooseEngine(withoutSibling)).command;
}

export function serveSpecFor(engine: EngineLaunch, cwd: string, home = false): ServeSpec {
  const spec: ServeSpec = {
    binary: engine.command,
    cwd,
    ...(home && { home: true, launchCwd: dirname(engine.from) }),
  };
  return engine.entry.length === 0 ? spec : { ...spec, entry: engine.entry };
}

export function engineSource(engine: EngineLaunch): EngineSource {
  return { origin: engine.origin, from: engine.from };
}

export function ticketSource(ticket: ServerTicket): EngineSource {
  return { origin: "ticket", from: ticket.url };
}

export function contractRefusal(
  failure: ContractMismatch,
  profile: ProductProfile = keyworkProfile,
): {
  message: string;
  nextAction: string;
} {
  const productName = profile.name;
  const spoke =
    failure.actual === undefined ? "names no contract" : `speaks contract ${failure.actual}`;
  return {
    message: `${engineWords(failure.source, productName)} ${spoke}; ${productName} was built for contract ${failure.expected}`,
    nextAction: nextActionFor(failure.source, failure.expected, productName),
  };
}

export function versionOfLine(line: string): string | undefined {
  return line.trim().match(/^keywork (\S+)(?: · contract \S+)?$/)?.[1];
}

export function firstLineOf(output: string): string {
  return (
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

const stillClock: WorkspaceClock = {
  every: () => () => undefined,
  wait: async () => undefined,
};

function sidecarEngine(bundledBinary: string): EngineLaunch {
  return directEngine("sidecar", bundledBinary);
}

function directEngine(origin: "sidecar" | "KEYWORK_BIN" | "PATH", binary: string): EngineLaunch {
  return { origin, command: binary, entry: [], from: binary };
}

function engineWords(source: EngineSource | undefined, productName: string): string {
  if (source === undefined) return "the engine";
  const { origin, from, node } = source;
  switch (origin) {
    case "sidecar":
      return `the engine this console ships (${from})`;
    case "KEYWORK_BIN":
      return `the engine KEYWORK_BIN names (${from})`;
    case "sibling repo":
      return `the engine in the sibling checkout (${from})`;
    case "PATH":
      return `the engine on PATH (${from})`;
    case "ticket":
      return ticketWords(hostOf(from), node, productName);
  }
}

function ticketWords(host: string, node: NodeTicketOwner | undefined, productName: string): string {
  switch (node) {
    case "shared-runtime":
      return `the shared engine serving this folder (${host})`;
    case "this-install":
      return `the node ${productName} installed, serving this folder (${host}),`;
    case "another-install":
      return `the node serving this folder (${host}), which ${productName} did not install,`;
    case undefined:
      return `the engine already serving this folder (${host})`;
  }
}

function nextActionFor(
  source: EngineSource | undefined,
  expected: string,
  productName: string,
): string {
  switch (source?.origin) {
    case "sidecar":
      return `reinstall ${productName}; its console and engine were built apart`;
    case "KEYWORK_BIN":
      return `point KEYWORK_BIN at an engine that speaks ${expected}, or unset it`;
    case "sibling repo":
      return `bring that checkout to contract ${expected}`;
    case "PATH":
      return `put an engine that speaks ${expected} first on PATH, or name one in KEYWORK_BIN`;
    case "ticket":
      return ticketNextAction(source?.node, productName);
    case undefined:
      return "";
  }
}

function ticketNextAction(node: NodeTicketOwner | undefined, productName: string): string {
  switch (node) {
    case "shared-runtime":
      return "Use matching app releases. Incompatible shared-engine upgrades require explicit maintenance; existing clients and background work remain running.";
    case "this-install":
      return `restart the node on the engine ${productName} ships (\`keywork node restart\`); ${productName} asks before it does`;
    case "another-install":
      return `${productName} never restarts a node it did not install; run \`keywork node restart\` with the engine that installed it, then open the folder again`;
    case undefined:
      return "stop that engine and open the folder again";
  }
}

function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

function servesIdentity(server: LiveServer, identity: string): boolean {
  return server.identity === undefined || server.identity === identity;
}

function servedByTheNode(reopened: Reopened, opened: OpenedWorkspace): Reopened {
  return { ...reopened, result: { ok: true, opened: { ...opened, servedByNode: true } } };
}

function refusedBy(failure: ServeFailure): Reopened {
  return { result: { ok: false, failure }, process: undefined, source: nodeHandOff };
}

const nodeHandOff: EngineSource = { origin: "ticket", from: "the node" };

function sharedRuntimeUnavailable(): ServeFailure {
  return {
    kind: "unresolved",
    message: "The shared engine is not running.",
    nextAction: "Enable background work before opening your creature home or a project.",
  };
}

function nodeRefusal(ran: NodeRun): ServeFailure {
  if (ran.output.trimStart().startsWith("{"))
    return { kind: "unresolved", ...runtimeFailure(ran.output) };
  return {
    kind: "unresolved",
    message: `the node did not take this folder: ${firstLineOf(ran.output) || `exit ${ran.code ?? "without a code"}`}`,
    nextAction: "run `keywork node workspace add` in that folder to read the whole output",
  };
}

function nodeSilence(waitsMs: readonly number[]): ServeFailure {
  const seconds = Math.round(waitsMs.reduce((total, waitMs) => total + waitMs, 0) / 1000);
  return {
    kind: "unresolved",
    message: `the node took this folder but did not start serving it within ${seconds} s`,
    nextAction:
      "`keywork node workspace list` shows what the node is doing with it; a node older than this console serves opened folders after `keywork node restart`",
  };
}

function nodeKeptServing(ran: NodeRun): ServeFailure {
  return {
    kind: "unresolved",
    message: `the node did not stop serving this folder: ${firstLineOf(ran.output) || `exit ${ran.code ?? "without a code"}`}`,
    nextAction: "run `keywork node workspace remove` in that folder to read the whole output",
  };
}

function notServedByTheNode(profile: ProductProfile): ServeFailure {
  return {
    kind: "unresolved",
    message: `this folder runs with the console; ${profile.name} has no node to hand it to`,
    nextAction: "",
  };
}

function attachedTo(workspace: string, ticket: ServerTicket, version: string): OpenedWorkspace {
  return { workspace, server: ticket, attached: true, version, binary: undefined };
}

function closedMeanwhile(entry: Held): WorkspaceOpen {
  return { ok: false, failure: { kind: "gone", url: entry.opened.server.url } };
}

function lossOf(state: ServeState): ServeFailure | undefined {
  return state.kind === "failed" ? state.failure : undefined;
}
