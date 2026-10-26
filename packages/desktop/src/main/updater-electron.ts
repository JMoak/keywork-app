import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";
import { hostChannels } from "../shared/channels.ts";
import { runUpdater, type UpdateReady, type Updater, updateFeed } from "./updater.ts";

export function startUpdater(): Updater | undefined {
  if (!app.isPackaged) return undefined;
  const { autoUpdater } = electronUpdater;
  autoUpdater.setFeedURL(updateFeed);
  return runUpdater({
    source: {
      get autoDownload() {
        return autoUpdater.autoDownload;
      },
      set autoDownload(value) {
        autoUpdater.autoDownload = value;
      },
      get autoInstallOnAppQuit() {
        return autoUpdater.autoInstallOnAppQuit;
      },
      set autoInstallOnAppQuit(value) {
        autoUpdater.autoInstallOnAppQuit = value;
      },
      checkForUpdates: () => autoUpdater.checkForUpdates(),
      onDownloaded: (listener) =>
        autoUpdater.on("update-downloaded", (event) => listener({ version: event.version })),
      onError: (listener) => autoUpdater.on("error", listener),
    },
    announce: announceToEveryWindow(),
    onAccept: (listener) => ipcMain.handle(hostChannels.acceptUpdate, () => listener()),
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs);
      return () => clearTimeout(timer);
    },
    now: Date.now,
    log: (line) => console.warn(line),
  });
}

function announceToEveryWindow(): (update: UpdateReady) => void {
  let waiting: UpdateReady | undefined;
  app.on("browser-window-focus", (_event, window) => {
    if (waiting !== undefined) tell(window, waiting);
  });
  return (update) => {
    waiting = update;
    for (const window of BrowserWindow.getAllWindows()) tell(window, update);
  };
}

function tell(window: BrowserWindow, update: UpdateReady): void {
  if (!window.isDestroyed()) window.webContents.send(hostChannels.updateReady, update);
}
