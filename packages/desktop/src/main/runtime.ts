import type { ProductProfile } from "@keywork-app/product";

export {
  keyworkProfile,
  type ProductId,
  type ProductProfile,
  productProfiles,
  steadProfile,
} from "@keywork-app/product";

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { type ConsoleClient, keyworkClient } from "@keywork-app/client";
import { keyworkNight } from "@keywork-app/ui/theme";
import { app, BrowserWindow, dialog, protocol } from "electron";
import { startElectronCompanion, startForegroundFeed } from "./companion/index.ts";
import {
  launchFrom,
  type OpenRequest,
  type ProtocolHandler,
  protocolHandlerFor,
  requestFromArgv,
  requestFromLaunch,
  requestFromUrl,
} from "./deep-link.ts";
import { aboutInfo, createWorkspaces, pickFolder, registerHostHandlers } from "./host.ts";
import { type Chords, type MenuAction, menuModel } from "./menu.ts";
import { installApplicationMenu, trayMark } from "./native.ts";
import { prepareSharedRuntime } from "./node-consent-electron.ts";
import { appUserModelIdFor } from "./notify.ts";
import { aboutBox } from "./product.ts";
import {
  inboundSignaling,
  prepareScreenBeforeReady,
  type ScreenWiring,
  signalingRoutes,
  themedIndicatorPalettes,
  wireScreen,
} from "./screen/index.ts";
import { type DesktopShell, desktopShell } from "./shell.ts";
import { wireSurroundings } from "./surroundings-electron.ts";
import { fileSeams } from "./system.ts";
import { trayModel } from "./tray.ts";
import { startUpdater } from "./updater-electron.ts";
import { userDataDirFor, userDataSourcesOf } from "./user-data.ts";
import { windowStateBook } from "./window-state.ts";
import { quitGate } from "./windows.ts";
import type { WorkspaceHost } from "./workspace.ts";

export function startDesktop(profile: ProductProfile): void {
  app.setName(profile.name);
  app.setPath("userData", userDataDirFor(userDataSourcesOf(app, process.env), profile));
  const protocolScheme = profile.protocolScheme;

  const nativeChords: Chords = {
    "open-folder": "CmdOrCtrl+O",
    "close-window": "CmdOrCtrl+Shift+W",
    reload: "CmdOrCtrl+R",
    "toggle-devtools": "CmdOrCtrl+Shift+I",
  };

  const invocation = launchFrom(process.argv, process.defaultApp === true);

  if (app.requestSingleInstanceLock()) launch();
  else app.quit();

  function launch(): void {
    nameTheAppForToasts();
    registerProtocolClient(protocolHandlerFor(invocation));
    prepareScreenBeforeReady({ commandLine: app.commandLine, protocol });
    const queued: OpenRequest[] = [];
    let deliver = (request: OpenRequest): void => {
      queued.push(request);
    };
    app.on("open-url", (event, url) => {
      event.preventDefault();
      deliver(requestFromUrl(url, profile));
    });
    app.on("second-instance", (_event, argv) => {
      const request = requestFromArgv(argv, invocation.defaultApp, profile);
      if (request !== undefined) deliver(request);
    });

    app.whenReady().then(async () => {
      if (app.isPackaged) await prepareSharedRuntime(profile);
      startUpdater(profile);
      const workspaces = createWorkspaces(profile);
      const userData = app.getPath("userData");
      const desktop = desktopShell({
        profile,
        workspaces,
        states: windowStateBook(join(userData, "windows.json"), fileSeams),
        platform: process.platform,
      });
      const dev = !app.isPackaged;
      const tray = trayMark(process.platform);
      const foreground = startForegroundFeed(process.platform);
      const signaling = {
        nodeFile: () => fileSeams.readText(join(homedir(), ".keywork", "node.json")),
        houseFile: () =>
          fileSeams.readText(join(homedir(), ".keywork", "node", "mesh", "screen-house.json")),
        census: () => askAnyServer(workspaces, (client) => client.meshPeers()),
        pairs: () => askAnyServer(workspaces, (client) => client.meshPairs()),
      };
      const screen = await wireScreen({
        killChord: profile.screenKillChord,
        preload: join(import.meta.dirname, "../preload/index.js"),
        logPath: join(userData, "screen-sessions.jsonl"),
        endpointFor: signalingRoutes(signaling),
        inbound: inboundSignaling(signaling),
        onSharingChanged: () => {
          refreshTray();
          surroundings.changed();
        },
        inputHelper: process.env.KEYWORK_INPUT_HELPER,
        audit: async (record) => {
          await askAnyServer(workspaces, (client) => client.recordScreenAudit(record));
        },
        palettes: themedIndicatorPalettes(keyworkNight),
      });
      const sharer = screen.host.sharer;
      const surroundings = wireSurroundings({
        foreground,
        sharedDisplays: () =>
          sharer
            .sessions()
            .filter((sessionId) => sharer.isCapturing(sessionId))
            .flatMap((sessionId) => sharer.captureTarget(sessionId)?.id ?? []),
      });
      const companionReady = startElectronCompanion({
        profile,
        desktop,
        platform: process.platform,
        dev,
        userData,
        preload: join(import.meta.dirname, "../preload/companion.js"),
        sessionType: process.env.XDG_SESSION_TYPE,
        foreground,
      });

      const act = (action: MenuAction, payload?: string): void => {
        void perform(action, payload, desktop, screen);
      };
      const refreshMenu = async (): Promise<void> => {
        const recents = (await workspaces.recent()).map((entry) => entry.path);
        installApplicationMenu(
          menuModel({ platform: process.platform, dev, recents, chords: nativeChords, profile }),
          act,
        );
      };
      const refreshTray = (): void => {
        tray.update(
          trayModel(desktop.windows.list(), screen.host.sharer.sessions(), profile),
          act,
          () => desktop.focusMostRecent(),
        );
      };
      const route = (request: OpenRequest): void => {
        if (request.ok) void desktop.openPath(request.path);
        else console.warn(`refused ${request.reason}: ${request.input}`);
      };

      const host = registerHostHandlers(workspaces, desktop, () => void refreshMenu(), profile);
      desktop.onOpenWorkspacesChanged(refreshTray);
      screen.host.sharer.onEnded(() => {
        refreshTray();
        surroundings.changed();
      });
      await refreshMenu();
      refreshTray();

      const gate = quitGate(async () => {
        host.abortRelays();
        (await companionReady).dispose();
        surroundings.dispose();
        foreground?.stop();
        await screen.dispose();
        tray.destroy();
        return workspaces.closeAll();
      });
      app.on("before-quit", (event) => gate(event, () => app.quit()));
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void desktop.openWindow();
      });

      const first = requestFromLaunch(invocation, profile);
      await Promise.all([desktop.openWindow(first?.ok ? first.path : undefined), companionReady]);
      if (first !== undefined && !first.ok) route(first);
      deliver = route;
      for (const request of queued) route(request);
    });
  }

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  function nameTheAppForToasts(): void {
    const modelId = appUserModelIdFor(
      {
        platform: process.platform,
        packaged: app.isPackaged,
        execPath: process.execPath,
      },
      profile,
    );
    if (modelId !== undefined) app.setAppUserModelId(modelId);
  }

  function registerProtocolClient(handler: ProtocolHandler): void {
    if (handler.kind === "this-executable") app.setAsDefaultProtocolClient(protocolScheme);
    if (handler.kind === "dev-app") {
      app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [resolve(handler.appPath)]);
    }
  }

  async function askAnyServer<Answer>(
    workspaces: WorkspaceHost,
    ask: (client: ConsoleClient) => Promise<Answer>,
  ): Promise<Answer | undefined> {
    const ticket = workspaces
      .openRoots()
      .map((root) => workspaces.ticketFor(root))
      .find((found) => found !== undefined);
    return ticket === undefined ? undefined : ask(keyworkClient(ticket));
  }

  async function perform(
    action: MenuAction,
    payload: string | undefined,
    desktop: DesktopShell,
    screen: ScreenWiring,
  ) {
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
      case "about":
        await dialog.showMessageBox(aboutBox(aboutInfo(), profile));
        return;
      case "screen-stop":
        await screen.host.sharer.endAll("local-user");
        return;
      case "quit":
        app.quit();
    }
  }
}
