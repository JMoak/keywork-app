import type { ServerDocument, ServerTicket } from "@keywork-app/client";
import type { RecentStore, RecentWorkspace } from "./recents.ts";
import {
  expectedServerVersion,
  healthCheck,
  type ServeFailure,
  type ServerProcess,
  type ServeSpec,
  type ServeState,
} from "./serve-process.ts";

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
  ticketFile: string;
  readText(path: string): Promise<string | undefined>;
  fetchDocument(ticket: ServerTicket): Promise<ServerDocument>;
  supervise(spec: ServeSpec): ServerProcess;
  keyworkOnPath(): Promise<string | undefined>;
  binaryVersion(binary: string): Promise<string | undefined>;
  bundledBinary: string;
  recents: RecentStore;
}

export interface WorkspaceHost {
  open(path: string): Promise<WorkspaceOpen>;
  close(path: string): Promise<void>;
  closeAll(): Promise<void>;
  recent(): Promise<readonly RecentWorkspace[]>;
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
    const ticket = await readTicket(seams.ticketFile, seams.readText);
    if (ticket === undefined) return undefined;
    const checked = await healthCheck(ticket, seams.fetchDocument);
    if (!checked.ok) return checked.failure.kind === "version-mismatch" ? checked : undefined;
    return {
      ok: true,
      opened: {
        workspace: path,
        server: ticket,
        attached: true,
        version: checked.version,
        binary: undefined,
      },
    };
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

  const hold = (
    path: string,
    opened: OpenedWorkspace,
    process: ServerProcess | undefined,
  ): void => {
    const unwatch =
      process?.watch((state) => {
        const failure = lossOf(state);
        if (failure !== undefined) announceLoss(path, failure);
      }) ?? (() => undefined);
    held.set(path, { opened, process, unwatch });
  };

  return {
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
    close: async (path) => {
      const entry = held.get(path);
      if (entry === undefined) return;
      held.delete(path);
      entry.unwatch();
      await entry.process?.stop();
    },
    closeAll: async () => {
      for (const path of [...held.keys()]) {
        const entry = held.get(path);
        held.delete(path);
        entry?.unwatch();
        await entry?.process?.stop();
      }
    },
    recent: () => seams.recents.list(),
    onServerLost: (listener) => {
      lossListeners.add(listener);
      return () => lossListeners.delete(listener);
    },
  };
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

function lossOf(state: ServeState): ServeFailure | undefined {
  return state.kind === "failed" ? state.failure : undefined;
}
