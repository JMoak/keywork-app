import { contextBridge, ipcRenderer } from "electron";
import { hostChannels, type RelayEnd, type RelayHead } from "../shared/channels.ts";
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

const host = {
  about: () => ipcRenderer.invoke(hostChannels.about),
  pickFolder: () => ipcRenderer.invoke(hostChannels.pickFolder),
  recentWorkspaces: () => ipcRenderer.invoke(hostChannels.recentWorkspaces),
  openWorkspace: (path: string) => ipcRenderer.invoke(hostChannels.openWorkspace, path),
  closeWorkspace: (path: string) => ipcRenderer.invoke(hostChannels.closeWorkspace, path),
  openExternal: (url: string) => ipcRenderer.invoke(hostChannels.openExternal, url),
  notify: (notice: { title: string; body: string }) =>
    ipcRenderer.invoke(hostChannels.notify, notice),
  onServerLost: (listener: (loss: unknown) => void) => {
    const relay = (_event: unknown, loss: unknown): void => listener(loss);
    ipcRenderer.on(hostChannels.serverLost, relay);
    return () => ipcRenderer.removeListener(hostChannels.serverLost, relay);
  },
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
