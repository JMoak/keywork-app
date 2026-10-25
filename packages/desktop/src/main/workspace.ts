import type { ServerTicket } from "@keywork-app/client";
import type { RecentStore, RecentWorkspace } from "./recents.ts";
import {
  expectedServerVersion,
  type ServeFailure,
  type ServerProcess,
  type ServeSpec,
  type ServeState,
} from "./serve-process.ts";
import type { LiveServer } from "./ticket.ts";
import type { TicketLocation } from "./workspace-identity.ts";

export interface OpenedWorkspace {
  workspace: string;
  server: ServerTicket;
  attached: boolean;
  version: string;
  binary: string | undefined;
}

export type WorkspaceOpen =
  | { ok: true; opened: OpenedWorkspace }
  | { ok: false; failure: ServeFailure };

export interface WorkspaceClock {
  every(ms: number, beat: () => Promise<void>): () => void;
  wait(ms: number): Promise<void>;
}

export interface WorkspaceSeams {
  locateTickets(workspace: string): Promise<TicketLocation>;
  readText(path: string): Promise<string | undefined>;
  removeFile(path: string): Promise<void>;
  probeTicket(ticket: ServerTicket): Promise<LiveServer | undefined>;
  supervise(spec: ServeSpec): ServerProcess;
  keyworkOnPath(): Promise<string | undefined>;
  binaryVersion(binary: string): Promise<string | undefined>;
  bundledBinary: string;
  recents: RecentStore;
  clock?: WorkspaceClock | undefined;
}

export interface WorkspaceHost {
  open(path: string): Promise<WorkspaceOpen>;
  restart(path: string): Promise<WorkspaceOpen>;
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

interface Held {
  opened: OpenedWorkspace;
  process: ServerProcess | undefined;
  unwatch: () => void;
  down: boolean;
  reattaching: Promise<WorkspaceOpen> | undefined;
}

interface Reopened {
  result: WorkspaceOpen;
  process: ServerProcess | undefined;
}

export function workspaceHost(seams: WorkspaceSeams): WorkspaceHost {
  const held = new Map<string, Held>();
  const clock = seams.clock ?? stillClock;
  const lossListeners = new Set<(loss: ServerLoss) => void>();
  const regainListeners = new Set<(regained: ServerRegained) => void>();

  const announceLoss = (workspace: string, failure: ServeFailure, reattaching: boolean): void => {
    for (const listener of [...lossListeners]) listener({ workspace, failure, reattaching });
  };
  const announceRegained = (workspace: string, opened: OpenedWorkspace): void => {
    for (const listener of [...regainListeners]) listener({ workspace, opened });
  };

  const attach = async (path: string): Promise<WorkspaceOpen | undefined> => {
    const location = await seams.locateTickets(path);
    for (const file of location.files) {
      const ticket = await readTicket(file, seams.readText);
      const server = ticket === undefined ? undefined : await seams.probeTicket(ticket);
      if (ticket === undefined || server === undefined) continue;
      if (!servesIdentity(server, location.identity)) continue;
      return attachedTo(path, ticket, server.version);
    }
    return undefined;
  };

  const spawn = async (path: string): Promise<Reopened> => {
    const binary = await chooseBinary(seams);
    const process = seams.supervise({ binary, cwd: path });
    const started = await process.start();
    if (!started.ok) return { result: started, process };
    const opened: OpenedWorkspace = {
      workspace: path,
      server: started.ticket,
      attached: false,
      version: started.version,
      binary,
    };
    return { result: { ok: true, opened }, process };
  };

  const attachOrSpawn = async (path: string): Promise<Reopened> => {
    const attached = await attach(path);
    return attached === undefined ? spawn(path) : { result: attached, process: undefined };
  };

  const reattach = async (path: string, entry: Held): Promise<Reopened> => {
    for (const waitMs of reattachWaitsMs) {
      await clock.wait(waitMs);
      if (held.get(path) !== entry) return { result: closedMeanwhile(entry), process: undefined };
      const attached = await attach(path);
      if (attached !== undefined) return { result: attached, process: undefined };
    }
    return spawn(path);
  };

  const release = async (entry: Held): Promise<void> => {
    entry.unwatch();
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
    const { result, process } = reopened;
    const stillWanted = held.get(path) === entry;
    if (!stillWanted || !result.ok) await process?.stop();
    if (!stillWanted) return result;
    if (!result.ok) {
      announceLoss(path, result.failure, false);
      return result;
    }
    hold(path, result.opened, process);
    announceRegained(path, result.opened);
    return result;
  };

  const heartbeat = (path: string, entry: Held): (() => void) => {
    let misses = 0;
    return clock.every(heartbeatMs, async () => {
      if (held.get(path) !== entry || entry.down) return;
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
        announceLoss(path, failure, state.kind === "failed" && state.retrying === true);
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
  ): void => {
    const entry: Held = {
      opened,
      process,
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
    const { result, process } = await attachOrSpawn(path);
    if (!result.ok) {
      await process?.stop();
      return result;
    }
    hold(path, result.opened, process);
    await seams.recents.touch(path);
    return result;
  };

  const forget = async (path: string): Promise<void> => {
    const entry = held.get(path);
    if (entry === undefined) return;
    held.delete(path);
    await releaseTracked(entry);
  };

  const host: WorkspaceHost = {
    open: async (path) => {
      const already = held.get(path);
      const standing = already === undefined ? undefined : await standingOf(path, already);
      if (standing !== undefined) return standing;
      await forget(path);
      return openFresh(path);
    },
    restart: async (path) => {
      await forget(path);
      return host.open(path);
    },
    close: forget,
    closeAll: async () => {
      for (const path of [...held.keys()]) await forget(path);
      await Promise.all([...releasing]);
    },
    recent: () => seams.recents.list(),
    openRoots: () => [...held.keys()],
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

export async function chooseBinary(
  seams: Pick<WorkspaceSeams, "keyworkOnPath" | "binaryVersion" | "bundledBinary">,
): Promise<string> {
  const onPath = await seams.keyworkOnPath();
  if (onPath === undefined) return seams.bundledBinary;
  const version = await seams.binaryVersion(onPath);
  return version === expectedServerVersion ? onPath : seams.bundledBinary;
}

export function versionOfLine(line: string): string | undefined {
  return line.trim().match(/^keywork (\S+)$/)?.[1];
}

const stillClock: WorkspaceClock = {
  every: () => () => undefined,
  wait: async () => undefined,
};

function servesIdentity(server: LiveServer, identity: string): boolean {
  return server.identity === undefined || server.identity === identity;
}

function attachedTo(workspace: string, ticket: ServerTicket, version: string): WorkspaceOpen {
  if (version !== expectedServerVersion) {
    return {
      ok: false,
      failure: {
        kind: "version-mismatch",
        expected: expectedServerVersion,
        actual: version,
        ticket,
      },
    };
  }
  return {
    ok: true,
    opened: { workspace, server: ticket, attached: true, version, binary: undefined },
  };
}

function closedMeanwhile(entry: Held): WorkspaceOpen {
  return { ok: false, failure: { kind: "gone", url: entry.opened.server.url } };
}

function lossOf(state: ServeState): ServeFailure | undefined {
  return state.kind === "failed" ? state.failure : undefined;
}
