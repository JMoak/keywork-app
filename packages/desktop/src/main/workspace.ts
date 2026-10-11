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
}

export interface WorkspaceHost {
  open(path: string): Promise<WorkspaceOpen>;
  restart(path: string): Promise<WorkspaceOpen>;
  close(path: string): Promise<void>;
  closeAll(): Promise<void>;
  recent(): Promise<readonly RecentWorkspace[]>;
  openRoots(): readonly string[];
  ticketFor(path: string): ServerTicket | undefined;
  onServerLost(listener: (loss: ServerLoss) => void): () => void;
}

export interface ServerLoss {
  workspace: string;
  failure: ServeFailure;
}

interface Held {
  opened: OpenedWorkspace;
  process: ServerProcess | undefined;
  unwatch: () => void;
}

export function workspaceHost(seams: WorkspaceSeams): WorkspaceHost {
  const held = new Map<string, Held>();
  const lossListeners = new Set<(loss: ServerLoss) => void>();

  const announceLoss = (workspace: string, failure: ServeFailure): void => {
    for (const listener of [...lossListeners]) listener({ workspace, failure });
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

  const spawn = async (
    path: string,
  ): Promise<{ result: WorkspaceOpen; process: ServerProcess }> => {
    const binary = await chooseBinary(seams);
    const process = seams.supervise({ binary, cwd: path });
    const started = await process.start();
    if (!started.ok) return { result: started, process };
    return {
      result: {
        ok: true,
        opened: {
          workspace: path,
          server: started.ticket,
          attached: false,
          version: started.version,
          binary,
        },
      },
      process,
    };
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

  const hold = (
    path: string,
    opened: OpenedWorkspace,
    process: ServerProcess | undefined,
  ): void => {
    const unwatch =
      process?.watch((state) => {
        const failure = lossOf(state);
        if (failure !== undefined) announceLoss(path, failure);
        if (state.kind === "ready") {
          const entry = held.get(path);
          if (entry !== undefined) entry.opened = { ...entry.opened, server: state.ticket };
        }
      }) ?? (() => undefined);
    held.set(path, { opened, process, unwatch });
  };

  const host: WorkspaceHost = {
    open: async (path) => {
      const already = held.get(path);
      if (already !== undefined) return { ok: true, opened: already.opened };
      const attached = await attach(path);
      if (attached !== undefined) {
        if (attached.ok) {
          hold(path, attached.opened, undefined);
          await seams.recents.touch(path);
        }
        return attached;
      }
      const { result, process } = await spawn(path);
      if (!result.ok) {
        await process.stop();
        return result;
      }
      hold(path, result.opened, process);
      await seams.recents.touch(path);
      return result;
    },
    restart: async (path) => {
      const entry = held.get(path);
      if (entry !== undefined) {
        held.delete(path);
        await releaseTracked(entry);
      }
      return host.open(path);
    },
    close: async (path) => {
      const entry = held.get(path);
      if (entry === undefined) return;
      held.delete(path);
      await releaseTracked(entry);
    },
    closeAll: async () => {
      for (const path of [...held.keys()]) {
        const entry = held.get(path);
        held.delete(path);
        if (entry !== undefined) await releaseTracked(entry);
      }
      await Promise.all([...releasing]);
    },
    recent: () => seams.recents.list(),
    openRoots: () => [...held.keys()],
    ticketFor: (path) => held.get(path)?.opened.server,
    onServerLost: (listener) => {
      lossListeners.add(listener);
      return () => lossListeners.delete(listener);
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

function lossOf(state: ServeState): ServeFailure | undefined {
  return state.kind === "failed" ? state.failure : undefined;
}
