import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, screen } from "electron";
import type { CompanionConditions } from "../channels.ts";
import { type CompanionService, startCompanion } from "../companion.ts";
import { electronCompanionPorts, whenPainted } from "../electron.ts";
import { noForegroundProbe } from "../foreground.ts";
import type { TransparencyVerdict } from "../presence.ts";

export interface Harness {
  companion: CompanionService;
  probe: BrowserWindow;
  stead: BrowserWindow | undefined;
  selfTest(): Promise<TransparencyVerdict>;
  sendConditions(patch: Partial<CompanionConditions>): void;
  companionBounds(): Electron.Rectangle | undefined;
  companionPid(): number | undefined;
  steadPid(): number | undefined;
  scaleFactor(): number;
}

const pageUrl = process.env.COMPANION_HARNESS_PAGE ?? "about:blank";
const preload = process.env.COMPANION_HARNESS_PRELOAD ?? "";
const steadUrl = process.env.COMPANION_HARNESS_STEAD;
const selfDrive = process.env.COMPANION_HARNESS_SELFDRIVE === "1";
const lifetimeMs = Number(process.env.COMPANION_HARNESS_TTL_MS ?? 10 * 60 * 1000);

const probePage = `data:text/html,${encodeURIComponent(
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:Highlight}</style></head><body><script>window.clicks=0;document.addEventListener("pointerdown",()=>{window.clicks+=1});</script></body></html>',
)}`;

const say = (line: string): void => console.log(`[harness] ${line}`);

process.on("unhandledRejection", (cause) => say(`unhandled rejection: ${cause}`));
process.on("uncaughtException", (cause) => say(`uncaught exception: ${cause}`));
setTimeout(() => {
  say("lifetime over, quitting");
  app.quit();
}, lifetimeMs);

app.whenReady().then(async () => {
  say(`ready; page ${pageUrl}; preload ${preload}`);
  const primary = screen.getPrimaryDisplay();
  const probe = new BrowserWindow({
    width: 480,
    height: 400,
    x: primary.workArea.x + primary.workArea.width - 520,
    y: primary.workArea.y + primary.workArea.height - 440,
    show: false,
    alwaysOnTop: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  await probe.loadURL(probePage);
  probe.show();
  const stead = steadUrl === undefined ? undefined : await openStead(primary.workArea, steadUrl);

  const ports = electronCompanionPorts({
    desktop: {
      focusMostRecent: () => probe.focus(),
      broadcast: () => undefined,
    } as unknown as Parameters<typeof electronCompanionPorts>[0]["desktop"],
    platform: process.platform,
    dev: true,
    userData: mkdtempSync(join(tmpdir(), "companion-harness-")),
    preload,
    sessionType: process.env.XDG_SESSION_TYPE,
  });
  const companion = await startCompanion({
    ...ports,
    screen: {
      ...ports.screen,
      displays: () => {
        const all = ports.screen.displays();
        return [
          ...all.filter((display) => display.id === primary.id),
          ...all.filter((display) => display.id !== primary.id),
        ];
      },
      cursor: () => undefined,
    },
    selfTest: {
      gpu: async () => "harness",
      run: async () => ({ verdict: "clear", why: "the harness skips the capture" }),
    },
    foreground: noForegroundProbe,
    windows: {
      ...ports.windows,
      load: async (like) => {
        const native = BrowserWindow.fromId(like.id);
        if (native === null) return;
        const painted = whenPainted(native);
        await native.loadURL(pageUrl);
        await painted;
      },
    },
    console: {
      ...ports.console,
      send: (channel, payload) => say(`to console ${channel} ${JSON.stringify(payload)}`),
    },
    log: say,
  });
  await companion.setPreferences({ enabled: true });

  const nativeCompanion = (): BrowserWindow | null => {
    const like = companion.window();
    return like === undefined ? null : BrowserWindow.fromId(like.id);
  };

  const harness: Harness = {
    companion,
    probe,
    stead,
    selfTest: async () => {
      const like = companion.window();
      if (like === undefined) {
        say("transparency self-test: no companion window");
        return "unknown";
      }
      const reading = await ports.selfTest.run(like);
      say(`transparency self-test: ${reading.verdict}: ${reading.why}`);
      return reading.verdict;
    },
    sendConditions: (patch) => {
      const window = companion.window();
      if (window === undefined) return;
      const base: CompanionConditions = {
        ceiling: "ambient",
        onBattery: false,
        scale: 100,
        still: false,
        quiet: false,
        motion: "full",
        reducedTransparency: false,
        forcedColors: false,
        keyboardReachable: process.platform !== "win32",
        wantsMask: false,
      };
      window.webContents.send("companion:conditions", { ...base, ...patch });
    },
    companionBounds: () => nativeCompanion()?.getBounds(),
    companionPid: () => nativeCompanion()?.webContents.getOSProcessId(),
    steadPid: () => stead?.webContents.getOSProcessId(),
    scaleFactor: () => primary.scaleFactor,
  };
  (globalThis as { harness?: Harness }).harness = harness;
  say(
    `companion ${JSON.stringify(companion.presence())} at ${JSON.stringify(harness.companionBounds())}`,
  );
  if (selfDrive) await drive(harness);
});

async function openStead(area: Electron.Rectangle, url: string): Promise<BrowserWindow> {
  const stead = new BrowserWindow({
    width: 900,
    height: 360,
    x: area.x + 40,
    y: area.y + 40,
    show: false,
    alwaysOnTop: true,
    focusable: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  await stead.loadURL(url);
  stead.showInactive();
  return stead;
}

async function drive(harness: Harness): Promise<void> {
  try {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await harness.companion.hide();
    say(`hidden: ${JSON.stringify(harness.companion.presence())}`);
    await harness.companion.show();
    say(
      `shown: ${JSON.stringify(harness.companion.presence())} ${JSON.stringify(harness.companionBounds())}`,
    );
    say(`focused window ${BrowserWindow.getFocusedWindow()?.id}; probe ${harness.probe.id}`);
    say(`self-test verdict: ${await harness.selfTest()}`);
  } catch (cause) {
    say(`drive failed: ${cause}`);
  } finally {
    app.quit();
  }
}

app.on("window-all-closed", () => app.quit());
