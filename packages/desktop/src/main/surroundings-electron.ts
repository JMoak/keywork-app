import { app, BrowserWindow, ipcMain, screen } from "electron";
import { hostChannels } from "../shared/channels.ts";
import { ownWindows } from "./companion/electron.ts";
import { type ForegroundFeed, holdsForeground } from "./companion/foreground.ts";
import { type SurroundingsWindow, surroundingsRelay } from "./surroundings.ts";

export interface SurroundingsWiringSeams {
  readonly foreground: ForegroundFeed | undefined;
  sharedDisplays(): readonly string[];
}

export interface SurroundingsWiring {
  changed(): void;
  dispose(): void;
}

export function wireSurroundings(seams: SurroundingsWiringSeams): SurroundingsWiring {
  const { foreground } = seams;
  const relay = surroundingsRelay({
    windows: () => BrowserWindow.getAllWindows().map(surroundingsWindowOf),
    displays: () => screen.getAllDisplays().length,
    notificationState: () => foreground?.notificationState(),
    foregroundIsOurs: () =>
      foreground === undefined ? undefined : holdsForeground(foreground.window(), ownWindows()),
    sharedDisplays: seams.sharedDisplays,
  });
  const push = (): void => relay.push();
  ipcMain.handle(hostChannels.surroundings, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return relay.read(window === null ? undefined : surroundingsWindowOf(window));
  });
  const follow = (_event: unknown, window: BrowserWindow): void => followWindow(window, push);
  app.on("browser-window-created", follow);
  for (const window of BrowserWindow.getAllWindows()) followWindow(window, push);
  screen.on("display-added", push);
  screen.on("display-removed", push);
  screen.on("display-metrics-changed", push);
  const unfollowForeground = foreground?.onChange(push);
  return {
    changed: push,
    dispose: () => {
      ipcMain.removeHandler(hostChannels.surroundings);
      app.off("browser-window-created", follow);
      screen.off("display-added", push);
      screen.off("display-removed", push);
      screen.off("display-metrics-changed", push);
      unfollowForeground?.();
    },
  };
}

function followWindow(window: BrowserWindow, push: () => void): void {
  window.on("enter-full-screen", push);
  window.on("leave-full-screen", push);
  window.on("enter-html-full-screen", push);
  window.on("leave-html-full-screen", push);
  window.on("move", push);
}

function surroundingsWindowOf(window: BrowserWindow): SurroundingsWindow {
  return {
    id: window.id,
    isDestroyed: () => window.isDestroyed(),
    isFullScreen: () => window.isFullScreen() || window.isSimpleFullScreen(),
    display: () => String(screen.getDisplayMatching(window.getBounds()).id),
    send: (surroundings) => window.webContents.send(hostChannels.surroundingsChanged, surroundings),
  };
}
