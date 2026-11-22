import { EventEmitter } from "node:events";
import type { BrowserWindow, WebContents } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appPage } from "../app-page.ts";
import { type SurfaceEvent, surfaceChannels } from "./channels.ts";
import { placesWindows, startElectronSurfaces } from "./electron.ts";
import { newsEveryMs } from "./surfaces.ts";
import { fakeHelperPipes } from "./testing.ts";

const desktop = vi.hoisted(() => ({
  windows: new Map<number, unknown>(),
  contents: new Map<number, unknown>(),
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  listeners: new Map<string, (event: unknown, payload?: unknown) => void>(),
  ozonePlatform: "",
}));

vi.mock("electron", () => ({
  app: {
    getName: () => "keywork",
    commandLine: { getSwitchValue: () => desktop.ozonePlatform },
  },
  BrowserWindow: {
    fromWebContents: (contents: { id: number }) => desktop.windows.get(contents.id) ?? null,
  },
  webContents: { fromId: (id: number) => desktop.contents.get(id) },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload?: unknown) => unknown) =>
      desktop.handlers.set(channel, handler),
    on: (channel: string, listener: (event: unknown, payload?: unknown) => void) =>
      desktop.listeners.set(channel, listener),
    removeHandler: (channel: string) => desktop.handlers.delete(channel),
    removeAllListeners: (channel: string) => desktop.listeners.delete(channel),
  },
  screen: {
    getAllDisplays: () => [display],
    getDisplayMatching: () => display,
    getCursorScreenPoint: () => ({ x: 5, y: 6 }),
    dipToScreenPoint: (point: { x: number; y: number }) => ({
      x: point.x * display.scaleFactor,
      y: point.y * display.scaleFactor,
    }),
    on: () => undefined,
    off: () => undefined,
  },
}));

const display = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 2,
  rotation: 0,
};

const seams = { platform: "win32" as NodeJS.Platform, sessionType: undefined, backdrop: "paper" };

interface StandIn extends EventEmitter {
  id: number;
  calls: string[];
  sent: Array<[string, unknown]>;
  native: BrowserWindow;
  contents: WebContents;
  events(): SurfaceEvent[];
  moveTo(x: number, y: number): void;
}

function standIn(id: number, contentBounds = { x: 107, y: 131, width: 886, height: 562 }): StandIn {
  let bounds = { x: 100, y: 100, width: 900, height: 600 };
  const window = new EventEmitter() as StandIn;
  const contents = Object.assign(new EventEmitter(), {
    id: id * 10,
    send: (channel: string, payload: unknown) => void window.sent.push([channel, payload]),
    getZoomFactor: () => 1,
    setZoomFactor: () => undefined,
    isDestroyed: () => false,
  });
  Object.assign(window, {
    id,
    calls: [],
    sent: [],
    webContents: contents,
    getBounds: () => bounds,
    getContentBounds: () => contentBounds,
    getNativeWindowHandle: () => pointerTo(handleBase + id),
    getMediaSourceId: () => `window:${handleBase + id}:0`,
    moveAbove: (sourceId: string) => void window.calls.push(`moveAbove:${sourceId}`),
    setBounds: (next: typeof bounds) => {
      bounds = next;
      window.emit("move");
    },
    setPosition: (x: number, y: number) => window.moveTo(x, y),
    setBackgroundColor: () => undefined,
    setTitle: () => undefined,
    show: () => void window.calls.push("show"),
    showInactive: () => void window.calls.push("showInactive"),
    hide: () => void window.calls.push("hide"),
    focus: () => void window.calls.push("focus"),
    isVisible: () => true,
    isMaximized: () => false,
    isMinimized: () => false,
    isDestroyed: () => false,
    destroy: () => void window.calls.push("destroy"),
    events: () =>
      window.sent
        .filter(([channel]) => channel === surfaceChannels.event)
        .map(([, payload]) => payload as SurfaceEvent),
    moveTo: (x: number, y: number) => {
      bounds = { ...bounds, x, y };
      window.emit("move");
    },
  });
  window.native = window as unknown as BrowserWindow;
  window.contents = contents as unknown as WebContents;
  desktop.windows.set(contents.id, window);
  desktop.contents.set(contents.id, contents);
  return window;
}

const handleBase = 0x1a2b00;

function pointerTo(handle: number): Buffer {
  const pointer = Buffer.alloc(8);
  pointer.writeBigUInt64LE(BigInt(handle));
  return pointer;
}

function fromThePageOf(window: StandIn, url = appPage()) {
  return { sender: window.contents, senderFrame: { url } };
}

async function asked(channel: string, event: unknown, payload?: unknown): Promise<unknown> {
  return desktop.handlers.get(channel)?.(event, payload);
}

beforeEach(() => {
  vi.useFakeTimers();
  desktop.windows.clear();
  desktop.contents.clear();
  desktop.ozonePlatform = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the door a pane leaves by", () => {
  it("offers a window owned by the opener's console, in the app's name and the default backdrop", () => {
    const console = standIn(1);
    const { door } = startElectronSurfaces(seams);
    expect(door.windowOptions(console.contents)).toMatchObject({
      parent: console.native,
      frame: false,
      show: false,
      backgroundColor: "paper",
      title: "keywork",
    });
  });

  it("offers nothing to an opener that is no window of ours", () => {
    const { door } = startElectronSurfaces(seams);
    expect(door.windowOptions({ id: 404 } as WebContents)).toBeUndefined();
  });

  it("offers nothing where the desktop will not let an app place its windows", () => {
    const console = standIn(1);
    const wayland = { ...seams, platform: "linux" as NodeJS.Platform, sessionType: "wayland" };
    expect(startElectronSurfaces(wayland).door.windowOptions(console.contents)).toBeUndefined();
    expect(placesWindows(wayland)).toBe(false);
    expect(placesWindows({ ...wayland, ozonePlatform: "x11" })).toBe(true);
    expect(placesWindows({ ...wayland, sessionType: "x11" })).toBe(true);
    expect(placesWindows(seams)).toBe(true);
  });

  it("adopts the child for its console, announces it, and knows its page from then on", () => {
    const console = standIn(1);
    const child = standIn(2);
    const { door } = startElectronSurfaces(seams);
    door.adopt(console.contents, child.native, "kw-surface:1");
    expect(console.events()).toEqual([{ kind: "ready", id: "kw-surface:1" }]);
    expect(door.holds(child.contents)).toBe(true);
    expect(door.holds(console.contents)).toBe(false);
  });

  it("destroys a child whose opener has no window", () => {
    const child = standIn(2);
    startElectronSurfaces(seams).door.adopt(
      { id: 404 } as WebContents,
      child.native,
      "kw-surface:1",
    );
    expect(child.calls).toEqual(["destroy"]);
  });
});

describe("a pane window's own events", () => {
  function adopted(platform: NodeJS.Platform = "win32") {
    const console = standIn(1);
    const child = standIn(2);
    startElectronSurfaces({ ...seams, platform }).door.adopt(
      console.contents,
      child.native,
      "kw-surface:1",
    );
    const moves = (): SurfaceEvent[] => console.events().filter((event) => event.kind === "moved");
    return { console, child, moves };
  }

  it("call a move the keeper's when the desktop said it was about to move the window", () => {
    const { child, moves } = adopted();
    child.emit("will-move");
    child.moveTo(300, 310);
    vi.advanceTimersByTime(newsEveryMs);
    expect(moves()).toEqual([
      { kind: "moved", id: "kw-surface:1", bounds: child.native.getBounds(), by: "keeper" },
    ]);
  });

  it("report the end of a drag at once on Windows, where the desktop says when it ends", () => {
    const { child, moves } = adopted("win32");
    child.emit("will-move");
    child.moveTo(300, 310);
    child.emit("moved");
    expect(moves()).toHaveLength(1);
  });

  it("keep the window when the desktop asks to close it", () => {
    const { console, child } = adopted();
    const request = { preventDefault: vi.fn() };
    child.emit("close", request);
    expect(request.preventDefault).toHaveBeenCalledOnce();
    expect(child.calls).toEqual(["hide"]);
    expect(console.events().at(-1)).toEqual({ kind: "closed", id: "kw-surface:1" });
  });

  it("close every pane when the console's page is replaced", () => {
    const { console, child } = adopted();
    console.contents.emit("did-navigate");
    expect(child.calls).toEqual(["destroy"]);
  });
});

describe("the port's handlers", () => {
  it("answer the app's own page with the desk around its console", async () => {
    const console = standIn(1);
    startElectronSurfaces(seams);
    await expect(asked(surfaceChannels.desk, fromThePageOf(console))).resolves.toMatchObject({
      console: { x: 107, y: 100, width: 886, height: 593 },
      consoleMaximized: false,
      workArea: display.workArea,
      displays: [{ bounds: display.bounds, workArea: display.workArea, scaleFactor: 2 }],
      cursor: { x: 5, y: 6 },
    });
  });

  it("refuse any other page, a pane's own blank page included", async () => {
    const console = standIn(1);
    startElectronSurfaces(seams);
    for (const url of ["about:blank", "https://example.com/"]) {
      await expect(asked(surfaceChannels.desk, fromThePageOf(console, url))).rejects.toThrow(
        "answers only the app's own page",
      );
    }
  });

  it("are released when the app is done with panes outside", () => {
    startElectronSurfaces(seams).dispose();
    expect(desktop.handlers.has(surfaceChannels.show)).toBe(false);
    expect(desktop.listeners.has(surfaceChannels.broughtHome)).toBe(false);
  });

  it("restack panes above their console through a call that activates nothing", async () => {
    const console = standIn(1);
    const lower = standIn(2);
    const upper = standIn(3);
    const { door } = startElectronSurfaces(seams);
    door.adopt(console.contents, lower.native, "kw-surface:1");
    door.adopt(console.contents, upper.native, "kw-surface:2");
    await asked(surfaceChannels.stack, fromThePageOf(console), ["kw-surface:1", "kw-surface:2"]);
    expect(lower.calls).toEqual([`moveAbove:window:${handleBase + 1}:0`]);
    expect(upper.calls).toEqual([`moveAbove:window:${handleBase + 2}:0`]);
    expect(console.calls).toEqual([]);
  });
});

describe("the helper that moves panes", () => {
  const moverPath = "C:\\Program Files\\keywork\\kw-panes-mover.exe";
  const there = { x: 301, y: 77, width: 900, height: 600 };

  function started(given: Partial<typeof seams> & { moverPath?: string } = { moverPath }) {
    const pipes = fakeHelperPipes();
    const opened: string[] = [];
    const surfaces = startElectronSurfaces({
      ...seams,
      ...given,
      openMover: (path) => {
        opened.push(path);
        return pipes;
      },
    });
    const console = standIn(1);
    const child = standIn(2);
    surfaces.door.adopt(console.contents, child.native, "kw-surface:1");
    const glide = (durationMs: number): Promise<unknown> =>
      asked(surfaceChannels.glide, fromThePageOf(console), {
        moves: [{ id: "kw-surface:1", bounds: there }],
        durationMs,
      });
    return { surfaces, pipes, opened, child, glide };
  }

  it("is started from the path it is given, on Windows alone, and only by an absolute path", () => {
    expect(started().opened).toEqual([moverPath]);
    expect(started({ moverPath: "kw-panes-mover.exe" }).opened).toEqual([]);
    expect(started({ moverPath: ".\\kw-panes-mover.exe" }).opened).toEqual([]);
    expect(started({}).opened).toEqual([]);
    expect(started({ moverPath, platform: "darwin" }).opened).toEqual([]);
    expect(started({ moverPath: "/opt/keywork/kw-panes-mover", platform: "linux" }).opened).toEqual(
      [],
    );
  });

  it("is handed a glide with each point as the screen gives it in pixels, and the window by its handle", () => {
    const { pipes, glide } = started();
    pipes.says(`ready 1 ${process.pid}`);
    void glide(180);
    expect(pipes.written).toEqual([`glide 1 180 ${(handleBase + 2).toString(16)}@200,200>602,154`]);
  });

  it("leaves Electron to place the panes when it cannot be started at all", async () => {
    const surfaces = startElectronSurfaces({
      ...seams,
      moverPath,
      openMover: () => {
        throw new Error("spawn EINVAL");
      },
    });
    const console = standIn(1);
    const child = standIn(2);
    surfaces.door.adopt(console.contents, child.native, "kw-surface:1");
    await asked(surfaceChannels.glide, fromThePageOf(console), {
      moves: [{ id: "kw-surface:1", bounds: there }],
      durationMs: 0,
    });
    expect(child.native.getBounds()).toEqual(there);
  });

  it("is ended when the app is done with panes outside", () => {
    const { surfaces, pipes } = started();
    pipes.says(`ready 1 ${process.pid}`);
    surfaces.dispose();
    expect(pipes.killed).toBe(true);
  });
});
