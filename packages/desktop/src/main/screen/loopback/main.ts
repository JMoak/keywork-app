import { join } from "node:path";
import {
  app,
  BrowserWindow,
  type Display,
  ipcMain,
  protocol,
  type Rectangle,
  screen,
} from "electron";
import { wireScreen } from "../electron.ts";
import { prepareScreenBeforeReady } from "../guards.ts";
import { dataUrl } from "../indicator.ts";
import { inboundSignaling, signalingRoutes } from "../routes.ts";
import {
  clockCells,
  clockPage,
  harnessCandidateChannel,
  harnessCodecChannel,
  harnessNoteChannel,
  harnessStatsChannel,
  type ProbeConfig,
  viewerProbe,
} from "./probe.ts";
import { type LoopbackHouse, loopbackHouseEnv, sharerSeams, viewerSeams } from "./seams.ts";

const role = process.env.KEYWORK_LOOPBACK_ROLE === "viewer" ? "viewer" : "sharer";
const house = JSON.parse(process.env[loopbackHouseEnv] ?? "{}") as LoopbackHouse;
const workDir = process.env.KEYWORK_LOOPBACK_DIR ?? app.getPath("temp");
const preload = join(import.meta.dirname, "preload.cjs");

prepareScreenBeforeReady({ commandLine: app.commandLine, protocol });
app.setPath("userData", join(workDir, `${role}-profile`));

app.whenReady().then(async () => {
  ipcMain.on(harnessCandidateChannel, (_event, candidate: string) =>
    report({ event: "candidate", side: role, candidate }),
  );
  ipcMain.on(harnessNoteChannel, (_event, note: string) =>
    report({ event: "note", side: role, note }),
  );
  ipcMain.on(harnessCodecChannel, (event) => {
    event.returnValue = process.env.KEYWORK_SCREEN_PERF_CODEC ?? "";
  });
  ipcMain.on(harnessStatsChannel, (_event, snapshot: Record<string, unknown>) =>
    report({ event: "rtc-stats", ...snapshot }),
  );
  if (role === "sharer") await share();
  else await view();
});

app.on("window-all-closed", () => {});

async function share(): Promise<void> {
  const wiring = await wireScreen({
    preload,
    logPath: join(workDir, "sharer-sessions.jsonl"),
    inbound: inboundSignaling(sharerSeams(house)),
    endpointFor: async () => ({ ok: false, problem: "the loopback sharer views nothing" }),
    pathTo: async () => "local",
    consent: async () => 0,
    killChord: "CommandOrControl+Alt+Shift+F11",
    snapshots: true,
  });
  await showClock(screen.getPrimaryDisplay().bounds);
  wiring.host.sharer.onEnded((sessionId) => report({ event: "sharer-ended", sessionId }));
  report({
    event: "ready",
    role,
    snapshots: wiring.snapshots?.url,
    display: displayRecord(screen.getPrimaryDisplay()),
  });
}

async function view(): Promise<void> {
  const wiring = await wireScreen({
    preload,
    logPath: join(workDir, "viewer-sessions.jsonl"),
    endpointFor: signalingRoutes(viewerSeams(house)),
    pathTo: async () => "local",
  });
  const bounds = screen.getPrimaryDisplay().bounds;
  const window = new BrowserWindow({
    show: false,
    x: bounds.x + bounds.width - 680,
    y: bounds.y + bounds.height - 480,
    width: 640,
    height: 400,
    focusable: false,
    skipTaskbar: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  await window.loadURL("about:blank");
  window.showInactive();
  const config: ProbeConfig = {
    display: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    clock: { ...clockRect(bounds), cells: clockCells },
    collectMs: Number(process.env.KEYWORK_LOOPBACK_COLLECT_MS ?? 30_000),
    samples: Number(process.env.KEYWORK_LOOPBACK_PROBES ?? 150),
    warmupFrames: Number(process.env.KEYWORK_LOOPBACK_WARMUP_FRAMES ?? 60),
  };
  const result = await window.webContents.executeJavaScript(
    `(${viewerProbe.toString()})(${JSON.stringify(config)})`,
  );
  report({ event: "result", webgl2: await webgl2(window), ...result });
  await wiring.dispose();
  app.quit();
}

function displayRecord(display: Display) {
  return {
    label: display.label,
    size: display.size,
    scaleFactor: display.scaleFactor,
    pixels: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    },
    refreshHz: display.displayFrequency,
  };
}

function clockRect(bounds: Rectangle): Rectangle {
  return { x: bounds.x + 40, y: bounds.y + 64, width: clockCells * 24, height: 24 };
}

async function showClock(bounds: Rectangle): Promise<BrowserWindow> {
  const clock = new BrowserWindow({
    ...clockRect(bounds),
    show: false,
    frame: false,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  clock.setAlwaysOnTop(true, "screen-saver");
  await clock.loadURL(dataUrl(clockPage()));
  clock.showInactive();
  return clock;
}

async function webgl2(window: BrowserWindow): Promise<boolean> {
  return window.webContents.executeJavaScript(
    "document.createElement('canvas').getContext('webgl2') !== null",
  ) as Promise<boolean>;
}

function report(line: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
