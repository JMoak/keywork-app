import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ProductProfile } from "@keywork-app/product";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  nativeTheme,
  powerMonitor,
  screen,
} from "electron";
import { witnessForeground } from "../notify.ts";
import type { DesktopShell } from "../shell.ts";
import { fileSeams } from "../system.ts";
import { companionChannels, type MenuRequest } from "./channels.ts";
import {
  type CompanionPorts,
  type CompanionService,
  type MenuActor,
  type SenderLike,
  startCompanion,
} from "./companion.ts";
import {
  type ForegroundFeed,
  foregroundFeed,
  handleOf,
  holdsForeground,
  noForegroundProbe,
  type OwnWindow,
  windowsForegroundProbe,
} from "./foreground.ts";
import type { CompanionMenuItem } from "./menu.ts";
import type { DisplayLike } from "./placement.ts";
import { preferenceBook } from "./preferences.ts";
import {
  type CapturedFrame,
  captureSourceFor,
  hexOf,
  plateRimDip,
  probePlate,
  probePointsFor,
  readCapture,
  readingWhy,
  type SelfTestReading,
} from "./self-test.ts";
import { displaySessionOf, floatsNatively, type SessionSignals } from "./session.ts";
import type { ThermalState } from "./tiers.ts";
import type { CompanionWindowLike } from "./window.ts";

export interface ElectronCompanionSeams {
  profile?: ProductProfile;
  desktop: DesktopShell;
  platform: NodeJS.Platform;
  dev: boolean;
  userData: string;
  preload: string;
  sessionType: string | undefined;
  waylandDisplay?: string | undefined;
  ozonePlatform?: string | undefined;
  foreground?: ForegroundFeed | undefined;
}

export function startForegroundFeed(platform: NodeJS.Platform): ForegroundFeed | undefined {
  return platform === "win32" ? foregroundFeed(spawnLines) : undefined;
}

export async function startElectronCompanion(
  seams: ElectronCompanionSeams,
): Promise<CompanionService> {
  const owned = seams.foreground === undefined ? startForegroundFeed(seams.platform) : undefined;
  const foreground = seams.foreground ?? owned;
  const unwitness =
    foreground === undefined
      ? () => undefined
      : witnessForeground(() => holdsForeground(foreground.window(), ownWindows()));
  const unfollow = foreground === undefined ? () => undefined : followFocusInto(foreground);
  const service = await startCompanion({
    ...electronCompanionPorts(seams),
    foreground: foreground?.probe ?? noForegroundProbe,
  });
  return {
    ...service,
    dispose: () => {
      service.dispose();
      unfollow();
      unwitness();
      owned?.stop();
    },
  };
}

function followFocusInto(foreground: Pick<ForegroundFeed, "noteForeground">): () => void {
  const onFocus = (_event: unknown, window: BrowserWindow): void => {
    if (!window.isDestroyed()) foreground.noteForeground(handleOf(window.getNativeWindowHandle()));
  };
  app.on("browser-window-focus", onFocus);
  return () => app.off("browser-window-focus", onFocus);
}

export function ownWindows(): OwnWindow[] {
  return BrowserWindow.getAllWindows()
    .filter((window) => !window.isDestroyed())
    .map((window) => ({
      handle: handleOf(window.getNativeWindowHandle()),
      visible: window.isVisible(),
      minimized: window.isMinimized(),
    }));
}

export function sessionSignalsOf(seams: ElectronCompanionSeams): SessionSignals {
  return {
    platform: seams.platform,
    sessionType: seams.sessionType,
    waylandDisplay: seams.waylandDisplay ?? process.env.WAYLAND_DISPLAY,
    ozonePlatform: seams.ozonePlatform ?? app.commandLine.getSwitchValue("ozone-platform"),
  };
}

export function electronCompanionPorts(seams: ElectronCompanionSeams): CompanionPorts {
  const natives = new WeakMap<CompanionWindowLike, BrowserWindow>();
  const companionContents = new Set<number>();
  return {
    platform: seams.platform,
    ...(seams.profile !== undefined && { profile: seams.profile }),
    wayland: !floatsNatively(displaySessionOf(sessionSignalsOf(seams))),
    dev: seams.dev,
    preload: seams.preload,
    preferences: preferenceBook(join(seams.userData, "companion.json"), fileSeams),
    windows: {
      create: (options) => {
        const native = new BrowserWindow(options);
        const like = windowLike(native);
        natives.set(like, native);
        companionContents.add(like.webContents.id);
        native.once("closed", () => companionContents.delete(like.webContents.id));
        return like;
      },
      load: (like) => loadCompanionPage(natives.get(like)),
      popup: (like, at, items, act) => popupMenu(natives.get(like), at, items, act),
    },
    screen: {
      displays: () => screen.getAllDisplays().map(displayLike),
      cursor: () => cursorPoint(),
      onChange: (listener) => {
        screen.on("display-added", listener);
        screen.on("display-removed", listener);
        screen.on("display-metrics-changed", listener);
        return () => {
          screen.off("display-added", listener);
          screen.off("display-removed", listener);
          screen.off("display-metrics-changed", listener);
        };
      },
    },
    power: {
      onLock: (listener) => listen("lock-screen", listener),
      onUnlock: (listener) => listen("unlock-screen", listener),
      onBatteryChange: (listener) => {
        const onBattery = (): void => listener(true);
        const onAc = (): void => listener(false);
        powerMonitor.on("on-battery", onBattery);
        powerMonitor.on("on-ac", onAc);
        return () => {
          powerMonitor.off("on-battery", onBattery);
          powerMonitor.off("on-ac", onAc);
        };
      },
      onBattery: () => powerMonitor.isOnBatteryPower(),
      idleState: (seconds) => powerMonitor.getSystemIdleState(seconds),
      onThermal: (listener) => {
        const relay = (details: { state: ThermalState }): void => listener(details.state);
        powerMonitor.on("thermal-state-change", relay);
        return () => powerMonitor.off("thermal-state-change", relay);
      },
      onSpeedLimit: (listener) => {
        const relay = (details: { limit: number }): void => listener(details.limit);
        powerMonitor.on("speed-limit-change", relay);
        return () => powerMonitor.off("speed-limit-change", relay);
      },
    },
    theme: {
      reducedTransparency: () => nativeTheme.prefersReducedTransparency,
      forcedColors: () => nativeTheme.inForcedColorsMode,
      onChange: (listener) => {
        nativeTheme.on("updated", listener);
        return () => nativeTheme.off("updated", listener);
      },
    },
    foreground: seams.platform === "win32" ? windowsForegroundProbe(spawnLines) : noForegroundProbe,
    shortcuts: {
      register: (accelerator, handler) => globalShortcut.register(accelerator, handler),
      unregister: (accelerator) => globalShortcut.unregister(accelerator),
    },
    selfTest: {
      gpu: gpuFingerprint,
      run: (like) => transparencySelfTest(natives.get(like)),
    },
    console: {
      isConsole: (sender) => !companionContents.has(sender.id) && isAppWindow(sender),
      focusThread: () => seams.desktop.focusMostRecent(),
      send: (channel, payload) => seams.desktop.broadcast(channel, payload),
    },
    ipc: {
      handle: (channel, handler) =>
        ipcMain.handle(channel, (event, payload: unknown) =>
          handler({ id: event.sender.id }, payload),
        ),
      on: (channel, listener) =>
        ipcMain.on(channel, (event, payload: unknown) =>
          listener({ id: event.sender.id }, payload),
        ),
      release: () => {
        for (const channel of Object.values(companionChannels)) {
          ipcMain.removeHandler(channel);
          ipcMain.removeAllListeners(channel);
        }
      },
    },
    clock: {
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    },
    log: (line) => console.info(line),
    metrics: seams.dev
      ? {
          mainUsage: () => process.getCPUUsage(),
          metrics: () => app.getAppMetrics(),
          logicalProcessors: () => cpus().length,
        }
      : undefined,
  };
}

export const selfTestTimeoutMs = 2500;

export async function transparencySelfTest(
  window: BrowserWindow | undefined,
): Promise<SelfTestReading> {
  if (window === undefined) return { verdict: "unknown", why: "no companion window to test" };
  const bounds = window.getBounds();
  const plate = new BrowserWindow({
    x: bounds.x - plateRimDip,
    y: bounds.y - plateRimDip,
    width: bounds.width + 2 * plateRimDip,
    height: bounds.height + 2 * plateRimDip,
    frame: false,
    show: false,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: hexOf(probePlate),
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  const shownBefore = window.isVisible();
  try {
    plate.showInactive();
    window.showInactive();
    window.moveTop();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return await Promise.race([
      readScreen(window),
      new Promise<SelfTestReading>((resolve) =>
        setTimeout(
          () => resolve({ verdict: "unknown", why: "the capture timed out" }),
          selfTestTimeoutMs,
        ),
      ),
    ]);
  } catch {
    return { verdict: "unknown", why: readingWhy.denied };
  } finally {
    if (!shownBefore) window.hide();
    plate.destroy();
  }
}

async function readScreen(window: BrowserWindow): Promise<SelfTestReading> {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const frame = await captureDisplay(display);
  const ratio = frame === undefined ? 1 : frame.width / display.bounds.width;
  return readCapture(frame, probePointsFor(bounds, display, ratio));
}

async function captureDisplay(display: Electron.Display): Promise<CapturedFrame | undefined> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: display.bounds.width, height: display.bounds.height },
  });
  const source = captureSourceFor(sources, display.id);
  if (source === undefined || source.thumbnail.isEmpty()) return undefined;
  const size = source.thumbnail.getSize();
  return {
    bgra: new Uint8Array(source.thumbnail.toBitmap()),
    width: size.width,
    height: size.height,
  };
}

async function gpuFingerprint(): Promise<string> {
  try {
    const info = (await app.getGPUInfo("basic")) as { gpuDevice?: unknown };
    return JSON.stringify(info.gpuDevice ?? info);
  } catch {
    return "unknown-gpu";
  }
}

function windowLike(native: BrowserWindow): CompanionWindowLike {
  return {
    id: native.id,
    webContents: {
      id: native.webContents.id,
      send: (channel, ...payload) => native.webContents.send(channel, ...payload),
      getOSProcessId: () => native.webContents.getOSProcessId(),
      isDestroyed: () => native.webContents.isDestroyed(),
    },
    setAlwaysOnTop: (flag, level) => native.setAlwaysOnTop(flag, level),
    setIgnoreMouseEvents: (ignore, options) => native.setIgnoreMouseEvents(ignore, options),
    setVisibleOnAllWorkspaces: (visible, options) =>
      native.setVisibleOnAllWorkspaces(visible, options),
    showInactive: () => native.showInactive(),
    hide: () => native.hide(),
    isVisible: () => native.isVisible(),
    getBounds: () => native.getBounds(),
    setBounds: (bounds) => native.setBounds(bounds),
    setPosition: (x, y) => native.setPosition(x, y),
    isDestroyed: () => native.isDestroyed(),
    destroy: () => native.destroy(),
    once: (event, listener) => {
      if (event === "closed") native.once("closed", listener);
      else native.once("ready-to-show", listener);
    },
    on: (event, listener) => void native.on(event, listener),
  };
}

export const firstPaintBackstopMs = 1500;

export function whenPainted(
  native: BrowserWindow,
  backstopMs = firstPaintBackstopMs,
): Promise<void> {
  return new Promise((resolve) => {
    const backstop = setTimeout(resolve, backstopMs);
    native.once("ready-to-show", () => {
      clearTimeout(backstop);
      resolve();
    });
  });
}

export const transparentRootCss = ":root, html, body { background: transparent !important; }";

export async function loadCompanionPage(native: BrowserWindow | undefined): Promise<void> {
  if (native === undefined) return;
  const painted = whenPainted(native);
  const transparent = keepRootTransparent(native.webContents);
  const devServer = process.env.ELECTRON_RENDERER_URL;
  if (devServer !== undefined) await native.loadURL(`${devServer}?companion`);
  else {
    await native.loadFile(join(import.meta.dirname, "../renderer/index.html"), {
      query: { companion: "1" },
    });
  }
  await transparent;
  await painted;
}

// The companion page shares the console's stylesheet, and Chromium paints a :root background
// across the whole canvas, so a transparent window would otherwise fill its margin.
function keepRootTransparent(contents: Electron.WebContents): Promise<void> {
  return new Promise((resolve) => {
    contents.on("dom-ready", () => {
      contents.insertCSS(transparentRootCss, { cssOrigin: "user" }).then(
        () => resolve(),
        () => resolve(),
      );
    });
  });
}

function popupMenu(
  native: BrowserWindow | undefined,
  at: MenuRequest,
  items: readonly CompanionMenuItem[],
  act: MenuActor,
): void {
  if (native === undefined) return;
  Menu.buildFromTemplate(templateOf(items, act)).popup({ window: native, x: at.x, y: at.y });
}

function templateOf(
  items: readonly CompanionMenuItem[],
  act: MenuActor,
): MenuItemConstructorOptions[] {
  return items.map((item) => templateItem(item, act));
}

function templateItem(item: CompanionMenuItem, act: MenuActor): MenuItemConstructorOptions {
  switch (item.kind) {
    case "separator":
      return { type: "separator" };
    case "action":
      return { label: item.label, click: () => act(item.action, item.payload) };
    case "toggle":
      return {
        label: item.label,
        type: "checkbox",
        checked: item.checked,
        click: () => act(item.action),
      };
    case "choice":
      return {
        label: item.label,
        type: "radio",
        checked: item.chosen,
        click: () => act(item.action, item.payload),
      };
    case "submenu":
      return { label: item.label, submenu: templateOf(item.items, act) };
  }
}

function displayLike(display: Electron.Display): DisplayLike {
  return {
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
  };
}

function cursorPoint(): { x: number; y: number } | undefined {
  try {
    return screen.getCursorScreenPoint();
  } catch {
    return undefined;
  }
}

function listen(event: "lock-screen" | "unlock-screen", listener: () => void): () => void {
  if (event === "lock-screen") powerMonitor.on("lock-screen", listener);
  else powerMonitor.on("unlock-screen", listener);
  return () => {
    if (event === "lock-screen") powerMonitor.off("lock-screen", listener);
    else powerMonitor.off("unlock-screen", listener);
  };
}

function isAppWindow(sender: SenderLike): boolean {
  return BrowserWindow.getAllWindows().some((window) => window.webContents.id === sender.id);
}

function spawnLines(command: string, args: readonly string[]) {
  const child = spawn(command, [...args], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (child.stdout === null) return { onLine: () => undefined, kill: () => void child.kill() };
  const lines = createInterface({ input: child.stdout });
  return {
    onLine: (listener: (line: string) => void) => void lines.on("line", listener),
    kill: () => {
      lines.close();
      child.kill();
    },
  };
}
