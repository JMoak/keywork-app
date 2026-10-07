import { contextBridge, ipcRenderer } from "electron";
import {
  hostChannels,
  type PtyExit,
  type PtyOpened,
  ptyChannels,
  type RelayEnd,
  type RelayHead,
} from "../shared/channels.ts";
import { type ChunkQueue, chunkQueue } from "../shared/chunk-queue.ts";

const streams = new Map<number, ChunkQueue>();
let nextRequestId = 1;

ipcRenderer.on(hostChannels.serverChunk, (_event, requestId: number, bytes: Uint8Array) => {
  streams.get(requestId)?.push(bytes);
});
ipcRenderer.on(hostChannels.serverEnd, (_event, end: RelayEnd) => {
  streams.get(end.requestId)?.end(end.error);
  streams.delete(end.requestId);
});

const ptyStreams = new Map<number, ChunkQueue>();
const ptyExits = new Map<number, PtyExit>();
const ptyExitListeners = new Map<number, Set<(exit: PtyExit) => void>>();

function ptyStream(id: number): ChunkQueue {
  const existing = ptyStreams.get(id);
  if (existing !== undefined) return existing;
  const created = chunkQueue();
  ptyStreams.set(id, created);
  return created;
}

ipcRenderer.on(ptyChannels.data, (_event, id: number, bytes: Uint8Array) => {
  ptyStream(id).push(bytes);
});
ipcRenderer.on(ptyChannels.exit, (_event, exit: PtyExit) => {
  ptyStream(exit.id).end();
  ptyExits.set(exit.id, exit);
  for (const listener of ptyExitListeners.get(exit.id) ?? []) listener(exit);
});

const pty = {
  open: (request: unknown) => ipcRenderer.invoke(ptyChannels.open, request) as Promise<PtyOpened>,
  write: (id: number, data: string) => ipcRenderer.send(ptyChannels.write, id, data),
  resize: (id: number, cols: number, rows: number) =>
    ipcRenderer.send(ptyChannels.resize, id, cols, rows),
  close: (id: number) => {
    ipcRenderer.send(ptyChannels.close, id);
    ptyStreams.get(id)?.end();
  },
  onData: (id: number, listener: (bytes: Uint8Array) => void) => {
    let live = true;
    const pump = async (): Promise<void> => {
      const queue = ptyStream(id);
      while (live) {
        const bytes = await queue.read().catch(() => undefined);
        if (bytes === undefined) break;
        if (live) listener(bytes);
      }
      ptyStreams.delete(id);
    };
    void pump();
    return () => {
      live = false;
    };
  },
  onExit: (id: number, listener: (exit: PtyExit) => void) => {
    const known = ptyExits.get(id);
    if (known !== undefined) {
      listener(known);
      return () => {};
    }
    const listeners = ptyExitListeners.get(id) ?? new Set();
    listeners.add(listener);
    ptyExitListeners.set(id, listeners);
    return () => {
      listeners.delete(listener);
    };
  },
};

function subscribe<Payload>(channel: string): (listener: (payload: Payload) => void) => () => void {
  return (listener) => {
    const relay = (_event: unknown, payload: Payload): void => listener(payload);
    ipcRenderer.on(channel, relay);
    return () => ipcRenderer.removeListener(channel, relay);
  };
}

const host = {
  about: () => ipcRenderer.invoke(hostChannels.about),
  pickFolder: () => ipcRenderer.invoke(hostChannels.pickFolder),
  recentWorkspaces: () => ipcRenderer.invoke(hostChannels.recentWorkspaces),
  openWorkspace: (path: string) => ipcRenderer.invoke(hostChannels.openWorkspace, path),
  restartServer: (path: string) => ipcRenderer.invoke(hostChannels.restartServer, path),
  closeWorkspace: (path: string) => ipcRenderer.invoke(hostChannels.closeWorkspace, path),
  listOpenWorkspaces: () => ipcRenderer.invoke(hostChannels.listOpenWorkspaces),
  switchWorkspace: (path: string) => ipcRenderer.invoke(hostChannels.switchWorkspace, path),
  onOpenWorkspacesChanged: subscribe(hostChannels.openWorkspacesChanged),
  onOpenRequested: subscribe<string>(hostChannels.openRequested),
  openExternal: (url: string) => ipcRenderer.invoke(hostChannels.openExternal, url),
  notify: (notice: unknown) => ipcRenderer.invoke(hostChannels.notify, notice),
  onNotificationActivated: subscribe(hostChannels.notificationActivated),
  setPendingAsks: (count: number) => ipcRenderer.invoke(hostChannels.setPendingAsks, count),
  onServerLost: subscribe(hostChannels.serverLost),
  pty,
  onUpdateReady: subscribe(hostChannels.updateReady),
  acceptUpdate: () => ipcRenderer.invoke(hostChannels.acceptUpdate),
  serverFetch: async (
    workspace: string,
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string },
  ) => {
    const requestId = nextRequestId++;
    const queue = chunkQueue();
    streams.set(requestId, queue);
    const head = (await ipcRenderer.invoke(hostChannels.serverFetch, {
      requestId,
      workspace,
      path,
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body,
    })) as RelayHead;
    return {
      ...head,
      read: () => queue.read(),
      cancel: () => {
        ipcRenderer.send(hostChannels.serverAbort, requestId);
        queue.end("cancelled");
        streams.delete(requestId);
      },
    };
  },
};

contextBridge.exposeInMainWorld("keyworkHost", host);
