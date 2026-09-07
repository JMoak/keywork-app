import { app, ipcMain } from "electron";
import { hostChannels } from "../shared/channels.ts";

export function registerHostHandlers(): void {
  ipcMain.handle(hostChannels.about, () => ({
    shell: "electron",
    platform: process.platform,
    version: app.getVersion(),
  }));
}
