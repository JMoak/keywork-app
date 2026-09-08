import { join } from "node:path";
import { keyworkClient } from "@keywork-app/client";
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from "electron";
import { hostChannels } from "../shared/channels.ts";
import { freePort, spawnChild } from "./child.ts";
import { recentStore } from "./recents.ts";
import { superviseServer } from "./serve-process.ts";
import {
  bundledBinary,
  fileSeams,
  keyworkOnPath,
  keyworkTicketFile,
  keyworkVersion,
} from "./system.ts";
import { type WorkspaceHost, workspaceHost } from "./workspace.ts";

export function registerHostHandlers(): WorkspaceHost {
  const workspaces = workspaceHost({
    ticketFile: keyworkTicketFile(),
    readText: fileSeams.readText,
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
  ipcMain.handle(hostChannels.openWorkspace, (_event, path: string) => workspaces.open(path));
  ipcMain.handle(hostChannels.closeWorkspace, (_event, path: string) => workspaces.close(path));
  ipcMain.handle(hostChannels.openExternal, (_event, url: string) => openExternal(url));
  ipcMain.handle(hostChannels.notify, (_event, notice: { title: string; body: string }) => {
    if (Notification.isSupported()) new Notification(notice).show();
  });
  workspaces.onServerLost((loss) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(hostChannels.serverLost, loss);
    }
  });
  app.on("before-quit", () => {
    void workspaces.closeAll();
  });
  return workspaces;
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
