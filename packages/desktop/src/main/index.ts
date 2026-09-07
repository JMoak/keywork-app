import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { registerHostHandlers } from "./host.ts";

app.whenReady().then(() => {
  registerHostHandlers();
  openWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function openWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once("ready-to-show", () => window.show());
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) window.loadURL(devServer);
  else window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  return window;
}
