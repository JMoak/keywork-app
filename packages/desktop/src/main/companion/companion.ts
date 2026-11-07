import type { ProductProfile } from "@keywork-app/product";
import type { BrowserWindowConstructorOptions } from "electron";
import {
  type AnswerRequest,
  type CompanionConditions,
  type CompanionSnapshot,
  companionChannels,
  type DragDelta,
  type HitMask,
  type MenuRequest,
  type NudgeStep,
  type Presence,
  type Tier,
} from "./channels.ts";
import { type SamplerPorts, startCpuSampler } from "./cpu-sampler.ts";
import type { ForegroundProbe } from "./foreground.ts";
import { type CompanionMenuAction, type CompanionMenuItem, companionMenu } from "./menu.ts";
import { type Mover, windowMover } from "./mover.ts";
import { type DisplayLike, type Point, restoreBounds } from "./placement.ts";
import {
  type CompanionPreferences,
  type PreferenceBook,
  type PreferencePatch,
  patched,
  type StoredPosition,
} from "./preferences.ts";
import {
  type PresenceController,
  presenceController,
  restingInputs,
  type TransparencyVerdict,
} from "./presence.ts";
import { type SelfTestReading, selfTestNeeded } from "./self-test.ts";
import { waylandFallbackReason, waylandNotice } from "./session.ts";
import { type ShortcutKeeper, type ShortcutPort, shortcutKeeper } from "./shortcut.ts";
import {
  calmContext,
  ceilingFor,
  firstPaintBudgetMs,
  idlePollEveryMs,
  idlePollSeconds,
  type ThermalState,
  type TierContext,
} from "./tiers.ts";
import {
  type CompanionWindowLike,
  companionWindowOptions,
  ignoreOptions,
  keyboardReachable,
  prepareFloating,
  windowSizeFor,
} from "./window.ts";

export interface SenderLike {
  id: number;
}

export interface IpcPort {
  handle(channel: string, handler: (sender: SenderLike, payload: unknown) => unknown): void;
  on(channel: string, listener: (sender: SenderLike, payload: unknown) => void): void;
  release(): void;
}

export interface ScreenPort {
  displays(): readonly DisplayLike[];
  cursor(): Point | undefined;
  onChange(listener: () => void): () => void;
}

export type IdleState = "active" | "idle" | "locked" | "unknown";

export interface PowerPort {
  onLock(listener: () => void): () => void;
  onUnlock(listener: () => void): () => void;
  onBatteryChange(listener: (onBattery: boolean) => void): () => void;
  onBattery(): boolean;
  idleState(seconds: number): IdleState;
  onThermal(listener: (state: ThermalState) => void): () => void;
  onSpeedLimit(listener: (limit: number) => void): () => void;
}

export interface ThemePort {
  reducedTransparency(): boolean;
  forcedColors(): boolean;
  onChange(listener: () => void): () => void;
}

export interface ConsolePort {
  isConsole(sender: SenderLike): boolean;
  focusThread(threadId: string | undefined): void;
  send(channel: string, payload: unknown): void;
}

export interface SelfTestPort {
  gpu(): Promise<string>;
  run(window: CompanionWindowLike): Promise<SelfTestReading>;
}

export type MenuActor = (action: CompanionMenuAction, payload?: string) => void;

export interface WindowPort {
  create(options: BrowserWindowConstructorOptions): CompanionWindowLike;
  load(window: CompanionWindowLike): Promise<void>;
  popup(
    window: CompanionWindowLike,
    at: MenuRequest,
    items: readonly CompanionMenuItem[],
    act: MenuActor,
  ): void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface CompanionPorts {
  profile?: ProductProfile;
  platform: NodeJS.Platform;
  wayland: boolean;
  dev: boolean;
  preload: string;
  preferences: PreferenceBook;
  windows: WindowPort;
  screen: ScreenPort;
  power: PowerPort;
  theme: ThemePort;
  foreground: ForegroundProbe;
  shortcuts: ShortcutPort;
  selfTest: SelfTestPort;
  console: ConsolePort;
  ipc: IpcPort;
  clock: Clock;
  log(line: string): void;
  metrics?: Pick<SamplerPorts, "mainUsage" | "metrics" | "logicalProcessors"> | undefined;
}

export interface CompanionService {
  presence(): Presence;
  preferences(): CompanionPreferences;
  setPreferences(patch: PreferencePatch): Promise<CompanionPreferences>;
  show(): Promise<void>;
  hide(): Promise<void>;
  toggle(): Promise<void>;
  publish(snapshot: CompanionSnapshot): void;
  snapshot(): CompanionSnapshot | undefined;
  window(): CompanionWindowLike | undefined;
  onPresenceChanged(listener: (presence: Presence) => void): () => void;
  settle(): Promise<void>;
  dispose(): void;
}

export const cursorNearDip = 64;
export const cursorPollNearMs = 33;
export const cursorPollFarMs = 500;
export const warmAfterLaunchMs = 5000;

export async function startCompanion(ports: CompanionPorts): Promise<CompanionService> {
  const launchedAt = ports.clock.now();
  const prefs = await ports.preferences.read();
  const runtime = new CompanionRuntime(ports, prefs, prefs.selfTest?.result ?? "unknown");
  runtime.start(launchedAt);
  await runtime.settle();
  return runtime.service();
}

interface WakeupReport {
  count: number;
  tier: Tier;
}

type MouseMode = "interactive" | "forwarding" | "deaf";

class CompanionRuntime {
  readonly ports: CompanionPorts;
  readonly controller: PresenceController;
  readonly keeper: ShortcutKeeper;
  readonly presenceListeners = new Set<(presence: Presence) => void>();
  prefs: CompanionPreferences;
  context: TierContext;
  window: CompanionWindowLike | undefined;
  mover: Mover | undefined;
  latest: CompanionSnapshot | undefined;
  mask: HitMask | undefined;
  mouse: MouseMode = "forwarding";
  wakeups = 0;
  rendererTier: Tier = "hidden";
  askedToShowAt: number | undefined;
  pagePainted = false;
  paintReported = false;
  warmTimer: unknown;
  prewarmed = false;
  selfTestOnCreate = false;
  untestedWindow = false;
  waylandSaid = false;
  queue: Promise<void> = Promise.resolve();
  whileArmed: Array<() => void> = [];
  whileWindow: Array<() => void> = [];

  constructor(
    ports: CompanionPorts,
    prefs: CompanionPreferences,
    transparency: TransparencyVerdict,
  ) {
    this.ports = ports;
    this.prefs = prefs;
    this.keeper = shortcutKeeper(ports.shortcuts);
    this.context = { ...calmContext, windowShown: false, onBattery: ports.power.onBattery() };
    this.controller = presenceController({
      ...restingInputs,
      ...presenceInputsOf(prefs),
      wayland: ports.wayland,
      transparency,
    });
  }

  start(launchedAt: number): void {
    this.registerIpc();
    this.controller.onChange((presence) => {
      this.ports.console.send(companionChannels.presenceChanged, presence);
      for (const listener of [...this.presenceListeners]) listener(presence);
      this.sayWaylandOnce(presence);
      this.enqueue(() => this.apply(presence));
    });
    this.sayWaylandOnce(this.controller.presence());
    if (this.prefs.enabled) this.arm();
    if (this.controller.presence().window === "shown") this.askedToShowAt = launchedAt;
    this.enqueue(() => this.apply(this.controller.presence()));
    this.enqueue(() => this.recheckTransparency());
    this.warmTimer = this.ports.clock.setTimeout(
      () => this.enqueue(() => this.warm()),
      warmAfterLaunchMs,
    );
  }

  service(): CompanionService {
    return {
      presence: () => this.controller.presence(),
      preferences: () => this.prefs,
      setPreferences: (patch) => this.setPreferences(patch),
      show: () => this.setHidden(false),
      hide: () => this.setHidden(true),
      toggle: () => this.setHidden(!this.prefs.hidden),
      publish: (snapshot) => this.publish(snapshot),
      snapshot: () => this.latest,
      window: () => this.window,
      onPresenceChanged: (listener) => {
        this.presenceListeners.add(listener);
        return () => this.presenceListeners.delete(listener);
      },
      settle: () => this.settle(),
      dispose: () => this.dispose(),
    };
  }

  async settle(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = this.queue;
      await seen;
    } while (seen !== this.queue);
  }

  async recheckTransparency(): Promise<void> {
    const gpu = await this.ports.selfTest.gpu();
    if (selfTestNeeded(this.prefs.selfTest, gpu)) {
      this.controller.update({ transparency: "unknown" });
    }
  }

  sayWaylandOnce(presence: Presence): void {
    if (this.waylandSaid || presence.reason !== waylandFallbackReason) return;
    this.waylandSaid = true;
    this.ports.log(waylandNotice);
  }

  enqueue(step: () => Promise<void> | void): void {
    this.queue = this.queue.then(step).catch((cause) => this.ports.log(`companion: ${cause}`));
  }

  async setHidden(hidden: boolean): Promise<void> {
    await this.setPreferences({ hidden });
  }

  async setPreferences(patch: PreferencePatch): Promise<CompanionPreferences> {
    let next = this.prefs;
    this.enqueue(async () => {
      const previous = this.prefs;
      next = patched(previous, patch);
      await this.ports.preferences.write(next);
      this.prefs = next;
      const turnedOn = next.enabled && !previous.enabled;
      if (turnedOn) this.arm();
      if (!next.enabled && previous.enabled) this.disarm();
      if (next.enabled) this.applyShortcut();
      if (turnedOn) this.selfTestOnCreate = true;
      this.controller.update({
        ...presenceInputsOf(next),
        ...(turnedOn && { transparency: "unknown" as const }),
      });
      this.coolUnwantedWindow();
      this.mover?.fit();
      this.sendConditions();
    });
    await this.settle();
    return next;
  }

  publish(snapshot: CompanionSnapshot): void {
    const grows = this.needsBubble(snapshot) !== this.latestNeedsBubble();
    this.latest = snapshot;
    this.controller.update({ busyNow: snapshot.state !== "idle" });
    this.enqueue(() => {
      if (grows) this.mover?.fit();
      this.sendSnapshot();
    });
  }

  sendSnapshot(): void {
    const window = this.window;
    if (window === undefined || this.latest === undefined || !this.context.windowShown) return;
    window.webContents.send(companionChannels.snapshot, this.latest);
  }

  needsBubble(snapshot: CompanionSnapshot): boolean {
    const waiting = snapshot.needsYou !== undefined || snapshot.heldChore !== undefined;
    return waiting && !this.prefs.quiet;
  }

  latestNeedsBubble(): boolean {
    return this.latest === undefined ? false : this.needsBubble(this.latest);
  }

  arm(): void {
    const { power, screen, theme } = this.ports;
    this.whileArmed = [
      power.onLock(() => this.setContext({ locked: true })),
      power.onUnlock(() => this.setContext({ locked: false })),
      power.onBatteryChange((onBattery) => this.setContext({ onBattery })),
      power.onThermal((thermal) => this.setContext({ thermal })),
      power.onSpeedLimit((speedLimit) => this.setContext({ speedLimit })),
      screen.onChange(() => this.onDisplaysChanged()),
      theme.onChange(() => this.enqueue(() => this.sendConditions())),
    ];
    this.applyShortcut();
  }

  onDisplaysChanged(): void {
    this.enqueue(() => this.mover?.rehome());
    this.enqueue(() => this.retestInconclusive());
  }

  async retestInconclusive(): Promise<void> {
    const window = this.window;
    if (window === undefined || this.controller.inputs().transparency !== "unknown") return;
    this.selfTestOnCreate = true;
    if (!(await this.passesSelfTest(window))) return;
    if (this.controller.presence().window === "shown" && !window.isVisible()) {
      window.showInactive();
    }
  }

  disarm(): void {
    for (const stop of this.whileArmed) stop();
    this.whileArmed = [];
    this.keeper.release();
  }

  applyShortcut(): void {
    const standing = this.keeper.apply(
      this.prefs.shortcut,
      () => void this.setHidden(!this.prefs.hidden),
    );
    if (standing.reason !== undefined) this.ports.log(`companion shortcut: ${standing.reason}`);
  }

  setContext(patch: Partial<TierContext>): void {
    this.context = { ...this.context, ...patch };
    this.controller.update({
      locked: this.context.locked,
      foregroundBusy: this.context.foregroundBusy,
    });
    this.enqueue(() => this.sendConditions());
  }

  async apply(presence: Presence): Promise<void> {
    switch (presence.window) {
      case "shown":
        return this.showWindow();
      case "tucked":
        return this.tuckWindow();
      case "none":
        return this.destroyWindow();
    }
  }

  async showWindow(): Promise<void> {
    this.askedToShowAt ??= this.ports.clock.now();
    if (this.window === undefined) await this.createWindow();
    const window = this.window;
    if (window === undefined || this.controller.presence().window !== "shown") return;
    this.context = { ...this.context, windowShown: true };
    this.sendConditions();
    this.sendSnapshot();
    if (this.whileWindow.length === 0) this.watch();
    if (this.prewarmed) this.mover?.rehome();
    this.prewarmed = false;
    if (!window.isVisible()) window.showInactive();
    this.reportPaint();
    this.setMouse("forwarding");
    if (!this.untestedWindow) return;
    this.untestedWindow = false;
    await this.passesSelfTest(window);
  }

  tuckWindow(): void {
    if (this.window === undefined) return;
    this.context = { ...this.context, windowShown: false };
    this.wakeups = 0;
    this.sendConditions();
    this.setMouse("deaf");
    this.window.hide();
  }

  async warm(): Promise<void> {
    if (this.window !== undefined || this.controller.presence().window === "shown") return;
    if (!this.warmWanted()) return;
    await this.createWindow();
    this.prewarmed = true;
    this.sendConditions();
  }

  warmWanted(): boolean {
    const optInPending = !this.prefs.enabled && !this.prefs.optInOffered;
    return this.couldFloat() && (this.prefs.enabled || optInPending);
  }

  couldFloat(): boolean {
    const { wayland, transparency } = this.controller.inputs();
    const opaque = this.prefs.enabled && transparency === "opaque";
    return this.prefs.mode === "floating" && !wayland && !opaque;
  }

  coolUnwantedWindow(): void {
    const window = this.window;
    if (window === undefined || window.isVisible() || this.couldFloat()) return;
    if (this.controller.presence().window === "none") this.destroyWindow();
  }

  async createWindow(): Promise<void> {
    const screen = this.ports.screen;
    const bounds = restoreBounds(
      this.prefs.positions,
      screen.displays(),
      this.wantedSize(),
      screen.cursor(),
    );
    const window = this.ports.windows.create(
      companionWindowOptions({
        platform: this.ports.platform,
        bounds,
        preload: this.ports.preload,
        ...(this.ports.profile !== undefined && { profile: this.ports.profile }),
      }),
    );
    this.window = window;
    prepareFloating(window, this.ports.platform);
    window.on("closed", () => {
      if (this.window === window) this.forgetWindow();
    });
    this.untestedWindow = true;
    this.mover = windowMover(window, {
      displays: () => screen.displays(),
      cursor: () => screen.cursor(),
      positions: () => this.prefs.positions,
      remember: (position) => void this.remember(position),
      size: () => this.wantedSize(),
    });
    await this.ports.windows.load(window);
  }

  watch(): void {
    this.whileWindow = [
      this.ports.foreground.start((state) => this.setContext({ foregroundBusy: state === "busy" })),
      this.startIdlePoll(),
      this.startCursorPoll(),
      this.startSampler(),
    ];
  }

  wantedSize() {
    return windowSizeFor(this.prefs.size, { bubble: this.latestNeedsBubble() });
  }

  async passesSelfTest(window: CompanionWindowLike): Promise<boolean> {
    const gpu = await this.ports.selfTest.gpu();
    const forced = this.selfTestOnCreate;
    this.selfTestOnCreate = false;
    if (!forced && !selfTestNeeded(this.prefs.selfTest, gpu)) {
      return this.prefs.selfTest?.result !== "opaque";
    }
    const reading = await this.ports.selfTest.run(window);
    const result = reading.verdict;
    this.ports.log(`companion: transparency self-test ${result}: ${reading.why}`);
    const at = new Date(this.ports.clock.now()).toISOString();
    this.prefs = patched(this.prefs, { selfTest: { result, gpu, at } });
    await this.ports.preferences.write(this.prefs);
    this.controller.update({ transparency: result });
    if (result !== "opaque") return true;
    this.ports.log("companion: transparency self-test failed; the creature lives in the pane");
    this.destroyWindow();
    return false;
  }

  destroyWindow(): void {
    const window = this.window;
    if (window === undefined) return;
    this.setMouse("deaf");
    this.forgetWindow();
    if (!window.isDestroyed()) window.destroy();
  }

  forgetWindow(): void {
    for (const stop of this.whileWindow) stop();
    this.whileWindow = [];
    this.window = undefined;
    this.mover = undefined;
    this.mask = undefined;
    this.askedToShowAt = undefined;
    this.prewarmed = false;
    this.pagePainted = false;
    this.paintReported = false;
    this.mouse = "forwarding";
    this.context = { ...this.context, windowShown: false, foregroundBusy: false };
    this.controller.update({ foregroundBusy: false });
  }

  async remember(position: StoredPosition): Promise<void> {
    await this.setPreferences({
      positions: { ...this.prefs.positions, [position.layoutKey]: position },
    });
  }

  conditions(): CompanionConditions {
    return {
      ceiling: ceilingFor(this.context),
      onBattery: this.context.onBattery,
      scale: this.prefs.size,
      still: this.prefs.still,
      quiet: this.prefs.quiet,
      motion: this.prefs.motion,
      reducedTransparency: this.ports.theme.reducedTransparency(),
      forcedColors: this.ports.theme.forcedColors(),
      keyboardReachable: keyboardReachable(this.ports.platform),
      wantsMask: this.ports.platform === "linux" && !this.ports.wayland,
    };
  }

  sendConditions(): void {
    const window = this.window;
    if (window === undefined || window.webContents.isDestroyed()) return;
    window.webContents.send(companionChannels.conditions, this.conditions());
  }

  setInteractive(inside: boolean): void {
    if (this.mouse === "deaf") return;
    if (!inside && this.mover?.dragging()) return;
    this.setMouse(inside ? "interactive" : "forwarding");
  }

  setMouse(mode: MouseMode): void {
    const window = this.window;
    if (window === undefined || mode === this.mouse) return;
    this.mouse = mode;
    if (mode === "interactive") window.setIgnoreMouseEvents(false);
    else if (mode === "forwarding") {
      window.setIgnoreMouseEvents(true, ignoreOptions(this.ports.platform));
    } else window.setIgnoreMouseEvents(true);
  }

  startIdlePoll(): () => void {
    const timer = this.ports.clock.setInterval(() => {
      const idle = this.ports.power.idleState(idlePollSeconds) === "idle";
      if (idle !== this.context.systemIdle) this.setContext({ systemIdle: idle });
    }, idlePollEveryMs);
    return () => this.ports.clock.clearInterval(timer);
  }

  startCursorPoll(): () => void {
    if (this.ports.platform !== "linux" || this.ports.wayland) return () => undefined;
    let handle: unknown;
    const poll = (): void => {
      const window = this.window;
      const cursor = this.ports.screen.cursor();
      if (window === undefined || cursor === undefined) return;
      const bounds = window.getBounds();
      const near = withinMargin(cursor, bounds, cursorNearDip);
      this.setInteractive(near && maskHit(this.mask, cursor.x - bounds.x, cursor.y - bounds.y));
      handle = this.ports.clock.setTimeout(poll, near ? cursorPollNearMs : cursorPollFarMs);
    };
    handle = this.ports.clock.setTimeout(poll, cursorPollFarMs);
    return () => this.ports.clock.clearTimeout(handle);
  }

  startSampler(): () => void {
    const metrics = this.ports.metrics;
    if (!this.ports.dev || metrics === undefined) return () => undefined;
    return startCpuSampler({
      every: (ms, beat) => {
        const timer = this.ports.clock.setInterval(beat, ms);
        return () => this.ports.clock.clearInterval(timer);
      },
      mainUsage: () => metrics.mainUsage(),
      metrics: () => metrics.metrics(),
      logicalProcessors: () => metrics.logicalProcessors(),
      rendererPid: () => this.window?.webContents.getOSProcessId(),
      tier: () => (ceilingFor(this.context) === "hidden" ? "hidden" : this.rendererTier),
      wakeupsSinceLast: () => {
        const count = this.wakeups;
        this.wakeups = 0;
        return count;
      },
      log: this.ports.log,
    });
  }

  registerIpc(): void {
    const { ipc } = this.ports;
    const console = this.consoleOnly.bind(this);
    const pet = this.petOnly.bind(this);
    ipc.on(
      companionChannels.publish,
      console((snapshot: CompanionSnapshot) => this.publish(snapshot)),
    );
    ipc.handle(
      companionChannels.preferences,
      console(() => this.prefs),
    );
    ipc.handle(
      companionChannels.setPreferences,
      console((patch: PreferencePatch) => this.setPreferences(patch)),
    );
    ipc.handle(
      companionChannels.presence,
      console(() => this.controller.presence()),
    );
    ipc.handle(
      companionChannels.show,
      console(() => this.setHidden(false)),
    );
    ipc.handle(
      companionChannels.hide,
      console(() => this.setHidden(true)),
    );
    ipc.on(
      companionChannels.interactive,
      pet((inside: boolean) => this.setInteractive(inside === true)),
    );
    ipc.on(
      companionChannels.mask,
      pet((mask: HitMask) => this.keepMask(mask)),
    );
    ipc.on(
      companionChannels.drag,
      pet((delta: DragDelta) => this.drag(delta)),
    );
    ipc.on(
      companionChannels.dragEnd,
      pet(() => this.mover?.endDrag()),
    );
    ipc.on(
      companionChannels.nudge,
      pet((step: NudgeStep) => this.mover?.nudge(step)),
    );
    ipc.on(
      companionChannels.home,
      pet(() => this.mover?.home()),
    );
    ipc.on(
      companionChannels.menu,
      pet((at: MenuRequest) => this.openMenu(at)),
    );
    ipc.on(
      companionChannels.open,
      pet((threadId: string | undefined) => this.openConsole(threadId)),
    );
    ipc.on(
      companionChannels.answer,
      pet((request: AnswerRequest) => this.forwardAnswer(request)),
    );
    ipc.on(
      companionChannels.ready,
      pet(() => this.notePaint()),
    );
    ipc.on(
      companionChannels.wakeups,
      pet((report: WakeupReport) => this.countWakeups(report)),
    );
  }

  consoleOnly<Payload>(act: (payload: Payload) => unknown) {
    return (sender: SenderLike, payload: unknown): unknown =>
      this.ports.console.isConsole(sender) ? act(payload as Payload) : undefined;
  }

  petOnly<Payload>(act: (payload: Payload) => unknown) {
    return (sender: SenderLike, payload: unknown): unknown =>
      sender.id === this.window?.webContents.id ? act(payload as Payload) : undefined;
  }

  keepMask(mask: HitMask): void {
    this.mask = mask;
  }

  drag(delta: DragDelta): void {
    this.setInteractive(true);
    this.mover?.drag(delta);
  }

  forwardAnswer(request: AnswerRequest): void {
    this.ports.console.send(companionChannels.answerRequested, request);
  }

  countWakeups(report: WakeupReport): void {
    this.wakeups += report.count;
    this.rendererTier = report.tier;
  }

  openMenu(at: MenuRequest): void {
    const window = this.window;
    if (window === undefined) return;
    const items = companionMenu({
      still: this.prefs.still,
      quiet: this.prefs.quiet,
      size: this.prefs.size,
      creatures: residentsOf(this.latest),
      current: this.latest?.creature.slug ?? this.latest?.creature.name,
    });
    this.ports.windows.popup(
      window,
      at,
      items,
      (action, payload) => void this.act(action, payload),
    );
  }

  async act(action: CompanionMenuAction, payload?: string): Promise<void> {
    switch (action) {
      case "open":
        return this.openConsole(undefined);
      case "hide":
        await this.setHidden(true);
        return;
      case "still":
        await this.setPreferences({ still: !this.prefs.still });
        return;
      case "quiet":
        await this.setPreferences({ quiet: !this.prefs.quiet });
        return;
      case "size":
        await this.setPreferences({ size: Number(payload) });
        return;
      case "switch-creature":
        this.ports.console.send(companionChannels.switchRequested, payload);
        return;
      case "settings":
        this.ports.console.send(companionChannels.settingsRequested, undefined);
        this.ports.console.focusThread(undefined);
    }
  }

  openConsole(threadId: string | undefined): void {
    const target = threadId ?? this.latest?.threadId;
    this.ports.console.focusThread(target);
    this.ports.console.send(companionChannels.openRequested, target);
  }

  notePaint(): void {
    this.pagePainted = true;
    this.reportPaint();
  }

  reportPaint(): void {
    const askedAt = this.askedToShowAt;
    if (askedAt === undefined || !this.pagePainted || this.paintReported) return;
    if (this.window?.isVisible() !== true) return;
    this.paintReported = true;
    const elapsed = this.ports.clock.now() - askedAt;
    const verdict = elapsed <= firstPaintBudgetMs ? "within" : "OVER";
    this.ports.log(`companion painted in ${elapsed} ms (${verdict} ${firstPaintBudgetMs} ms)`);
  }

  dispose(): void {
    this.ports.clock.clearTimeout(this.warmTimer);
    this.disarm();
    this.destroyWindow();
    this.ports.ipc.release();
    this.presenceListeners.clear();
  }
}

function presenceInputsOf(prefs: CompanionPreferences) {
  return {
    enabled: prefs.enabled,
    preferred: prefs.mode,
    hidden: prefs.hidden,
    onlyWhileBusy: prefs.onlyWhileBusy,
  };
}

function withinMargin(
  point: Point,
  bounds: { x: number; y: number; width: number; height: number },
  margin: number,
): boolean {
  return (
    point.x >= bounds.x - margin &&
    point.x < bounds.x + bounds.width + margin &&
    point.y >= bounds.y - margin &&
    point.y < bounds.y + bounds.height + margin
  );
}

function maskHit(mask: HitMask | undefined, x: number, y: number): boolean {
  if (mask === undefined) return false;
  const column = Math.floor(x);
  const row = Math.floor(y);
  if (column < 0 || row < 0 || column >= mask.width || row >= mask.height) return false;
  return (mask.bits[row * mask.width + column] ?? 0) !== 0;
}

function residentsOf(
  snapshot: CompanionSnapshot | undefined,
): readonly { slug: string; name: string }[] {
  if (snapshot === undefined) return [];
  const listed = snapshot.residents ?? [snapshot.creature];
  return listed.map((resident) => ({
    slug: resident.slug ?? resident.name,
    name: resident.name,
  }));
}
