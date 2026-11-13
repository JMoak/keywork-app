import { join } from "node:path";
import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { BrowserWindow, screen } from "electron";
import { hostChannels } from "../shared/channels.ts";
import { appPageArgument } from "./app-page.ts";
import { markImage } from "./native.ts";
import { windowTitle } from "./product.ts";
import { trayModel } from "./tray.ts";
import {
  positionOn,
  type WindowState,
  type WindowStateBook,
  windowStateKey,
} from "./window-state.ts";
import { type OpenWorkspace, type WindowRegistry, windowRegistry } from "./windows.ts";
import type { WorkspaceHost } from "./workspace.ts";

export interface DesktopShell {
  readonly windows: WindowRegistry;
  openWindow(workspace?: string): Promise<BrowserWindow>;
  openPath(path: string): Promise<void>;
  bindWindow(windowId: number, workspace: string): Promise<void>;
  unbindWindow(windowId: number): Promise<void>;
  focusWindow(windowId: number): void;
  showConsole(): void;
  leave(): Promise<void>;
  broadcast(channel: string, payload: unknown): void;
  onOpenWorkspacesChanged(listener: (open: readonly OpenWorkspace[]) => void): () => void;
}

export interface ShellSeams {
  profile?: ProductProfile;
  workspaces: WorkspaceHost;
  states: WindowStateBook;
  platform: NodeJS.Platform;
  onLastWindowClosing?: (() => void) | undefined;
}

export function desktopShell(seams: ShellSeams): DesktopShell {
  const windows = windowRegistry();
  const consoleWindows = new Set<number>();
  const { workspaces, states, profile = keyworkProfile } = seams;
  let leaving = false;

  const remember = (window: BrowserWindow): Promise<void> =>
    states
      .write(windowStateKey(windows.workspaceOf(window.id), seams.platform), stateOf(window))
      .catch(() => undefined);

  const closesTheLastWindow = (windowId: number): boolean =>
    consoleWindows.size === 1 && consoleWindows.has(windowId);

  const releaseIfLast = async (
    release: { workspace: string; lastWindow: boolean } | undefined,
  ): Promise<void> => {
    if (release?.lastWindow) await workspaces.close(release.workspace);
  };

  const requestOpen = (window: BrowserWindow, path: string, afterLoad: boolean): void => {
    const send = (): void => window.webContents.send(hostChannels.openRequested, path);
    if (afterLoad || window.webContents.isLoading()) {
      window.webContents.once("did-finish-load", send);
    } else send();
  };

  const focusWindow = (windowId: number): void => {
    const window = BrowserWindow.fromId(windowId);
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };

  const titleFor = (windowId: number): string => {
    const workspace = windows.workspaceOf(windowId);
    const open = windows.list().find((entry) => entry.workspace === workspace);
    return windowTitle(open?.needsYou ?? 0, profile, workspace);
  };

  const openWindow = async (workspace?: string): Promise<BrowserWindow> => {
    const key = windowStateKey(workspace, seams.platform);
    const remembered = await states.read(key);
    const window = createWindow(remembered, profile);
    windows.add(window.id, workspace);
    consoleWindows.add(window.id);
    window.on("page-title-updated", (event) => {
      event.preventDefault();
      window.setTitle(titleFor(window.id));
    });
    window.on("focus", () => windows.focused(window.id));
    window.on("close", (event) => {
      if (leaving) return;
      if (seams.onLastWindowClosing !== undefined && closesTheLastWindow(window.id)) {
        event.preventDefault();
        seams.onLastWindowClosing();
        return;
      }
      void remember(window);
    });
    window.on("closed", () => {
      consoleWindows.delete(window.id);
      void releaseIfLast(windows.remove(window.id));
    });
    window.once("ready-to-show", () => {
      if (remembered.maximized) window.maximize();
      window.show();
    });
    if (workspace !== undefined) requestOpen(window, workspace, true);
    await loadRenderer(window);
    return window;
  };

  const refreshOverlays = (): void => {
    if (seams.platform !== "win32") return;
    const badge = trayModel(windows.list(), [], profile).badge;
    for (const window of BrowserWindow.getAllWindows()) {
      window.setOverlayIcon(badge === undefined ? null : markImage("win32", true), badge ?? "");
    }
  };
  windows.onChange(refreshOverlays);

  const retitle = (): void => {
    for (const windowId of consoleWindows)
      BrowserWindow.fromId(windowId)?.setTitle(titleFor(windowId));
  };
  windows.onChange(retitle);

  return {
    windows,
    openWindow,
    openPath: async (path) => {
      const placement = windows.placeFor(path);
      switch (placement.kind) {
        case "focus":
          return focusWindow(placement.windowId);
        case "reuse": {
          const window = BrowserWindow.fromId(placement.windowId);
          if (window === null) return;
          requestOpen(window, path, false);
          return focusWindow(placement.windowId);
        }
        case "new":
          await openWindow(path);
      }
    },
    bindWindow: async (windowId, workspace) => {
      const prior = windows.unbind(windowId);
      windows.bind(windowId, workspace);
      if (prior?.workspace !== workspace) await releaseIfLast(prior);
    },
    unbindWindow: (windowId) => releaseIfLast(windows.unbind(windowId)),
    focusWindow,
    showConsole: () => {
      if (leaving) return;
      const recent = windows.mostRecentlyActive();
      if (recent !== undefined) focusWindow(recent);
      else void openWindow();
    },
    leave: async () => {
      leaving = true;
      const open = [...consoleWindows].flatMap((id) => BrowserWindow.fromId(id) ?? []);
      await Promise.all(open.map(remember));
    },
    broadcast: (channel, payload) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, payload);
    },
    onOpenWorkspacesChanged: (listener) => windows.onChange(() => listener(windows.list())),
  };
}

function createWindow(remembered: WindowState, profile: ProductProfile): BrowserWindow {
  const displays = screen.getAllDisplays().map((display) => display.bounds);
  return new BrowserWindow({
    width: remembered.width,
    height: remembered.height,
    ...positionOn(remembered, displays),
    show: false,
    autoHideMenuBar: true,
    title: windowTitle(0, profile),
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.js"),
      additionalArguments: [`--keywork-product=${profile.id}`, appPageArgument()],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) await window.loadURL(devServer);
  else await window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
}

function stateOf(window: BrowserWindow): WindowState {
  const bounds = window.getNormalBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: window.isMaximized(),
  };
}
