import { cpus } from "node:os";
import { type ElectronApplication, _electron as electron, expect, test } from "@playwright/test";
import { buildHarness, type HarnessBundle } from "./build.ts";
import {
  type CompanionPlatform,
  companionPlatform,
  osInputSkipReason,
  projectSkipReason,
  runnerOf,
} from "./platforms.ts";
import {
  foregroundWindowHandle,
  osClick,
  osMove,
  windowAtPoint,
  windowsInputAvailable,
} from "./win32-input.ts";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Metric {
  cpu: number;
  privateMb: number;
}

interface Reading extends Metric {
  wakeupsPerSecond: number;
}

interface Held {
  companion: Reading;
  stead: Reading;
  steadPaintsPerSecond: number;
  steadVisible: boolean;
}

interface Painted {
  width: number;
  height: number;
}

interface HarnessView {
  companion: {
    presence(): unknown;
    window(): { id: number } | undefined;
    hide(): Promise<void>;
    show(): Promise<void>;
  };
  probe: { id: number };
  stead: { id: number } | undefined;
  selfTest(): Promise<string>;
  sendConditions(patch: unknown): void;
  companionBounds(): Rect | undefined;
  companionPid(): number | undefined;
  steadPid(): number | undefined;
  scaleFactor(): number;
}

type WithHarness = { harness?: HarnessView };

const logicalProcessors = Math.max(1, cpus().length);

let bundle: HarnessBundle;
let app: ElectronApplication;
let restHeld: Held | undefined;

test.beforeAll(async () => {
  const project = test.info().project.name;
  const skipped = projectSkipReason(project, runnerOf(process.platform, process.env));
  test.skip(skipped !== undefined, skipped);
  test.skip(
    project === "perf" && !windowsInputAvailable(),
    "the perf budgets are measured on Windows, beside the user32 probes",
  );
  bundle = buildHarness();
  app = await electron.launch({
    executablePath: bundle.electron,
    args: [bundle.main],
    env: {
      ...definedEnv(),
      COMPANION_HARNESS_PAGE: bundle.pageUrl,
      COMPANION_HARNESS_PRELOAD: bundle.preload,
      COMPANION_HARNESS_STEAD: bundle.steadUrl,
    },
  });
  if (target()?.floats === false) return;
  await expect.poll(() => companionBounds(), { timeout: 30_000 }).not.toBeUndefined();
  await settle(600);
});

test.afterAll(async () => {
  await app?.close();
});

test.describe
  .serial("the floating companion", () => {
    test.beforeEach(() => {
      test.skip(target()?.floats === false, "this session cannot float a window");
    });

    test("shows inactive: the foreground window and the focused window never change", async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const harness = (globalThis as unknown as WithHarness).harness;
        if (harness !== undefined) BrowserWindow.fromId(harness.probe.id)?.focus();
      });
      await settle(400);
      const foregroundBefore = osForeground();
      const focusedBefore = await focusedWindowId();
      await app.evaluate(async () => {
        const harness = (globalThis as unknown as WithHarness).harness;
        if (harness === undefined) return;
        await harness.companion.hide();
        await harness.companion.show();
      });
      await settle(600);
      const companion = await app.evaluate(({ BrowserWindow }) => {
        const window = (globalThis as unknown as WithHarness).harness?.companion.window();
        if (window === undefined) return undefined;
        const native = BrowserWindow.fromId(window.id);
        return { visible: native?.isVisible(), focused: native?.isFocused() };
      });
      expect(companion).toEqual({ visible: true, focused: false });
      expect(await focusedWindowId()).toBe(focusedBefore);
      expect(osForeground()).toBe(foregroundBefore);
    });

    test("a click on a transparent pixel reaches the probe window below", async () => {
      skipWithoutOsInput();
      const bounds = await placeProbeUnderCompanion();
      const scale = await scaleFactor();
      await resetClicks();
      const probe = await probeBounds();
      if (probe === undefined) throw new Error("no probe window");
      const exposed = { x: (probe.x + 10) * scale, y: (probe.y + 10) * scale };
      osMove(exposed.x, exposed.y);
      await desktopReachable(exposed, await probeHandle());
      osClick(exposed.x, exposed.y);
      await settle(300);
      expect(await probeClicks()).toBe(1);
      await resetClicks();
      await raiseCompanion();
      const transparent = { x: (bounds.x + 6) * scale, y: (bounds.y + 6) * scale };
      osMove(transparent.x, transparent.y);
      await settle(300);
      const cursor = await cursorPoint();
      expect(Math.abs(cursor.x - (bounds.x + 6))).toBeLessThanOrEqual(2);
      expect(Math.abs(cursor.y - (bounds.y + 6))).toBeLessThanOrEqual(2);
      const under = windowAtPoint(transparent.x, transparent.y);
      console.log(
        `geometry: companion ${JSON.stringify(bounds)} probe ${JSON.stringify(probe)} scale ${scale} under ${JSON.stringify(under)} probeHandle ${await probeHandle()} companionHandle ${await companionHandle()}`,
      );
      expect(under.handle).toBe(await probeHandle());
      osClick(transparent.x, transparent.y);
      await settle(300);
      expect(await probeClicks()).toBe(1);
      expect(await pageClicks()).toBe(0);
    });

    test("a click on the creature reaches the companion, and the probe keeps the focus", async () => {
      skipWithoutOsInput();
      const bounds = await placeProbeUnderCompanion();
      const scale = await scaleFactor();
      await resetClicks();
      await raiseCompanion();
      const creature = {
        x: (bounds.x + bounds.width / 2) * scale,
        y: (bounds.y + 24 + 104 - 14) * scale,
      };
      osMove(creature.x - 2, creature.y);
      await settle(200);
      osMove(creature.x, creature.y);
      await settle(300);
      await desktopReachable(creature, await companionHandle());
      const foregroundBefore = foregroundWindowHandle();
      osClick(creature.x, creature.y);
      await settle(400);
      expect(await pageClicks()).toBe(1);
      expect(await probeClicks()).toBe(0);
      expect(foregroundWindowHandle()).toBe(foregroundBefore);
    });

    test("the transparency self-test returns a verdict for this machine", async () => {
      const verdict = await app.evaluate(
        () => (globalThis as unknown as WithHarness).harness?.selfTest() ?? "no harness",
      );
      test.info().annotations.push({ type: "transparency", description: verdict });
      console.log(`transparency self-test on this machine: ${verdict}`);
      expect(["clear", "opaque", "unknown"]).toContain(verdict);
    });
  });

test.describe("the Wayland presence fallback", () => {
  test.beforeEach(() => {
    test.skip(target()?.floats !== false, "only a session that cannot float falls back");
  });

  test("the creature lives in the pane with the tray, and no window is created", async () => {
    const seen = await app.evaluate(() => {
      const companion = (globalThis as unknown as WithHarness).harness?.companion;
      return { presence: companion?.presence(), window: companion?.window() !== undefined };
    });
    expect(seen).toEqual({
      presence: {
        mode: "pane",
        window: "none",
        reason: expect.stringContaining("the creature lives in the pane with the tray"),
      },
      window: false,
    });
  });
});

test.describe
  .serial("power tiers with the kid drawn @perf", () => {
    test("the kid is drawn through the skin loader on the stead field and in the companion", async () => {
      expect(await pageValue<string>("window.harnessPage.skin")).toBe("kid");
      expect(await steadValue<string[]>("window.steadPage.skins()")).toEqual(["kid"]);
      expect(await steadValue<number>("window.steadPage.refused()")).toBe(0);
      const painted = await steadValue<Painted>("window.steadPage.painted()");
      expect(painted.width * painted.height).toBeGreaterThan(0);
    });

    test("holds the ambient tier for 60 s under one percent of a core and 16 wakeups a second", async () => {
      await sendConditions({ ceiling: "ambient" });
      const held = await hold(60_000);
      record("ambient", held);
      expect.soft(held.steadVisible).toBe(true);
      expect.soft(held.companion.cpu).toBeLessThan(1);
      expect.soft(held.companion.wakeupsPerSecond).toBeLessThanOrEqual(16);
      expect.soft(held.companion.privateMb).toBeLessThan(80);
      expect.soft(held.stead.cpu).toBeLessThan(1);
      expect.soft(held.stead.wakeupsPerSecond).toBeLessThanOrEqual(16);
    });

    test("holds the rest tier for 60 s under a fifth of a percent of a core and one wakeup a second", async () => {
      await sendConditions({ ceiling: "rest" });
      const held = await hold(60_000);
      restHeld = held;
      record("rest", held);
      expect.soft(held.steadVisible).toBe(true);
      expect.soft(held.companion.cpu).toBeLessThan(0.2);
      expect.soft(held.companion.wakeupsPerSecond).toBeLessThanOrEqual(1);
      expect.soft(held.companion.privateMb).toBeLessThan(80);
      expect.soft(held.stead.cpu).toBeLessThan(1);
      expect.soft(held.stead.wakeupsPerSecond).toBeLessThanOrEqual(16);
    });

    test("the console at rest, stead field and companion together, holds the rest budget", () => {
      if (restHeld === undefined) throw new Error("the rest tier was not held");
      expect(restHeld.companion.cpu + restHeld.stead.cpu).toBeLessThan(0.2);
      expect(restHeld.stead.wakeupsPerSecond).toBeLessThanOrEqual(1);
    });
  });

function target(): CompanionPlatform | undefined {
  return companionPlatform(test.info().project.name);
}

function skipWithoutOsInput(): void {
  const missing = osInputSkipReason(target());
  test.skip(missing !== undefined, missing);
  test.skip(!windowsInputAvailable(), "the OS-level click probes use user32 through PowerShell");
}

function osForeground(): string | undefined {
  return target()?.osInput === "user32" ? foregroundWindowHandle() : undefined;
}

function record(phase: "ambient" | "rest", held: Held): void {
  const line = (reading: Reading): string =>
    `cpu ${reading.cpu.toFixed(2)}% of one core, wakeups ${reading.wakeupsPerSecond.toFixed(1)}/s, private ${reading.privateMb} MB`;
  const measured = `companion ${line(held.companion)}; stead field ${line(held.stead)}, paints ${held.steadPaintsPerSecond.toFixed(1)}/s${held.steadVisible ? "" : " (hidden)"}`;
  test.info().annotations.push({ type: phase, description: measured });
  console.log(`${phase} tier over 60 s: ${measured}`);
}

async function hold(ms: number): Promise<Held> {
  await settle(2000);
  await sampleMetrics();
  const startWakeups = await pageWakeups();
  const startSteadWakes = await steadValue<number>("window.steadPage.wakes()");
  const startSteadPaints = await steadValue<number>("window.steadPage.paints()");
  const started = Date.now();
  const samples: { companion: Metric; stead: Metric }[] = [];
  while (Date.now() - started < ms) {
    await settle(5000);
    samples.push(await sampleMetrics());
  }
  const elapsed = (Date.now() - started) / 1000;
  const wakeups = (await pageWakeups()) - startWakeups;
  const steadWakes = (await steadValue<number>("window.steadPage.wakes()")) - startSteadWakes;
  const steadPaints = (await steadValue<number>("window.steadPage.paints()")) - startSteadPaints;
  return {
    companion: readingOf(
      samples.map((sample) => sample.companion),
      wakeups / elapsed,
    ),
    stead: readingOf(
      samples.map((sample) => sample.stead),
      steadWakes / elapsed,
    ),
    steadPaintsPerSecond: steadPaints / elapsed,
    steadVisible: await steadValue<boolean>("window.steadPage.visible()"),
  };
}

function readingOf(samples: readonly Metric[], wakeupsPerSecond: number): Reading {
  return {
    cpu: samples.reduce((sum, sample) => sum + sample.cpu, 0) / samples.length,
    privateMb: Math.max(...samples.map((sample) => sample.privateMb)),
    wakeupsPerSecond,
  };
}

async function sampleMetrics(): Promise<{ companion: Metric; stead: Metric }> {
  const machineWide = await app.evaluate(({ app: electronApp }) => {
    const harness = (globalThis as unknown as WithHarness).harness;
    const metrics = electronApp.getAppMetrics();
    const metricOf = (pid: number | undefined) => {
      const metric = metrics.find((candidate) => candidate.pid === pid);
      return {
        cpu: metric?.cpu.percentCPUUsage ?? 0,
        privateMb: Math.round(
          (metric?.memory.privateBytes ?? metric?.memory.workingSetSize ?? 0) / 1024,
        ),
      };
    };
    return { companion: metricOf(harness?.companionPid()), stead: metricOf(harness?.steadPid()) };
  });
  return { companion: perCore(machineWide.companion), stead: perCore(machineWide.stead) };
}

function perCore(machineWide: Metric): Metric {
  return { ...machineWide, cpu: machineWide.cpu * logicalProcessors };
}

function sendConditions(patch: Record<string, unknown>): Promise<void> {
  return app.evaluate((_electron, conditions) => {
    (globalThis as unknown as WithHarness).harness?.sendConditions(conditions);
  }, patch);
}

function companionBounds(): Promise<Rect | undefined> {
  return app.evaluate(() => (globalThis as unknown as WithHarness).harness?.companionBounds());
}

function scaleFactor(): Promise<number> {
  return app.evaluate(() => (globalThis as unknown as WithHarness).harness?.scaleFactor() ?? 1);
}

async function placeProbeUnderCompanion(): Promise<Rect> {
  const bounds = await companionBounds();
  if (bounds === undefined) throw new Error("no companion window");
  await app.evaluate(({ BrowserWindow }, rect) => {
    const harness = (globalThis as unknown as WithHarness).harness;
    if (harness === undefined) return;
    BrowserWindow.fromId(harness.probe.id)?.setBounds({
      x: rect.x - 60,
      y: rect.y - 60,
      width: rect.width + 120,
      height: rect.height + 120,
    });
  }, bounds);
  await settle(300);
  return bounds;
}

async function resetClicks(): Promise<void> {
  await app.evaluate(async ({ BrowserWindow }) => {
    const harness = (globalThis as unknown as WithHarness).harness;
    if (harness === undefined) return;
    await BrowserWindow.fromId(harness.probe.id)?.webContents.executeJavaScript(
      "window.clicks = 0",
    );
    const companion = harness.companion.window();
    if (companion !== undefined) {
      await BrowserWindow.fromId(companion.id)?.webContents.executeJavaScript(
        "window.harnessPage.clicks = 0",
      );
    }
  });
}

function probeClicks(): Promise<number> {
  return app.evaluate(async ({ BrowserWindow }) => {
    const harness = (globalThis as unknown as WithHarness).harness;
    if (harness === undefined) return -1;
    return (await BrowserWindow.fromId(harness.probe.id)?.webContents.executeJavaScript(
      "window.clicks",
    )) as number;
  });
}

function pageClicks(): Promise<number> {
  return pageValue<number>("window.harnessPage.clicks");
}

function pageWakeups(): Promise<number> {
  return pageValue<number>("window.harnessPage.wakeups()");
}

function pageValue<T>(expression: string): Promise<T> {
  return app.evaluate(async ({ BrowserWindow }, code) => {
    const companion = (globalThis as unknown as WithHarness).harness?.companion.window();
    if (companion === undefined) return undefined;
    return BrowserWindow.fromId(companion.id)?.webContents.executeJavaScript(code);
  }, expression) as Promise<T>;
}

function steadValue<T>(expression: string): Promise<T> {
  return app.evaluate(async ({ BrowserWindow }, code) => {
    const stead = (globalThis as unknown as WithHarness).harness?.stead;
    if (stead === undefined) return undefined;
    return BrowserWindow.fromId(stead.id)?.webContents.executeJavaScript(code);
  }, expression) as Promise<T>;
}

function probeHandle(): Promise<string | undefined> {
  return app.evaluate(({ BrowserWindow }) => {
    const harness = (globalThis as unknown as WithHarness).harness;
    if (harness === undefined) return undefined;
    return BrowserWindow.fromId(harness.probe.id)
      ?.getNativeWindowHandle()
      .readBigUInt64LE(0)
      .toString();
  });
}

async function desktopReachable(
  point: { x: number; y: number },
  expectedHandle: string | undefined,
): Promise<void> {
  const under = windowAtPoint(point.x, point.y);
  const ours = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) =>
      window.getNativeWindowHandle().readBigUInt64LE(0).toString(),
    ),
  );
  test.skip(
    !ours.includes(under.handle),
    `the desktop is covered at ${JSON.stringify(point)} by ${under.className} (pid ${under.pid}), so OS input cannot reach the probe`,
  );
  expect(under.handle).toBe(expectedHandle);
}

async function raiseCompanion(): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const window = (globalThis as unknown as WithHarness).harness?.companion.window();
    if (window !== undefined) BrowserWindow.fromId(window.id)?.setAlwaysOnTop(true, "floating");
  });
  await settle(200);
}

function companionHandle(): Promise<string | undefined> {
  return app.evaluate(({ BrowserWindow }) => {
    const window = (globalThis as unknown as WithHarness).harness?.companion.window();
    if (window === undefined) return undefined;
    return BrowserWindow.fromId(window.id)?.getNativeWindowHandle().readBigUInt64LE(0).toString();
  });
}

function focusedWindowId(): Promise<number | undefined> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.id);
}

function cursorPoint(): Promise<{ x: number; y: number }> {
  return app.evaluate(({ screen }) => screen.getCursorScreenPoint());
}

function probeBounds(): Promise<Rect | undefined> {
  return app.evaluate(({ BrowserWindow }) => {
    const harness = (globalThis as unknown as WithHarness).harness;
    return harness === undefined ? undefined : BrowserWindow.fromId(harness.probe.id)?.getBounds();
  });
}

function definedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
  );
}

function settle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
