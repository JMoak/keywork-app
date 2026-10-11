import { rm } from "node:fs/promises";
import { join } from "node:path";
import { keyworkClient } from "@keywork-app/client";
import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from "electron";
import { hostChannels, type RelayRequest } from "../shared/channels.ts";
import { freePort, spawnChild } from "./child.ts";
import { showToast } from "./native.ts";
import { isNotice, shouldNotify } from "./notify.ts";
import { externalVerdict } from "./open-external.ts";
import { registerPtyHandlers } from "./pty-ipc.ts";
import { recentStore } from "./recents.ts";
import { superviseServer } from "./serve-process.ts";
import { serverRelay } from "./server-relay.ts";
import type { DesktopShell } from "./shell.ts";
import {
  bundledBinary,
  fileSeams,
  keyworkOnPath,
  keyworkTickets,
  keyworkVersion,
} from "./system.ts";
import { probeTicket } from "./ticket.ts";
import {
  chooseBinary,
  type OpenedWorkspace,
  type WorkspaceHost,
  workspaceHost,
} from "./workspace.ts";

export interface HostAbout {
  shell: "electron";
  platform: NodeJS.Platform;
  version: string;
}

export function aboutInfo(): HostAbout {
  return { shell: "electron", platform: process.platform, version: app.getVersion() };
}

export function createWorkspaces(): WorkspaceHost {
  return workspaceHost({
    locateTickets: keyworkTickets,
    readText: fileSeams.readText,
    removeFile: (path) => rm(path, { force: true }),
    probeTicket: (ticket) => probeTicket(ticket, fetch),
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
}

export async function pickFolder(): Promise<string | undefined> {
  const picked = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return picked.canceled ? undefined : picked.filePaths[0];
}

export interface HostHandlers {
  abortRelays(): void;
}

export function registerHostHandlers(
  workspaces: WorkspaceHost,
  desktop: DesktopShell,
  onWorkspaceOpened: () => void,
): HostHandlers {
  const relay = serverRelay({
    ticketFor: (workspace) => workspaces.ticketFor(workspace),
    fetch: (input, init) => fetch(input, init),
  });

  ipcMain.handle(hostChannels.about, () => aboutInfo());
  ipcMain.handle(hostChannels.pickFolder, () => pickFolder());
  ipcMain.handle(hostChannels.recentWorkspaces, () => workspaces.recent());
  ipcMain.handle(hostChannels.openWorkspace, async (event, path: string) => {
    const result = await workspaces.open(path);
    if (!result.ok) return result;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== null) await desktop.bindWindow(window.id, result.opened.workspace);
    onWorkspaceOpened();
    return { ok: true, opened: publicView(result.opened) };
  });
  ipcMain.handle(hostChannels.restartServer, async (_event, path: string) => {
    const result = await workspaces.restart(path);
    return result.ok ? { ok: true, opened: publicView(result.opened) } : result;
  });
  ipcMain.handle(hostChannels.closeWorkspace, async (event, path: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== null && desktop.windows.workspaceOf(window.id) === path) {
      await desktop.unbindWindow(window.id);
    }
  });
  ipcMain.handle(hostChannels.listOpenWorkspaces, () => desktop.windows.list());
  ipcMain.handle(hostChannels.switchWorkspace, (_event, path: string) => desktop.openPath(path));
  ipcMain.handle(hostChannels.setPendingAsks, (event, count: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== null) desktop.windows.setPendingAsks(window.id, count);
  });
  ipcMain.handle(hostChannels.openExternal, (_event, url: string) =>
    openExternal(url, workspaces.openRoots()),
  );
  ipcMain.handle(hostChannels.notify, (event, notice: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window === null || !isNotice(notice)) return false;
    if (!shouldNotify(notice.trigger, window.isFocused())) return false;
    return showToast(notice, () => {
      desktop.focusWindow(window.id);
      window.webContents.send(hostChannels.notificationActivated, notice.trigger);
    });
  });
  ipcMain.handle(hostChannels.serverFetch, (event, request: RelayRequest) =>
    relay.start(request, {
      chunk: (requestId, bytes) =>
        sendUnlessGone(event.sender, hostChannels.serverChunk, requestId, bytes),
      end: (end) => sendUnlessGone(event.sender, hostChannels.serverEnd, end),
    }),
  );
  ipcMain.on(hostChannels.serverAbort, (_event, requestId: number) => relay.abort(requestId));
  workspaces.onServerLost((loss) => desktop.broadcast(hostChannels.serverLost, loss));
  desktop.onOpenWorkspacesChanged((open) =>
    desktop.broadcast(hostChannels.openWorkspacesChanged, open),
  );
  registerPtyHandlers({
    keyworkBinary: () =>
      chooseBinary({
        keyworkOnPath,
        binaryVersion: keyworkVersion,
        bundledBinary: bundledBinary(process.resourcesPath),
      }),
    secretsFor: (workspace) => [workspaces.ticketFor(workspace)?.token ?? ""],
  });
  return { abortRelays: () => relay.abortAll() };
}

function sendUnlessGone(target: WebContents, channel: string, ...payload: unknown[]): void {
  if (!target.isDestroyed()) target.send(channel, ...payload);
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

function openExternal(url: string, workspaceRoots: readonly string[]): Promise<void> {
  const verdict = externalVerdict(url, workspaceRoots);
  if (!verdict.ok) return Promise.reject(new Error(verdict.reason));
  return verdict.path === undefined ? shell.openExternal(verdict.url) : openFile(verdict.path);
}

async function openFile(path: string): Promise<void> {
  const problem = await shell.openPath(path);
  if (problem !== "") throw new Error(`could not open ${path}: ${problem}`);
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
