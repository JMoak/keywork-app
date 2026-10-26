import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { keyworkClient } from "@keywork-app/client";
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type WebContents } from "electron";
import {
  type EditorOpened,
  hostChannels,
  type KeybindingsWatch,
  type RelayRequest,
} from "../shared/channels.ts";
import { freePort, spawnChild } from "./child.ts";
import { type EditorSeams, openInEditor, startDetached } from "./editor.ts";
import { followKeybindingFiles, keybindingFileSeams, keybindingFilesFor } from "./keybindings.ts";
import { showToast } from "./native.ts";
import { isNotice, shouldNotify } from "./notify.ts";
import { editorVerdict, externalVerdict } from "./open-external.ts";
import { registerPtyHandlers } from "./pty-ipc.ts";
import { recentStore } from "./recents.ts";
import { saveAs } from "./save-as.ts";
import { type ServeFailure, superviseServer } from "./serve-process.ts";
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
  type WorkspaceClock,
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
        giveUpAfter: sleep,
      }),
    keyworkOnPath: () => keyworkOnPath(),
    binaryVersion: keyworkVersion,
    bundledBinary: bundledBinary(process.resourcesPath),
    recents: recentStore(join(app.getPath("userData"), "recents.json"), fileSeams),
    clock: wallClock,
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
    suspect: (workspace) => workspaces.suspect(workspace),
  });

  ipcMain.handle(hostChannels.about, () => aboutInfo());
  ipcMain.handle(hostChannels.pickFolder, () => pickFolder());
  ipcMain.handle(hostChannels.recentWorkspaces, () => workspaces.recent());
  ipcMain.handle(hostChannels.openWorkspace, async (event, path: string) => {
    const result = await workspaces.open(path);
    if (!result.ok) return { ok: false, failure: publicFailure(result.failure) };
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== null) await desktop.bindWindow(window.id, result.opened.workspace);
    onWorkspaceOpened();
    return { ok: true, opened: publicView(result.opened) };
  });
  ipcMain.handle(hostChannels.restartServer, async (_event, path: string) => {
    const result = await workspaces.restart(path);
    return result.ok
      ? { ok: true, opened: publicView(result.opened) }
      : { ok: false, failure: publicFailure(result.failure) };
  });
  ipcMain.handle(hostChannels.closeWorkspace, async (event, path: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== null && desktop.windows.workspaceOf(window.id) === path) {
      await desktop.unbindWindow(window.id);
    }
  });
  ipcMain.handle(hostChannels.listOpenWorkspaces, () => desktop.windows.list());
  ipcMain.handle(hostChannels.switchWorkspace, (_event, path: string) => desktop.openPath(path));
  ipcMain.handle(hostChannels.setNeedsYou, (event, count: number) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window !== null) desktop.windows.setNeedsYou(window.id, count);
  });
  const openableRoots = (): readonly string[] => [...workspaces.openRoots(), userMemoryVault];
  ipcMain.handle(hostChannels.openExternal, (_event, url: string) =>
    openExternal(url, openableRoots()),
  );
  ipcMain.handle(hostChannels.openInEditor, (_event, request: unknown) =>
    openInEditorAt(request, openableRoots()),
  );
  ipcMain.handle(hostChannels.writeClipboard, (_event, text: unknown) => {
    if (typeof text === "string") clipboard.writeText(text);
  });
  registerKeybindingWatches((workspace) => workspaces.openRoots().includes(workspace));
  ipcMain.handle(hostChannels.notify, (event, notice: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window === null || !isNotice(notice)) return false;
    if (!shouldNotify(notice.trigger, window.isFocused())) return false;
    return showToast(notice, () => {
      desktop.focusWindow(window.id);
      window.webContents.send(hostChannels.notificationActivated, notice.trigger);
    });
  });
  ipcMain.handle(hostChannels.saveAs, (event, request: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return saveAs(request, {
      folder: app.getPath("downloads"),
      choosePath: (defaultPath) => chooseSavePath(window, defaultPath),
      writeText: (path, text) => writeFile(path, text, "utf8"),
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
  workspaces.onServerLost((loss) =>
    desktop.broadcast(hostChannels.serverLost, { ...loss, failure: publicFailure(loss.failure) }),
  );
  workspaces.onServerRegained(({ workspace, opened }) =>
    desktop.broadcast(hostChannels.serverRegained, { workspace, opened: publicView(opened) }),
  );
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

async function chooseSavePath(
  window: BrowserWindow | null,
  defaultPath: string,
): Promise<string | undefined> {
  const options = { defaultPath, filters: [{ name: "Web page", extensions: ["html"] }] };
  const chosen =
    window === null
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(window, options);
  return chosen.canceled ? undefined : chosen.filePath;
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

function publicFailure(failure: ServeFailure): PublicFailure {
  switch (failure.kind) {
    case "unreachable":
      return { kind: "unreachable", ticket: { url: failure.ticket.url }, detail: failure.detail };
    case "version-mismatch":
      return { kind: "version-mismatch", expected: failure.expected, actual: failure.actual };
    default:
      return failure;
  }
}

type PublicFailure =
  | Exclude<ServeFailure, { kind: "unreachable" | "version-mismatch" }>
  | { kind: "unreachable"; ticket: { url: string }; detail: string }
  | { kind: "version-mismatch"; expected: string; actual: string };

const userMemoryVault = join(homedir(), ".keywork", "memory");

async function openExternal(url: string, openableRoots: readonly string[]): Promise<void> {
  const verdict = externalVerdict(url, openableRoots);
  if (!verdict.ok) throw new Error(verdict.reason);
  if (verdict.path === undefined) return shell.openExternal(verdict.url);
  await openInEditor({ path: verdict.path, line: verdict.line }, editorSeams);
}

function openInEditorAt(request: unknown, openableRoots: readonly string[]): Promise<EditorOpened> {
  const verdict = editorVerdict(request, openableRoots);
  if (!verdict.ok) return Promise.reject(new Error(verdict.reason));
  return openInEditor({ path: verdict.path, line: verdict.line }, editorSeams);
}

const editorSeams: EditorSeams = {
  env: process.env,
  platform: process.platform,
  exists: existsSync,
  start: startDetached,
  reveal: (path) => shell.showItemInFolder(path),
};

function registerKeybindingWatches(isOpen: (workspace: string) => boolean): void {
  const watches = new Map<string, () => void>();
  const stop = (key: string): void => {
    watches.get(key)?.();
    watches.delete(key);
  };
  ipcMain.on(hostChannels.watchKeybindings, (event, request: unknown) => {
    if (!isKeybindingsWatch(request)) return;
    const key = `${event.sender.id}:${request.id}`;
    stop(key);
    const project = trustedProjectOf(request, isOpen);
    const deliver = (reading: unknown): void =>
      sendUnlessGone(event.sender, hostChannels.keybindingsRead, request.id, reading);
    watches.set(
      key,
      followKeybindingFiles(keybindingFilesFor(project), keybindingFileSeams, deliver),
    );
    event.sender.once("destroyed", () => stop(key));
  });
  ipcMain.on(hostChannels.unwatchKeybindings, (event, id: unknown) => {
    if (typeof id === "number") stop(`${event.sender.id}:${id}`);
  });
}

function trustedProjectOf(
  request: KeybindingsWatch,
  isOpen: (workspace: string) => boolean,
): string | undefined {
  const workspace = request.workspace;
  if (!request.projectTrusted || workspace === undefined) return undefined;
  return isOpen(workspace) ? workspace : undefined;
}

function isKeybindingsWatch(request: unknown): request is KeybindingsWatch {
  if (typeof request !== "object" || request === null) return false;
  const { id, workspace, projectTrusted } = request as Partial<Record<string, unknown>>;
  return (
    typeof id === "number" &&
    (workspace === undefined || typeof workspace === "string") &&
    typeof projectTrusted === "boolean"
  );
}

const wallClock: WorkspaceClock = {
  every: (ms, beat) => {
    let beating = false;
    const timer = setInterval(() => {
      if (beating) return;
      beating = true;
      void beat().finally(() => {
        beating = false;
      });
    }, ms);
    return () => clearInterval(timer);
  },
  wait: (ms) => sleep(ms),
};

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
