import { rm } from "node:fs/promises";
import { join } from "node:path";
import { keyworkClient } from "@keywork-app/client";
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from "electron";
import { hostChannels, type RelayRequest } from "../shared/channels.ts";
import { freePort, spawnChild } from "./child.ts";
import { recentStore } from "./recents.ts";
import { superviseServer } from "./serve-process.ts";
import { serverRelay } from "./server-relay.ts";
import {
  bundledBinary,
  fileSeams,
  keyworkOnPath,
  keyworkTicketFile,
  keyworkVersion,
} from "./system.ts";
import { type OpenedWorkspace, type WorkspaceHost, workspaceHost } from "./workspace.ts";

export function registerHostHandlers(): WorkspaceHost {
  const workspaces = workspaceHost({
    ticketFile: keyworkTicketFile(),
    readText: fileSeams.readText,
    removeFile: (path) => rm(path, { force: true }),
    fetchDocument: (ticket) => keyworkClient(ticket).document(),
    supervise: (spec) =>
      superviseServer(spec, {
        spawn: spawnChild,
        delay: sleep,
        freePort,
        fetchDocument: (ticket) => keyworkClient(ticket).document(),
        platform: process.platform,
      }),
    keyworkOnPath: () => keyworkOnPath(),
    binaryVersion: keyworkVersion,
    bundledBinary: bundledBinary(process.resourcesPath),
    recents: recentStore(join(app.getPath("userData"), "recents.json"), fileSeams),
  });
  const relay = serverRelay({
    ticketFor: (workspace) => workspaces.ticketFor(workspace),
    fetch: (input, init) => fetch(input, init),
  });

  ipcMain.handle(hostChannels.about, () => ({
    shell: "electron",
    platform: process.platform,
    version: app.getVersion(),
  }));
  ipcMain.handle(hostChannels.pickFolder, async () => {
    const picked = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return picked.canceled ? undefined : picked.filePaths[0];
  });
  ipcMain.handle(hostChannels.recentWorkspaces, () => workspaces.recent());
  ipcMain.handle(hostChannels.openWorkspace, async (_event, path: string) => {
    const result = await workspaces.open(path);
    return result.ok ? { ok: true, opened: publicView(result.opened) } : result;
  });
  ipcMain.handle(hostChannels.closeWorkspace, (_event, path: string) => workspaces.close(path));
  ipcMain.handle(hostChannels.openExternal, (_event, url: string) => openExternal(url));
  ipcMain.handle(hostChannels.notify, (_event, notice: { title: string; body: string }) => {
    if (Notification.isSupported()) new Notification(notice).show();
  });
  ipcMain.handle(hostChannels.serverFetch, (event, request: RelayRequest) =>
    relay.start(request, {
      chunk: (requestId, bytes) => event.sender.send(hostChannels.serverChunk, requestId, bytes),
      end: (end) => event.sender.send(hostChannels.serverEnd, end),
    }),
  );
  ipcMain.on(hostChannels.serverAbort, (_event, requestId: number) => relay.abort(requestId));
  workspaces.onServerLost((loss) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(hostChannels.serverLost, loss);
    }
  });
  let serversStopped = false;
  app.on("before-quit", (event) => {
    if (serversStopped) return;
    event.preventDefault();
    relay.abortAll();
    void workspaces.closeAll().finally(() => {
      serversStopped = true;
      app.quit();
    });
  });
  return workspaces;
}

function publicView(opened: OpenedWorkspace) {
  return {
    workspace: opened.workspace,
    serverLabel: opened.server.url.replace(/^https?:\/\//, ""),
    attached: opened.attached,
    version: opened.version,
    binary: opened.binary,
  };
}

function openExternal(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return Promise.reject(new Error(`refusing to open ${parsed.protocol} links`));
  }
  return shell.openExternal(url);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
  });
}
