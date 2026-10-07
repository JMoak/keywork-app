import { app, BrowserWindow, ipcMain } from "electron";
import electronUpdater from "electron-updater";
import { hostChannels } from "../shared/channels.ts";
import { runUpdater, type Updater, updateFeed } from "./updater.ts";

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
    announce: (update) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send(hostChannels.updateReady, update);
      }
    },
    onAccept: (listener) => ipcMain.handle(hostChannels.acceptUpdate, () => listener()),
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs);
      return () => clearTimeout(timer);
    },
    now: Date.now,
    log: (line) => console.warn(line),
  });
}
