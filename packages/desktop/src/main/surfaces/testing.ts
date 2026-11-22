import { type FakeClock, fakeClock } from "../companion/testing.ts";
import {
  type DeskDisplay,
  type ScreenPoint,
  type ScreenRect,
  type SurfaceEvent,
  type SurfaceId,
  type SurfaceShow,
  surfaceChannels,
} from "./channels.ts";
import { type HelperPipes, type PanesHelper, panesHelper } from "./helper.ts";
import { glideFrameMs } from "./pacer.ts";
import {
  type SenderLike,
  type SurfacePorts,
  type SurfaceService,
  startSurfaces,
} from "./surfaces.ts";
import type {
  CloseRequest,
  ConsoleSignal,
  ConsoleWindowLike,
  SurfaceSignal,
  SurfaceWindowLike,
} from "./window.ts";

export interface FakeSurfaceWindow extends SurfaceWindowLike {
  calls: string[];
  visible: boolean;
  focused: boolean;
  maximized: boolean;
  destroyed: boolean;
  backdrop: string | undefined;
  title: string | undefined;
  zoom: number;
  keeperDragsTo(point: ScreenPoint): void;
  keeperResizesTo(bounds: ScreenRect): void;
  keeperLetsGo(): void;
  keeperSnapsTo(bounds: ScreenRect): void;
  keeperMaximisesOver(workArea: ScreenRect): void;
  keeperRestores(): void;
  desktopMovesTo(point: ScreenPoint): void;
  desktopAsksToClose(): "kept" | "closed";
  emit(signal: SurfaceSignal): void;
}

export const spawnBounds: ScreenRect = { x: 560, y: 240, width: 800, height: 600 };

export const objectHasBeenDestroyed = "Object has been destroyed";

export function fakeSurfaceWindow(id: number): FakeSurfaceWindow {
  let bounds = spawnBounds;
  let restored = spawnBounds;
  const listeners = new Map<SurfaceSignal, Array<() => void>>();
  const closeListeners: Array<(request: CloseRequest) => void> = [];
  const reshape = (next: ScreenRect): void => {
    const moved = next.x !== bounds.x || next.y !== bounds.y;
    const resized = next.width !== bounds.width || next.height !== bounds.height;
    bounds = next;
    if (resized) window.emit("resize");
    if (moved) window.emit("move");
  };
  const whileAlive =
    <Given extends unknown[], Answer>(act: (...given: Given) => Answer) =>
    (...given: Given): Answer => {
      if (window.destroyed) throw new TypeError(objectHasBeenDestroyed);
      return act(...given);
    };
  const window: FakeSurfaceWindow = {
    id,
    contentsId: id * 10,
    calls: [],
    visible: false,
    focused: false,
    maximized: false,
    destroyed: false,
    backdrop: undefined,
    title: undefined,
    zoom: 1,
    nativeHandle: whileAlive(() => (0x1000 + id).toString(16)),
    sourceId: whileAlive(() => `window:${id}:0`),
    moveAbove: whileAlive((sourceId: string) => void window.calls.push(`moveAbove:${sourceId}`)),
    getBounds: whileAlive(() => bounds),
    setBounds: whileAlive((next: ScreenRect) => {
      window.calls.push(`setBounds:${next.x},${next.y},${next.width}x${next.height}`);
      if (!window.maximized) reshape(next);
    }),
    setPosition: whileAlive((x: number, y: number) => {
      window.calls.push(`setPosition:${x},${y}`);
      if (!window.maximized) reshape({ ...bounds, x, y });
    }),
    setBackgroundColor: whileAlive((color: string) => {
      window.backdrop = color;
    }),
    setTitle: whileAlive((title: string) => {
      window.title = title;
    }),
    setZoomFactor: whileAlive((factor: number) => {
      window.zoom = factor;
    }),
    show: whileAlive(() => {
      window.calls.push("show");
      window.visible = true;
    }),
    showInactive: whileAlive(() => {
      window.calls.push("showInactive");
      window.visible = true;
    }),
    hide: whileAlive(() => {
      window.calls.push("hide");
      window.visible = false;
    }),
    focus: whileAlive(() => {
      window.calls.push("focus");
      window.focused = true;
      window.emit("focus");
    }),
    isVisible: whileAlive(() => window.visible),
    isMaximized: whileAlive(() => window.maximized),
    isDestroyed: () => window.destroyed,
    destroy: whileAlive(() => {
      window.calls.push("destroy");
      window.destroyed = true;
      window.visible = false;
      window.emit("closed");
    }),
    on: (signal, listener) => {
      listeners.set(signal, [...(listeners.get(signal) ?? []), listener]);
    },
    onCloseRequested: (listener) => {
      closeListeners.push(listener);
    },
    keeperDragsTo: (point) => {
      window.emit("grab");
      reshape({ ...bounds, ...point });
    },
    keeperResizesTo: (next) => {
      window.emit("grab");
      reshape(next);
    },
    keeperLetsGo: () => window.emit("release"),
    keeperSnapsTo: (next) => {
      window.emit("grab");
      reshape({ ...bounds, x: next.x, y: next.y });
      window.emit("release");
      reshape(next);
    },
    keeperMaximisesOver: (workArea) => {
      restored = bounds;
      window.maximized = true;
      reshape(workArea);
      window.emit("maximize");
    },
    keeperRestores: () => {
      window.maximized = false;
      reshape(restored);
      window.emit("unmaximize");
    },
    desktopMovesTo: (point) => reshape({ ...bounds, ...point }),
    desktopAsksToClose: () => {
      const request = closeRequest();
      for (const listener of closeListeners) listener(request);
      if (!request.prevented()) window.destroy();
      return request.prevented() ? "kept" : "closed";
    },
    emit: (signal) => {
      for (const listener of listeners.get(signal) ?? []) listener();
    },
  };
  return window;
}

export interface FakeConsoleWindow extends ConsoleWindowLike {
  sender: SenderLike;
  sent: Array<[string, unknown]>;
  calls: string[];
  maximized: boolean;
  minimized: boolean;
  closed: boolean;
  zoom: number;
  events(): SurfaceEvent[];
  desks(): unknown[];
  movesTo(point: ScreenPoint): void;
  resizesTo(bounds: ScreenRect): void;
  keeperGrabs(): void;
  reloads(): void;
  closes(): void;
}

export const consoleBounds: ScreenRect = { x: 200, y: 100, width: 1200, height: 800 };

export const titleBarHeight = 31;
export const unseenBorder = 7;

export const consoleSeen: ScreenRect = {
  ...consoleBounds,
  y: consoleBounds.y - titleBarHeight,
  height: consoleBounds.height + titleBarHeight,
};

export function framed(page: ScreenRect): ScreenRect {
  return {
    x: page.x - unseenBorder,
    y: page.y - titleBarHeight,
    width: page.width + 2 * unseenBorder,
    height: page.height + titleBarHeight + unseenBorder,
  };
}

export function pageWithin(outer: ScreenRect): ScreenRect {
  return {
    x: outer.x + unseenBorder,
    y: outer.y + titleBarHeight,
    width: outer.width - 2 * unseenBorder,
    height: outer.height - titleBarHeight - unseenBorder,
  };
}

export function fakeConsoleWindow(id: number): FakeConsoleWindow {
  let bounds = consoleBounds;
  const listeners = new Map<ConsoleSignal, Array<() => void>>();
  const emit = (signal: ConsoleSignal): void => {
    for (const listener of listeners.get(signal) ?? []) listener();
  };
  const sentOn = (channel: string): unknown[] =>
    window.sent.filter(([name]) => name === channel).map(([, payload]) => payload);
  const whileOpen =
    <Answer>(act: () => Answer) =>
    (): Answer => {
      if (window.closed) throw new TypeError(objectHasBeenDestroyed);
      return act();
    };
  const window: FakeConsoleWindow = {
    id,
    sender: { id: id * 10 },
    sent: [],
    calls: [],
    maximized: false,
    minimized: false,
    closed: false,
    zoom: 1,
    sourceId: whileOpen(() => `window:${id}:0`),
    bounds: whileOpen(() => framed(bounds)),
    contentBounds: whileOpen(() => bounds),
    isMaximized: whileOpen(() => window.maximized),
    isMinimized: whileOpen(() => window.minimized),
    setBounds: (outer) => {
      bounds = pageWithin(outer);
      emit("reframed");
    },
    maximize: () => {
      window.maximized = true;
      emit("reframed");
    },
    unmaximize: () => {
      window.maximized = false;
      emit("reframed");
    },
    zoomFactor: whileOpen(() => window.zoom),
    focus: whileOpen(() => void window.calls.push("focus")),
    send: (channel, payload) => void window.sent.push([channel, payload]),
    on: (signal, listener) => {
      listeners.set(signal, [...(listeners.get(signal) ?? []), listener]);
    },
    events: () => sentOn(surfaceChannels.event) as SurfaceEvent[],
    desks: () => sentOn(surfaceChannels.deskChanged),
    movesTo: (point) => {
      bounds = { ...bounds, ...point };
      emit("reframed");
    },
    resizesTo: (next) => {
      bounds = next;
      emit("reframed");
    },
    keeperGrabs: () => emit("grabbed"),
    reloads: () => emit("unloaded"),
    closes: () => {
      window.closed = true;
      emit("closed");
    },
  };
  return window;
}

export const laptop: DeskDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
};

export const sideMonitor: DeskDisplay = {
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
  scaleFactor: 1.5,
};

export interface FakeSurfacePorts extends SurfacePorts {
  clock: FakeClock;
  screen: SurfacePorts["screen"] & {
    pointer: ScreenPoint | undefined;
    pixelsPerPoint: number;
    set(displays: readonly DeskDisplay[]): void;
    watchers(): number;
  };
  ipc: SurfacePorts["ipc"] & {
    invoke(channel: string, sender: SenderLike, payload?: unknown): Promise<unknown>;
    emit(channel: string, sender: SenderLike, payload?: unknown): void;
    released: boolean;
  };
  consoles: SurfacePorts["consoles"] & { opened: FakeConsoleWindow[] };
}

export interface FakePortOptions {
  childrenRideWithParent?: boolean;
  helper?: PanesHelper;
}

export function fakeSurfacePorts(options: FakePortOptions = {}) {
  let displays: readonly DeskDisplay[] = [laptop, sideMonitor];
  const watchers = new Set<() => void>();
  const handlers = new Map<string, (sender: SenderLike, payload: unknown) => unknown>();
  const listeners = new Map<string, Array<(sender: SenderLike, payload: unknown) => void>>();
  const opened: FakeConsoleWindow[] = [];
  const ports: FakeSurfacePorts = {
    childrenRideWithParent: options.childrenRideWithParent ?? false,
    helper: options.helper,
    clock: fakeClock(),
    everyFrame: (tick) => {
      const timer = ports.clock.setInterval(tick, glideFrameMs);
      return () => ports.clock.clearInterval(timer);
    },
    screen: {
      pointer: { x: 640, y: 480 },
      pixelsPerPoint: 1,
      pixelsOf: (point) => scaled(point, ports.screen.pixelsPerPoint),
      displays: () => displays,
      displayMatching: (rect) => displays.find((display) => holds(display.bounds, rect)) ?? laptop,
      cursor: () => ports.screen.pointer,
      onChange: (listener) => {
        watchers.add(listener);
        return () => watchers.delete(listener);
      },
      set: (next) => {
        displays = next;
        for (const watcher of [...watchers]) watcher();
      },
      watchers: () => watchers.size,
    },
    consoles: {
      opened,
      of: (sender) => opened.find((console) => console.sender.id === sender.id),
    },
    ipc: {
      released: false,
      handle: (channel, handler) => void handlers.set(channel, handler),
      on: (channel, listener) =>
        void listeners.set(channel, [...(listeners.get(channel) ?? []), listener]),
      release: () => {
        handlers.clear();
        listeners.clear();
        ports.ipc.released = true;
      },
      invoke: async (channel, sender, payload) => {
        const handler = handlers.get(channel);
        if (handler === undefined) throw new Error(`no handler for ${channel}`);
        return handler(sender, payload);
      },
      emit: (channel, sender, payload) => {
        for (const listener of listeners.get(channel) ?? []) listener(sender, payload);
      },
    },
  };
  return ports;
}

export interface SurfaceBench {
  ports: FakeSurfacePorts;
  service: SurfaceService;
  console: FakeConsoleWindow;
  windows: FakeSurfaceWindow[];
  openConsole(): FakeConsoleWindow;
  open(id: SurfaceId, console?: FakeConsoleWindow): FakeSurfaceWindow;
  ask(channel: string, payload?: unknown, console?: FakeConsoleWindow): Promise<unknown>;
  show(request: Partial<SurfaceShow> & { id: SurfaceId }): Promise<unknown>;
}

export const paneBounds: ScreenRect = { x: 1420, y: 120, width: 480, height: 360 };

export function surfaceBench(options: FakePortOptions = {}): SurfaceBench {
  const ports = fakeSurfacePorts(options);
  const service = startSurfaces(ports);
  const windows: FakeSurfaceWindow[] = [];
  let opened = 0;
  const openConsole = (): FakeConsoleWindow => {
    const console = fakeConsoleWindow(++opened);
    ports.consoles.opened.push(console);
    return console;
  };
  const console = openConsole();
  const ask: SurfaceBench["ask"] = (channel, payload, from = console) =>
    ports.ipc.invoke(channel, from.sender, payload);
  return {
    ports,
    service,
    console,
    windows,
    openConsole,
    open: (id, owner = console) => {
      const window = fakeSurfaceWindow(++opened);
      windows.push(window);
      service.adopt(owner, window, id);
      return window;
    },
    ask,
    show: (request) =>
      ask(surfaceChannels.show, {
        bounds: paneBounds,
        origin: "creature",
        focus: false,
        follows: false,
        backdrop: "backdrop-token",
        title: "notes",
        ...request,
      }),
  };
}

export interface FakeHelperPipes extends HelperPipes {
  written: string[];
  killed: boolean;
  jammed: boolean;
  says(line: string): void;
  ends(): void;
}

export function fakeHelperPipes(): FakeHelperPipes {
  const hearing: Array<(line: string) => void> = [];
  const watchingForTheEnd: Array<() => void> = [];
  const pipes: FakeHelperPipes = {
    written: [],
    killed: false,
    jammed: false,
    write: (line) => {
      if (pipes.jammed) throw new Error("write EPIPE");
      pipes.written.push(line);
    },
    onLine: (listener) => void hearing.push(listener),
    onClosed: (listener) => void watchingForTheEnd.push(listener),
    kill: () => {
      pipes.killed = true;
    },
    says: (line) => {
      for (const listener of [...hearing]) listener(line);
    },
    ends: () => {
      for (const listener of [...watchingForTheEnd]) listener();
    },
  };
  return pipes;
}

export const helperParentPid = 4242;

export function readyHelper(pipes: FakeHelperPipes, said: string[] = []): PanesHelper {
  const helper = panesHelper(pipes, helperParentPid, (news) => void said.push(news));
  pipes.says(`ready 1 ${helperParentPid}`);
  return helper;
}

export interface HelperJourney {
  window: string;
  at: ScreenPoint;
  to: ScreenPoint;
}

export interface HelperGlide {
  id: number;
  durationMs: number;
  journeys: HelperJourney[];
}

export function glidesAsked(pipes: FakeHelperPipes): HelperGlide[] {
  return pipes.written.filter((line) => line.startsWith("glide ")).map(glideAsked);
}

export interface HelpedBench extends SurfaceBench {
  pipes: FakeHelperPipes;
  said: string[];
  lastGlide(): HelperGlide;
  helperCarries(glide: HelperGlide, share: number): void;
  helperLands(glide?: HelperGlide): void;
}

export function helpedBench(options: { pixelsPerPoint?: number } = {}): HelpedBench {
  const pipes = fakeHelperPipes();
  const said: string[] = [];
  const bench = surfaceBench({ helper: readyHelper(pipes, said) });
  bench.ports.screen.pixelsPerPoint = options.pixelsPerPoint ?? 1;
  const lastGlide = (): HelperGlide => {
    const glide = glidesAsked(pipes).at(-1);
    if (glide === undefined) throw new Error("the helper was asked for no glide");
    return glide;
  };
  const helperCarries: HelpedBench["helperCarries"] = (glide, share) => {
    for (const { window, at, to } of glide.journeys) {
      const pane = bench.windows.find((candidate) => candidate.nativeHandle() === window);
      pane?.desktopMovesTo(scaled(between(at, to, share), 1 / bench.ports.screen.pixelsPerPoint));
    }
  };
  return {
    ...bench,
    pipes,
    said,
    lastGlide,
    helperCarries,
    helperLands: (glide = lastGlide()) => {
      helperCarries(glide, 1);
      pipes.says(`settled ${glide.id}`);
    },
  };
}

function glideAsked(line: string): HelperGlide {
  const [, id, durationMs, ...journeys] = line.split(" ");
  return { id: Number(id), durationMs: Number(durationMs), journeys: journeys.map(journeyAsked) };
}

function journeyAsked(word: string): HelperJourney {
  const [window = "", points = ""] = word.split("@");
  const [at = "", to = ""] = points.split(">");
  return { window, at: pointAsked(at), to: pointAsked(to) };
}

function pointAsked(text: string): ScreenPoint {
  const [x, y] = text.split(",").map(Number);
  return { x: x ?? Number.NaN, y: y ?? Number.NaN };
}

function between(from: ScreenPoint, to: ScreenPoint, share: number): ScreenPoint {
  return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
}

function scaled(point: ScreenPoint, by: number): ScreenPoint {
  return { x: Math.round(point.x * by), y: Math.round(point.y * by) };
}

function closeRequest(): CloseRequest & { prevented(): boolean } {
  let prevented = false;
  return {
    preventDefault: () => {
      prevented = true;
    },
    prevented: () => prevented,
  };
}

function holds(display: ScreenRect, rect: ScreenRect): boolean {
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  return (
    x >= display.x &&
    x < display.x + display.width &&
    y >= display.y &&
    y < display.y + display.height
  );
}
