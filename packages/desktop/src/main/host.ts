import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { keyworkClient, type ServerTicket } from "@keywork-app/client";
import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
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
import { type SidecarRun, sidecarNodeServing } from "./node-consent.ts";
import { answerTheNodeRefusal, retrySharedRuntime } from "./node-consent-electron.ts";
import { isNotice, shouldNotify } from "./notify.ts";
import { editorVerdict, externalVerdict } from "./open-external.ts";
import { registerPtyHandlers } from "./pty-ipc.ts";
import { recentStore } from "./recents.ts";
import { saveAs } from "./save-as.ts";
import { type ServeFailure, superviseServer } from "./serve-process.ts";
import { type ServerRelay, serverRelay } from "./server-relay.ts";
import type { DesktopShell } from "./shell.ts";
import {
  appRepoRoot,
  bundledBinary,
  fileSeams,
  keyworkOnPath,
  keyworkTickets,
  siblingCheckout,
  siblingKeyworkRepo,
} from "./system.ts";
import { probeTicket } from "./ticket.ts";
import {
  chooseEngine,
  contractRefusal,
  type EngineLaunch,
  type EngineSeams,
  launchableEngine,
  type NodeServing,
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

export function createWorkspaces(profile: ProductProfile = keyworkProfile): WorkspaceHost {
  const fetchDocument = (ticket: ServerTicket) => keyworkClient(ticket).document();
  return workspaceHost({
    profile,
    homePath: managedHomePath,
    locateTickets: keyworkTickets,
    readText: fileSeams.readText,
    removeFile: (path) => rm(path, { force: true }),
    probeTicket: (ticket) => probeTicket(ticket, fetch),
    fetchDocument,
    supervise: (spec) =>
      superviseServer(spec, {
        spawn: spawnChild,
        delay: sleep,
        freePort,
        fetchDocument,
        platform: process.platform,
        giveUpAfter: sleep,
      }),
    engine: announcedEngine,
    recents: recentStore(join(app.getPath("userData"), "recents.json"), fileSeams),
    clock: wallClock,
    node: app.isPackaged ? theNode(profile) : undefined,
  });
}

export const nodeVerbPatienceMs = 30_000;

function theNode(profile: ProductProfile): NodeServing {
  return sidecarNodeServing({
    sidecar: bundledBinary(process.resourcesPath),
    run: runSidecarVerb,
    consolePid: process.pid,
    profile,
  });
}

async function runSidecarVerb(
  binary: string,
  args: readonly string[],
  cwd: string = homedir(),
): Promise<SidecarRun> {
  const child = spawnChild(binary, args, cwd);
  const patience = new AbortController();
  const gaveUp = sleep(nodeVerbPatienceMs, patience.signal).then(() => {
    if (!patience.signal.aborted) child.signal("SIGKILL");
    return null;
  });
  const [code, stdout, stderr] = await Promise.all([
    Promise.race([child.exited, gaveUp]),
    collected(child.stdout),
    collected(child.stderr),
  ]);
  patience.abort();
  return { code, output: code === 0 || stderr.trim() === "" ? stdout : stderr };
}

async function collected(chunks: AsyncIterable<string>): Promise<string> {
  let text = "";
  for await (const chunk of chunks) text += chunk;
  return text;
}

export function engineSeams(): EngineSeams {
  return {
    packaged: app.isPackaged,
    bundledBinary: bundledBinary(process.resourcesPath),
    keyworkBin: process.env.KEYWORK_BIN,
    siblingCheckout: () => siblingCheckout(siblingKeyworkRepo(appRepoRoot(app.getAppPath()))),
    keyworkOnPath: () => keyworkOnPath(),
  };
}

async function announcedEngine(): Promise<EngineLaunch> {
  const engine = await chooseEngine(engineSeams());
  console.info(`engine: ${engine.origin} · ${engine.from}`);
  return engine;
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
  profile: ProductProfile = keyworkProfile,
): HostHandlers {
  const homeReaders = new Set<number>();
  const relays = new Map<number, ServerRelay>();
  const relayFor = (sender: WebContents): ServerRelay => {
    const present = relays.get(sender.id);
    if (present !== undefined) return present;
    const relay = serverRelay({
      ticketFor: (workspace) => {
        const window = BrowserWindow.fromWebContents(sender);
        const project = window !== null && desktop.windows.workspaceOf(window.id) === workspace;
        const home = workspace === managedHomePath && homeReaders.has(sender.id);
        return project || home ? workspaces.ticketFor(workspace) : undefined;
      },
      fetch: (input, init) => fetch(input, init),
      suspect: (workspace) => workspaces.suspect(workspace),
    });
    relays.set(sender.id, relay);
    sender.once("destroyed", () => {
      relay.abortAll();
      relays.delete(sender.id);
      homeReaders.delete(sender.id);
    });
    return relay;
  };

  ipcMain.handle(hostChannels.about, () => aboutInfo());
  ipcMain.handle(hostChannels.pickFolder, () => pickFolder());
  ipcMain.handle(hostChannels.recentWorkspaces, () => workspaces.recent());
  ipcMain.handle(hostChannels.enableRuntime, async (event) => {
    if (!app.isPackaged) return;
    const result = await retrySharedRuntime(profile, BrowserWindow.fromWebContents(event.sender));
    if (result.kind === "failed") throw new Error(result.detail);
  });
  ipcMain.handle(hostChannels.openHome, async (event) => {
    if (workspaces.openHome === undefined) {
      return {
        ok: false,
        failure: {
          kind: "unresolved",
          message: "the shared creature home is unavailable",
          nextAction: "update the app and its runtime together",
        },
      };
    }
    const result = await workspaces.openHome();
    if (!result.ok) return { ok: false, failure: publicFailure(result.failure, profile) };
    homeReaders.add(event.sender.id);
    relayFor(event.sender);
    return { ok: true, opened: publicView(result.opened) };
  });
  ipcMain.handle(hostChannels.openWorkspace, async (event, path: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await workspaces.open(path);
    if (!result.ok) {
      return {
        ok: false,
        failure: publicFailure(await withNodeAnswered(result.failure, window, profile), profile),
      };
    }
    if (window !== null) await desktop.bindWindow(window.id, result.opened.workspace);
    onWorkspaceOpened();
    return { ok: true, opened: publicView(result.opened) };
  });
  ipcMain.handle(hostChannels.restartServer, async (_event, path: string) => {
    const result = await workspaces.restart(path);
    return result.ok
      ? { ok: true, opened: publicView(result.opened) }
      : { ok: false, failure: publicFailure(result.failure, profile) };
  });
  ipcMain.handle(hostChannels.servingOf, (_event, path: string) => workspaces.servingOf(path));
  ipcMain.handle(hostChannels.stopServing, async (_event, path: string) => {
    const result = await workspaces.stopServing(path);
    if (result.ok) onWorkspaceOpened();
    return result.ok
      ? { ok: true, opened: publicView(result.opened) }
      : { ok: false, failure: publicFailure(result.failure, profile) };
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
    relayFor(event.sender).start(request, {
      chunk: (requestId, bytes) =>
        sendUnlessGone(event.sender, hostChannels.serverChunk, requestId, bytes),
      end: (end) => sendUnlessGone(event.sender, hostChannels.serverEnd, end),
    }),
  );
  ipcMain.on(hostChannels.serverAbort, (event, requestId: number) =>
    relays.get(event.sender.id)?.abort(requestId),
  );
  workspaces.onServerLost((loss) =>
    desktop.broadcast(hostChannels.serverLost, {
      ...loss,
      failure: publicFailure(loss.failure, profile),
    }),
  );
  workspaces.onServerRegained(({ workspace, opened }) =>
    desktop.broadcast(hostChannels.serverRegained, { workspace, opened: publicView(opened) }),
  );
  desktop.onOpenWorkspacesChanged((open) =>
    desktop.broadcast(hostChannels.openWorkspacesChanged, open),
  );
  registerPtyHandlers({
    keyworkBinary: () => launchableEngine(engineSeams()),
    secretsFor: (workspace) => [workspaces.ticketFor(workspace)?.token ?? ""],
  });
  return {
    abortRelays: () => {
      for (const relay of relays.values()) relay.abortAll();
    },
  };
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

async function withNodeAnswered(
  failure: ServeFailure,
  window: BrowserWindow | null,
  profile: ProductProfile,
): Promise<ServeFailure> {
  if (!app.isPackaged || failure.kind !== "contract-mismatch") return failure;
  return answerTheNodeRefusal(window, failure, profile);
}

function publicView(opened: OpenedWorkspace) {
  return {
    workspace: opened.workspace,
    serverLabel: opened.server.url.replace(/^https?:\/\//, ""),
    attached: opened.attached,
    version: opened.version,
    binary: opened.binary,
    servedBy: opened.servedByNode === true ? "node" : "console",
  };
}

function publicFailure(failure: ServeFailure, profile: ProductProfile): PublicFailure {
  switch (failure.kind) {
    case "unreachable":
      return { kind: "unreachable", ticket: { url: failure.ticket.url }, detail: failure.detail };
    case "version-mismatch":
      return { kind: "version-mismatch", expected: failure.expected, actual: failure.actual };
    case "contract-mismatch":
      return { kind: "unresolved", ...contractRefusal(failure, profile) };
    default:
      return failure;
  }
}

type PublicFailure =
  | Exclude<ServeFailure, { kind: "unreachable" | "version-mismatch" | "contract-mismatch" }>
  | { kind: "unreachable"; ticket: { url: string }; detail: string }
  | { kind: "version-mismatch"; expected: string; actual: string };

const userMemoryVault = join(homedir(), ".keywork", "memory");
const managedHomePath = join(homedir(), ".keywork", "home");

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
