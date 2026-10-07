import { join, resolve } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { type OpenRequest, protocolScheme, requestFromArgv, requestFromUrl } from "./deep-link.ts";
import { aboutInfo, createWorkspaces, pickFolder, registerHostHandlers } from "./host.ts";
import { type Chords, type MenuAction, menuModel } from "./menu.ts";
import { installApplicationMenu, trayMark } from "./native.ts";
import { type DesktopShell, desktopShell } from "./shell.ts";
import { fileSeams } from "./system.ts";
import { trayModel } from "./tray.ts";
import { startUpdater } from "./updater-electron.ts";
import { windowStateBook } from "./window-state.ts";
import { quitGate } from "./windows.ts";

const nativeChords: Chords = {
  "open-folder": "CmdOrCtrl+O",
  "close-window": "CmdOrCtrl+Shift+W",
  reload: "CmdOrCtrl+R",
  "toggle-devtools": "CmdOrCtrl+Shift+I",
};

const launcherArguments = process.defaultApp ? 2 : 1;

if (app.requestSingleInstanceLock()) launch();
else app.quit();

function launch(): void {
  registerProtocolClient();
  const queued: OpenRequest[] = [];
  let deliver = (request: OpenRequest): void => {
    queued.push(request);
  };
  app.on("open-url", (event, url) => {
    event.preventDefault();
    deliver(requestFromUrl(url));
  });
  app.on("second-instance", (_event, argv) => {
    const request = requestFromArgv(argv, launcherArguments);
    if (request !== undefined) deliver(request);
  });

  app.whenReady().then(async () => {
    startUpdater();
    const workspaces = createWorkspaces();
    const desktop = desktopShell({
      workspaces,
      states: windowStateBook(join(app.getPath("userData"), "windows.json"), fileSeams),
      platform: process.platform,
    });
    const dev = !app.isPackaged;
    const tray = trayMark(process.platform);

    const act = (action: MenuAction, payload?: string): void => {
      void perform(action, payload, desktop);
    };
    const refreshMenu = async (): Promise<void> => {
      const recents = (await workspaces.recent()).map((entry) => entry.path);
      installApplicationMenu(
        menuModel({ platform: process.platform, dev, recents, chords: nativeChords }),
        act,
      );
    };
    const refreshTray = (): void => {
      tray.update(trayModel(desktop.windows.list()), act, () => desktop.focusMostRecent());
    };
    const route = (request: OpenRequest): void => {
      if (request.ok) void desktop.openPath(request.path);
      else console.warn(`refused ${request.reason}: ${request.input}`);
    };

    const host = registerHostHandlers(workspaces, desktop, () => void refreshMenu());
    desktop.onOpenWorkspacesChanged(refreshTray);
    await refreshMenu();
    refreshTray();

    const gate = quitGate(() => {
      host.abortRelays();
      tray.destroy();
      return workspaces.closeAll();
    });
    app.on("before-quit", (event) => gate(event, () => app.quit()));
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void desktop.openWindow();
    });

    const first = requestFromArgv(process.argv, launcherArguments);
    await desktop.openWindow(first?.ok ? first.path : undefined);
    if (first !== undefined && !first.ok) route(first);
    deliver = route;
    for (const request of queued) route(request);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function registerProtocolClient(): void {
  if (process.defaultApp && process.argv[1] !== undefined) {
    app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(protocolScheme);
  }
}

async function perform(action: MenuAction, payload: string | undefined, desktop: DesktopShell) {
  const focused = BrowserWindow.getFocusedWindow();
  switch (action) {
    case "open-folder": {
      const path = await pickFolder();
      if (path !== undefined) await desktop.openPath(path);
      return;
    }
    case "open-recent":
      if (payload !== undefined) await desktop.openPath(payload);
      return;
    case "close-window":
      focused?.close();
      return;
    case "reload":
      focused?.webContents.reload();
      return;
    case "toggle-devtools":
      focused?.webContents.toggleDevTools();
      return;
    case "about": {
      const about = aboutInfo();
      await dialog.showMessageBox({
        title: "About keywork-app",
        message: "keywork-app",
        detail: `version ${about.version} · ${about.shell} on ${about.platform}`,
      });
      return;
    }
    case "quit":
      app.quit();
  }
}
