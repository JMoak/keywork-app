import type { BrowserWindowConstructorOptions } from "electron";
import type { CompanionConditions, CompanionSnapshot, MenuRequest } from "./channels.ts";
import type { Clock, CompanionPorts, IdleState, MenuActor, SenderLike } from "./companion.ts";
import type { ForegroundState } from "./foreground.ts";
import type { CompanionMenuItem } from "./menu.ts";
import type { DisplayLike, Point, Rect } from "./placement.ts";
import {
  type CompanionPreferences,
  defaultPreferences,
  type PreferencePatch,
  patched,
} from "./preferences.ts";
import type { TransparencyVerdict } from "./presence.ts";
import type { ThermalState } from "./tiers.ts";
import type { CompanionWindowLike } from "./window.ts";

export interface FakeWindow extends CompanionWindowLike {
  options: BrowserWindowConstructorOptions;
  calls: string[];
  sent: Array<[string, unknown]>;
  visible: boolean;
  destroyed: boolean;
  ignores: Array<{ ignore: boolean; forward: boolean | undefined }>;
  emit(event: "ready-to-show" | "closed"): void;
}

export function fakeWindow(options: BrowserWindowConstructorOptions, id: number): FakeWindow {
  let bounds: Rect = {
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
  };
  const listeners = new Map<string, Array<() => void>>();
  const listen = (event: string, listener: () => void): void => {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
  };
  const window: FakeWindow = {
    id,
    options,
    calls: [],
    sent: [],
    visible: false,
    destroyed: false,
    ignores: [],
    webContents: {
      id: id * 10,
      send: (channel, payload) => window.sent.push([channel, payload]),
      getOSProcessId: () => 4000 + id,
      isDestroyed: () => window.destroyed,
    },
    setAlwaysOnTop: (flag, level) => window.calls.push(`setAlwaysOnTop:${flag}:${level}`),
    setIgnoreMouseEvents: (ignore, options) => {
      window.calls.push(`setIgnoreMouseEvents:${ignore}${options?.forward ? ":forward" : ""}`);
      window.ignores.push({ ignore, forward: options?.forward });
    },
    setVisibleOnAllWorkspaces: (visible, options) =>
      window.calls.push(
        `setVisibleOnAllWorkspaces:${visible}:${options?.skipTransformProcessType ?? false}`,
      ),
    showInactive: () => {
      window.calls.push("showInactive");
      window.visible = true;
    },
    hide: () => {
      window.calls.push("hide");
      window.visible = false;
    },
    isVisible: () => window.visible,
    getBounds: () => bounds,
    setBounds: (next) => {
      window.calls.push(`setBounds:${next.x},${next.y},${next.width}x${next.height}`);
      bounds = { ...next };
    },
    setPosition: (x, y) => {
      window.calls.push(`setPosition:${x},${y}`);
      bounds = { ...bounds, x, y };
    },
    isDestroyed: () => window.destroyed,
    destroy: () => {
      window.calls.push("destroy");
      window.destroyed = true;
      window.visible = false;
      window.emit("closed");
    },
    once: (event, listener) => listen(event, listener),
    on: (event, listener) => listen(event, listener),
    emit: (event) => {
      for (const listener of listeners.get(event) ?? []) listener();
    },
  };
  return window;
}

export interface FakeClock extends Clock {
  advance(ms: number): void;
}

export function fakeClock(start = 1_700_000_000_000): FakeClock {
  let now = start;
  interface Timer {
    due: number;
    fn: () => void;
    every: number | undefined;
  }
  const timers = new Set<Timer>();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const timer: Timer = { due: now + ms, fn, every: undefined };
      timers.add(timer);
      return timer;
    },
    clearTimeout: (handle) => timers.delete(handle as Timer),
    setInterval: (fn, ms) => {
      const timer: Timer = { due: now + ms, fn, every: ms };
      timers.add(timer);
      return timer;
    },
    clearInterval: (handle) => timers.delete(handle as Timer),
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = [...timers]
          .filter((timer) => timer.due <= end)
          .sort((a, b) => a.due - b.due)[0];
        if (next === undefined) break;
        now = next.due;
        if (next.every === undefined) timers.delete(next);
        else next.due += next.every;
        next.fn();
      }
      now = end;
    },
  };
}

export const primaryDisplay: DisplayLike = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
};

export const secondDisplay: DisplayLike = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 2560, height: 1440 },
  workArea: { x: 1920, y: 0, width: 2560, height: 1400 },
  scaleFactor: 1.5,
};

export interface FakePortsOptions {
  platform?: NodeJS.Platform;
  wayland?: boolean;
  dev?: boolean;
  prefs?: PreferencePatch;
  displays?: readonly DisplayLike[];
  transparency?: TransparencyVerdict;
  gpu?: string;
  acceptShortcuts?: boolean;
}

export interface FakePorts extends CompanionPorts {
  book: { stored: CompanionPreferences | undefined; writes: number };
  windows: CompanionPorts["windows"] & { created: FakeWindow[] };
  popups: Array<{ at: MenuRequest; items: readonly CompanionMenuItem[]; act: MenuActor }>;
  ipc: CompanionPorts["ipc"] & {
    invoke(channel: string, sender: SenderLike, payload?: unknown): Promise<unknown>;
    emit(channel: string, sender: SenderLike, payload?: unknown): void;
    released: boolean;
  };
  console: CompanionPorts["console"] & {
    sender: SenderLike;
    sent: Array<[string, unknown]>;
    focused: Array<string | undefined>;
  };
  power: CompanionPorts["power"] & {
    lock(): void;
    unlock(): void;
    battery(on: boolean): void;
    thermal(state: ThermalState): void;
    idle: IdleState;
  };
  screen: CompanionPorts["screen"] & {
    set(displays: readonly DisplayLike[]): void;
    pointer: Point | undefined;
  };
  foreground: CompanionPorts["foreground"] & { set(state: ForegroundState): void };
  shortcuts: CompanionPorts["shortcuts"] & { registered: Map<string, () => void> };
  selfTest: CompanionPorts["selfTest"] & {
    verdict: TransparencyVerdict;
    runs: number;
    gpuName: string;
  };
  theme: CompanionPorts["theme"] & { change(): void };
  clock: FakeClock;
  logs: string[];
  petSender(): SenderLike;
}

export function fakePorts(options: FakePortsOptions = {}): FakePorts {
  const book = {
    stored: options.prefs === undefined ? undefined : patched(defaultPreferences, options.prefs),
    writes: 0,
  };
  const created: FakeWindow[] = [];
  const popups: FakePorts["popups"] = [];
  const handlers = new Map<string, (sender: SenderLike, payload: unknown) => unknown>();
  const listeners = new Map<string, Array<(sender: SenderLike, payload: unknown) => void>>();
  const consoleSender = { id: 1 };
  const sent: Array<[string, unknown]> = [];
  const focused: Array<string | undefined> = [];
  const power = listenerSets<"lock" | "unlock" | "battery" | "thermal" | "speed">();
  let displays = options.displays ?? [primaryDisplay, secondDisplay];
  const screenListeners = new Set<() => void>();
  const themeListeners = new Set<() => void>();
  let foregroundListener: ((state: ForegroundState) => void) | undefined;
  const registered = new Map<string, () => void>();
  const logs: string[] = [];

  const ports: FakePorts = {
    platform: options.platform ?? "win32",
    wayland: options.wayland ?? false,
    dev: options.dev ?? false,
    preload: "preload/companion.js",
    book,
    preferences: {
      read: async () => book.stored ?? defaultPreferences,
      write: async (preferences) => {
        book.stored = preferences;
        book.writes += 1;
      },
    },
    windows: {
      created,
      create: (windowOptions) => {
        const window = fakeWindow(windowOptions, created.length + 1);
        created.push(window);
        return window;
      },
      load: async () => undefined,
      popup: (_window, at, items, act) => {
        popups.push({ at, items, act });
      },
    },
    popups,
    ipc: {
      released: false,
      handle: (channel, handler) => handlers.set(channel, handler),
      on: (channel, listener) =>
        listeners.set(channel, [...(listeners.get(channel) ?? []), listener]),
      release: () => {
        handlers.clear();
        listeners.clear();
        ports.ipc.released = true;
      },
      invoke: async (channel, sender, payload) => handlers.get(channel)?.(sender, payload),
      emit: (channel, sender, payload) => {
        for (const listener of listeners.get(channel) ?? []) listener(sender, payload);
      },
    },
    console: {
      sender: consoleSender,
      sent,
      focused,
      isConsole: (sender) => sender.id === consoleSender.id,
      focusThread: (threadId) => {
        focused.push(threadId);
      },
      send: (channel, payload) => {
        sent.push([channel, payload]);
      },
    },
    power: {
      idle: "active",
      onLock: (listener) => power.add("lock", listener),
      onUnlock: (listener) => power.add("unlock", listener),
      onBatteryChange: (listener) => power.add("battery", listener),
      onBattery: () => false,
      idleState: () => ports.power.idle,
      onThermal: (listener) => power.add("thermal", listener),
      onSpeedLimit: (listener) => power.add("speed", listener),
      lock: () => power.fire("lock"),
      unlock: () => power.fire("unlock"),
      battery: (on) => power.fire("battery", on),
      thermal: (state) => power.fire("thermal", state),
    },
    screen: {
      pointer: undefined,
      displays: () => displays,
      cursor: () => ports.screen.pointer,
      onChange: (listener) => {
        screenListeners.add(listener);
        return () => screenListeners.delete(listener);
      },
      set: (next) => {
        displays = next;
        for (const listener of [...screenListeners]) listener();
      },
    },
    theme: {
      reducedTransparency: () => false,
      forcedColors: () => false,
      onChange: (listener) => {
        themeListeners.add(listener);
        return () => themeListeners.delete(listener);
      },
      change: () => {
        for (const listener of [...themeListeners]) listener();
      },
    },
    foreground: {
      start: (onChange) => {
        foregroundListener = onChange;
        return () => {
          foregroundListener = undefined;
        };
      },
      set: (state) => foregroundListener?.(state),
    },
    shortcuts: {
      registered,
      register: (accelerator, handler) => {
        if (options.acceptShortcuts === false) return false;
        registered.set(accelerator, handler);
        return true;
      },
      unregister: (accelerator) => {
        registered.delete(accelerator);
      },
    },
    selfTest: {
      verdict: options.transparency ?? "clear",
      runs: 0,
      gpuName: options.gpu ?? "gpu-a",
      gpu: async () => ports.selfTest.gpuName,
      run: async () => {
        ports.selfTest.runs += 1;
        return {
          verdict: ports.selfTest.verdict,
          why: `the fake capture reads ${ports.selfTest.verdict}`,
        };
      },
    },
    clock: fakeClock(),
    logs,
    log: (line) => {
      logs.push(line);
    },
    petSender: () => {
      const window = created.findLast((candidate) => !candidate.destroyed);
      return { id: window?.webContents.id ?? -1 };
    },
  };
  return ports;
}

export const idleSnapshot: CompanionSnapshot = {
  creature: { name: "pip", hueStop: 1 },
  state: "idle",
  stateLabel: "idle",
  activeThreads: 0,
  finishedUnseen: 0,
  threadId: undefined,
  tool: undefined,
  needsYou: undefined,
};

export const workingSnapshot: CompanionSnapshot = {
  ...idleSnapshot,
  state: "working",
  stateLabel: "working",
  activeThreads: 1,
  threadId: "t1",
  tool: "bash",
};

export const porchSnapshot: CompanionSnapshot = {
  ...workingSnapshot,
  state: "porch",
  stateLabel: "at the porch",
  needsYou: {
    title: "rename the ledger",
    line: "asks to run a command",
    callId: "c1",
    answers: ["approve", "session", "workspace", "deny"],
  },
};

export function lastConditions(window: FakeWindow): CompanionConditions | undefined {
  return window.sent.findLast(([channel]) => channel === "companion:conditions")?.[1] as
    | CompanionConditions
    | undefined;
}

function listenerSets<Name extends string>() {
  const sets = new Map<Name, Set<(payload: unknown) => void>>();
  return {
    add: <Payload>(name: Name, listener: (payload: Payload) => void): (() => void) => {
      const set = sets.get(name) ?? new Set();
      sets.set(name, set);
      const typed = listener as (payload: unknown) => void;
      set.add(typed);
      return () => set.delete(typed);
    },
    fire: (name: Name, payload?: unknown): void => {
      for (const listener of [...(sets.get(name) ?? [])]) listener(payload);
    },
  };
}
