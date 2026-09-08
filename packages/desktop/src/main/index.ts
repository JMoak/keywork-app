import { join } from "node:path";
import { app, BrowserWindow, screen } from "electron";
import { registerHostHandlers } from "./host.ts";
import { fileSeams } from "./system.ts";
import { positionOn, type WindowState, windowStateStore } from "./window-state.ts";

app.whenReady().then(async () => {
  registerHostHandlers();
  await openWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void openWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

async function openWindow(): Promise<BrowserWindow> {
  const states = windowStateStore(join(app.getPath("userData"), "window.json"), fileSeams);
  const remembered = await states.read();
  const displays = screen.getAllDisplays().map((display) => display.bounds);
  const window = new BrowserWindow({
    width: remembered.width,
    height: remembered.height,
    ...positionOn(remembered, displays),
    show: false,
    autoHideMenuBar: true,
    title: "keywork",
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once("ready-to-show", () => {
    if (remembered.maximized) window.maximize();
    window.show();
  });
  window.on("close", () => {
    void states.write(stateOf(window));
  });
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) await window.loadURL(devServer);
  else await window.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  return window;
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
