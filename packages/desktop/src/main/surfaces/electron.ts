import { win32 } from "node:path";
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Display,
  ipcMain,
  screen,
  type WebContents,
  webContents,
} from "electron";
import { trustedIpc } from "../app-page.ts";
import { displaySessionOf, floatsNatively } from "../companion/session.ts";
import { type DeskDisplay, type ScreenPoint, surfaceChannels } from "./channels.ts";
import { type HelperPipes, helperPipes, type PanesHelper, panesHelper } from "./helper.ts";
import { framePacer, glideFrameMs, timerLatenessOn } from "./pacer.ts";
import { type IpcPort, type ScreenPort, type SurfaceService, startSurfaces } from "./surfaces.ts";
import {
  type ConsoleWindowLike,
  grabEvents,
  reframeEvents,
  releaseEvents,
  type SurfaceWindowLike,
  surfaceWindowOptions,
  unloadEvents,
} from "./window.ts";

export interface ElectronSurfaceSeams {
  platform: NodeJS.Platform;
  sessionType: string | undefined;
  backdrop: string;
  waylandDisplay?: string | undefined;
  ozonePlatform?: string | undefined;
  moverPath?: string | undefined;
  openMover?: ((path: string) => HelperPipes) | undefined;
}

export interface SurfaceDoor {
  windowOptions(opener: WebContents): BrowserWindowConstructorOptions | undefined;
  adopt(opener: WebContents, child: BrowserWindow, frameName: string): void;
  holds(contents: WebContents): boolean;
}

export interface ElectronSurfaces {
  door: SurfaceDoor;
  dispose(): void;
}

export function startElectronSurfaces(seams: ElectronSurfaceSeams): ElectronSurfaces {
  const helper = moverHelper(seams);
  const service = startSurfaces({
    childrenRideWithParent: seams.platform === "darwin",
    screen: electronScreen(),
    consoles: { of: (sender) => consoleShowing(webContents.fromId(sender.id)) },
    ipc: electronIpc(),
    clock: {
      now: () => performance.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
    },
    everyFrame: framePacer(
      {
        now: () => performance.now(),
        defer: (run) => void setImmediate(run),
        sleep: (run, ms) => void setTimeout(run, ms),
      },
      { frameMs: glideFrameMs, timerLatenessMs: timerLatenessOn(seams.platform) },
    ),
    helper,
  });
  return {
    door: surfaceDoor(seams, service),
    dispose: () => {
      service.dispose();
      helper?.close();
    },
  };
}

export function placesWindows(seams: ElectronSurfaceSeams): boolean {
  return floatsNatively(
    displaySessionOf({
      platform: seams.platform,
      sessionType: seams.sessionType,
      waylandDisplay: seams.waylandDisplay ?? process.env.WAYLAND_DISPLAY,
      ozonePlatform: seams.ozonePlatform ?? app.commandLine.getSwitchValue("ozone-platform"),
    }),
  );
}

// The helper is a Win32 program, named by an absolute path so that nothing on the search path
// can stand in for it.
function moverHelper(seams: ElectronSurfaceSeams): PanesHelper | undefined {
  const path = seams.moverPath;
  if (seams.platform !== "win32" || path === undefined || !win32.isAbsolute(path)) return undefined;
  try {
    const pipes = (seams.openMover ?? helperPipes)(path);
    return panesHelper(pipes, process.pid, (news) => console.warn(news));
  } catch {
    return undefined;
  }
}

function surfaceDoor(seams: ElectronSurfaceSeams, service: SurfaceService): SurfaceDoor {
  return {
    windowOptions: (opener) => {
      const parent = BrowserWindow.fromWebContents(opener);
      if (parent === null || !placesWindows(seams)) return undefined;
      return surfaceWindowOptions({
        parent,
        backdrop: service.backdrop() ?? seams.backdrop,
        title: app.getName(),
      });
    },
    adopt: (opener, child, frameName) => {
      const parent = BrowserWindow.fromWebContents(opener);
      if (parent === null) return child.destroy();
      allowOneMoreChild(opener, child);
      service.adopt(consoleLike(parent), surfaceLike(child, seams.platform), frameName);
    },
    holds: (contents) => service.holds(contents.id),
  };
}

// Electron listens on the opener once for every window it opens, and Node warns past ten.
function allowOneMoreChild(opener: WebContents, child: BrowserWindow): void {
  opener.setMaxListeners(opener.getMaxListeners() + 1);
  child.once("closed", () => {
    if (!opener.isDestroyed()) opener.setMaxListeners(opener.getMaxListeners() - 1);
  });
}

function consoleShowing(contents: WebContents | undefined): ConsoleWindowLike | undefined {
  const window = contents === undefined ? null : BrowserWindow.fromWebContents(contents);
  return window === null ? undefined : consoleLike(window);
}

function consoleLike(window: BrowserWindow): ConsoleWindowLike {
  const contents = window.webContents;
  return {
    id: window.id,
    sourceId: () => window.getMediaSourceId(),
    bounds: () => window.getBounds(),
    contentBounds: () => window.getContentBounds(),
    isMaximized: () => window.isMaximized(),
    isMinimized: () => window.isMinimized(),
    setBounds: (bounds) => window.setBounds(bounds),
    maximize: () => window.maximize(),
    unmaximize: () => window.unmaximize(),
    zoomFactor: () => contents.getZoomFactor(),
    focus: () => window.focus(),
    send: (channel, payload) => {
      if (!window.isDestroyed() && !contents.isDestroyed()) contents.send(channel, payload);
    },
    on: (signal, listener) => {
      if (signal === "reframed") onEach(window, reframeEvents, listener);
      else if (signal === "grabbed") onEach(window, grabEvents, listener);
      else if (signal === "unloaded") onEach(contents, unloadEvents, listener);
      else window.on("closed", listener);
    },
  };
}

function surfaceLike(window: BrowserWindow, platform: NodeJS.Platform): SurfaceWindowLike {
  const contents = window.webContents;
  return {
    id: window.id,
    contentsId: contents.id,
    nativeHandle: () => handleOf(window),
    sourceId: () => window.getMediaSourceId(),
    moveAbove: (sourceId) => window.moveAbove(sourceId),
    getBounds: () => window.getBounds(),
    setBounds: (bounds) => window.setBounds(bounds),
    setPosition: (x, y) => window.setPosition(x, y),
    setBackgroundColor: (color) => window.setBackgroundColor(color),
    setTitle: (title) => window.setTitle(title),
    setZoomFactor: (factor) => contents.setZoomFactor(factor),
    show: () => window.show(),
    showInactive: () => window.showInactive(),
    hide: () => window.hide(),
    focus: () => window.focus(),
    isVisible: () => window.isVisible(),
    isMaximized: () => window.isMaximized(),
    isDestroyed: () => window.isDestroyed(),
    destroy: () => window.destroy(),
    on: (signal, listener) => {
      if (signal === "grab") onEach(window, grabEvents, listener);
      else if (signal === "release") onEach(window, releaseEvents(platform), listener);
      else onEach(window, [signal], listener);
    },
    onCloseRequested: (listener) => void window.on("close", listener),
  };
}

// The helper names a window by its handle in hexadecimal; Electron hands the handle over as the
// bytes of a pointer, least significant first.
function handleOf(window: BrowserWindow): string {
  const pointer = Buffer.from(window.getNativeWindowHandle()).reverse().toString("hex");
  return BigInt(`0x${pointer}`).toString(16);
}

function onEach(
  emitter: NodeJS.EventEmitter,
  events: readonly string[],
  listener: () => void,
): void {
  for (const event of events) emitter.on(event, () => listener());
}

function electronScreen(): ScreenPort {
  return {
    displays: () => screen.getAllDisplays().map(deskDisplay),
    displayMatching: (rect) => deskDisplay(screen.getDisplayMatching(rect)),
    cursor: cursorPoint,
    pixelsOf: (point) => screen.dipToScreenPoint(point),
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
  };
}

function electronIpc(): IpcPort {
  const ipc = trustedIpc();
  return {
    handle: (channel, handler) =>
      ipc.handle(channel, (event, payload: unknown) => handler({ id: event.sender.id }, payload)),
    on: (channel, listener) =>
      ipc.on(channel, (event, payload: unknown) => listener({ id: event.sender.id }, payload)),
    release: () => {
      for (const channel of Object.values(surfaceChannels)) {
        ipcMain.removeHandler(channel);
        ipcMain.removeAllListeners(channel);
      }
    },
  };
}

function deskDisplay(display: Display): DeskDisplay {
  return { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor };
}

function cursorPoint(): ScreenPoint | undefined {
  try {
    return screen.getCursorScreenPoint();
  } catch {
    return undefined;
  }
}
