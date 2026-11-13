import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import type { ScreenAuditRecord } from "@keywork-app/protocol";
import {
  type AskConsent,
  type DisplayTarget,
  httpSignalingTransport,
  mapDisplays,
  type PathClass,
  type PeerIdentity,
  type SignalingTransport,
  webRtcUdpPorts,
} from "@keywork-app/screen";
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type Display,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  screen,
  session,
  systemPreferences,
  type WebContents,
  webContents,
} from "electron";
import { isAppPage, trustedIpc } from "../app-page.ts";
import { sentFrom } from "../trusted-ipc.ts";
import {
  type SenderCommand,
  screenChannels,
  senderPageUrl,
  senderPartition,
  senderScheme,
  senderWindowFlag,
} from "./channels.ts";
import type { DisplayGeometry } from "./control.ts";
import {
  answersCheck,
  captureStreams,
  defaultKillChord,
  fileSessionLog,
  isSenderOrigin,
  killSwitch,
  nativeConsent,
  permitsCapture,
  screenAccess,
  senderPage,
} from "./guards.ts";
import { helperLaunch, launchSpawn } from "./helper/launch.ts";
import { openHelper } from "./helper/port.ts";
import { type ScreenHost, screenHost } from "./host.ts";
import {
  bannerPage,
  dataUrl,
  edgePage,
  type IndicatorPalette,
  type IndicatorPalettes,
  indicatorLayout,
  isResumeNavigation,
  isStopNavigation,
  keeperIndicatorPalettes,
  overlayWindowPlan,
  paletteFor,
  placedStrip,
  type Rect,
  wornThemeSlot,
} from "./indicator.ts";
import { type IpcMainSeam, registerControlHandlers, registerScreenHandlers } from "./ipc.ts";
import { type InboundRouter, routedTransport, type SignalingRouter } from "./routes.ts";
import type { Indicator, IndicatorBanner, SenderWindows } from "./sharer.ts";
import { type SnapshotServer, startSnapshotServer } from "./snapshot.ts";
import type { ViewerSink } from "./viewer.ts";

export const senderReadyTimeoutMs = 10_000;

export interface ScreenWiringOptions {
  readonly preload: string;
  readonly logPath: string;
  readonly inbound?: InboundRouter | undefined;
  readonly endpointFor: SignalingRouter;
  readonly pathTo?: ((peer: PeerIdentity | string) => Promise<PathClass>) | undefined;
  readonly consent?: AskConsent | undefined;
  readonly killChord?: string | undefined;
  readonly palettes?: IndicatorPalettes | undefined;
  readonly inputHelper?: string | undefined;
  readonly audit?: ((record: ScreenAuditRecord) => Promise<void>) | undefined;
  readonly snapshots?: boolean | undefined;
  readonly onSharingChanged?: (() => void) | undefined;
}

export interface ScreenWiring {
  readonly host: ScreenHost;
  readonly snapshots: SnapshotServer | undefined;
  dispose(): Promise<void>;
}

export async function wireScreen(options: ScreenWiringOptions): Promise<ScreenWiring> {
  const timers = {
    set: setTimeout,
    clear: (handle: unknown) => clearTimeout(handle as NodeJS.Timeout),
  };
  const senders = senderWindows(options.preload);
  const pathTo = options.pathTo ?? (async () => "unknown" as const);
  const keeperTheme = wornThemeSlot();
  const stopWearing = receiveWornTheme(keeperTheme.wear);
  const host = screenHost({
    clock: Date,
    timers,
    mint: {
      id: (kind) => `${kind}-${randomUUID()}`,
      token: () => randomBytes(32).toString("base64url"),
    },
    consent: options.consent ?? nativeConsent(dialog),
    displays: captureDisplays,
    pathTo,
    peerPath: pathTo,
    senders,
    indicator: announcing(
      indicatorWindows(() =>
        keeperIndicatorPalettes({
          worn: keeperTheme.worn,
          prefersDark: () => nativeTheme.shouldUseDarkColors,
          fallback: options.palettes,
        }),
      ),
      options.onSharingChanged,
    ),
    helper: helperOpener(options.inputHelper),
    geometry: displayGeometry,
    audit: options.audit,
    killSwitch: killSwitch(globalShortcut, options.killChord ?? defaultKillChord),
    log: fileSessionLog(options.logPath, {
      appendFile: (path, text) => appendFile(path, text, "utf8"),
      readFile: (path) => readFile(path, "utf8").catch(() => undefined),
    }),
    screenAccess: () =>
      screenAccess(process.platform, () => systemPreferences.getMediaAccessStatus("screen")),
    inbound:
      options.inbound === undefined
        ? silentTransport
        : routedTransport(options.inbound, (endpoint) => httpSignalingTransport(endpoint)),
    endpointFor: options.endpointFor,
    transport: (endpoint) => httpSignalingTransport(endpoint),
    sink: viewerSink((id) => void host.viewer.closeAll(id)),
  });
  senders.bind(host);
  guardSenderPartition(host, senders);
  const ipc = screenIpc();
  const unregisterScreen = registerScreenHandlers(ipc, host, senders);
  const unregisterControl = registerControlHandlers(ipc, host, senders);
  const stopListening = options.inbound === undefined ? () => {} : host.listen();
  const stopTicking = host.startTicking();
  const displaysChanged = (): void => void host.sharer.displaysChanged();
  for (const event of displayEvents) screen.on(event as "display-added", displaysChanged);
  const snapshots =
    options.snapshots === true
      ? await startSnapshotServer({
          grantFor: (token) => host.grants.byToken(token),
          frame: host.frame,
          onEnded: host.sharer.onEnded,
          framesPerSecond: 5,
          maxWidth: 1280,
        })
      : undefined;
  return {
    host,
    snapshots,
    dispose: async () => {
      for (const event of displayEvents)
        screen.removeListener(event as "display-added", displaysChanged);
      stopTicking();
      stopListening();
      await host.shutdown();
      await snapshots?.close();
      unregisterControl();
      unregisterScreen();
      stopWearing();
    },
  };
}

export function prepareWebRtc(contents: WebContents): void {
  contents.setWebRTCIPHandlingPolicy("default");
  contents.setWebRTCUDPPortRange(webRtcUdpPorts);
}

const displayEvents = ["display-added", "display-removed", "display-metrics-changed"] as const;

const silentTransport: SignalingTransport = {
  send: async () => {
    throw new Error("no local signaling route is configured");
  },
  listen: () => () => {},
};

function helperOpener(path: string | undefined) {
  if (path === undefined || path.trim() === "") return undefined;
  const plan = helperLaunch(path);
  if (!plan.ok) {
    console.warn(plan.refusal);
    return undefined;
  }
  return () => openHelper(launchSpawn(plan.launch));
}

function displayGeometry(displayId: string): DisplayGeometry | undefined {
  const display = screen.getAllDisplays().find((candidate) => String(candidate.id) === displayId);
  return display === undefined
    ? undefined
    : { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor };
}

async function captureDisplays(): Promise<DisplayTarget[]> {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 0, height: 0 },
  });
  return mapDisplays(sources, screen.getAllDisplays(), screen.getPrimaryDisplay().id);
}

interface SenderRegistry extends SenderWindows {
  bind(host: ScreenHost): void;
  sessionOf(webContentsId: number): string | undefined;
  ready(webContentsId: number): void;
}

function senderWindows(preload: string): SenderRegistry {
  const windows = new Map<string, BrowserWindow>();
  const sessions = new Map<number, string>();
  const waiting = new Map<number, () => void>();
  let host: ScreenHost | undefined;
  return {
    bind: (bound) => {
      host = bound;
    },
    sessionOf: (id) => sessions.get(id),
    ready: (id) => waiting.get(id)?.(),
    open: async (sessionId) => {
      const window = new BrowserWindow({
        show: false,
        width: 320,
        height: 200,
        webPreferences: {
          preload,
          partition: senderPartition,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          additionalArguments: [senderWindowFlag],
        },
      });
      const id = window.webContents.id;
      windows.set(sessionId, window);
      sessions.set(id, sessionId);
      prepareWebRtc(window.webContents);
      window.on("closed", () => {
        sessions.delete(id);
        if (windows.get(sessionId) === window) {
          windows.delete(sessionId);
          void host?.sharer.end(sessionId, "connection-lost");
        }
      });
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("the sender window never came up")),
          senderReadyTimeoutMs,
        );
        waiting.set(id, () => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve();
        });
      });
      await window.loadURL(senderPageUrl);
      await ready;
    },
    command: (sessionId, command: SenderCommand) => {
      windows.get(sessionId)?.webContents.send(screenChannels.senderCommand, command);
    },
    close: (sessionId) => {
      const window = windows.get(sessionId);
      windows.delete(sessionId);
      if (window !== undefined && !window.isDestroyed()) window.destroy();
    },
  };
}

function guardSenderPartition(host: ScreenHost, senders: SenderRegistry): void {
  const partition = session.fromPartition(senderPartition);
  const liveSender = (id: number | undefined): boolean => {
    const sessionId = id === undefined ? undefined : senders.sessionOf(id);
    return sessionId !== undefined && host.sharer.isCapturing(sessionId);
  };
  if (!partition.protocol.isProtocolHandled(senderScheme)) {
    partition.protocol.handle(
      senderScheme,
      () => new Response(senderPage, { headers: { "content-type": "text/html; charset=utf-8" } }),
    );
  }
  partition.setDisplayMediaRequestHandler((request, callback) => {
    const contents = request.frame === null ? undefined : webContents.fromFrame(request.frame);
    const sessionId = contents === undefined ? undefined : senders.sessionOf(contents.id);
    const target =
      sessionId === undefined || !isSenderOrigin(request.securityOrigin)
        ? undefined
        : host.sharer.captureTarget(sessionId);
    callback(captureStreams(target, request));
  });
  partition.setPermissionRequestHandler((contents, permission, callback, details) =>
    callback(permitsCapture(permission, liveSender(contents.id), details.requestingUrl)),
  );
  partition.setPermissionCheckHandler((contents, permission, origin) =>
    answersCheck(permission, liveSender(contents?.id), origin),
  );
}

function announcing(indicator: Indicator, changed: (() => void) | undefined): Indicator {
  if (changed === undefined) return indicator;
  return {
    show: (...args) => {
      indicator.show(...args);
      changed();
    },
    hide: (sessionId) => {
      indicator.hide(sessionId);
      changed();
    },
  };
}

function indicatorWindows(palettes: () => IndicatorPalettes): Indicator {
  const shown = new Map<string, BrowserWindow[]>();
  const destroy = (sessionId: string): void => {
    for (const window of shown.get(sessionId) ?? []) if (!window.isDestroyed()) window.destroy();
    shown.delete(sessionId);
  };
  return {
    show: (sessionId, target, banner, stop, resume) => {
      destroy(sessionId);
      const display = screen
        .getAllDisplays()
        .find((candidate) => String(candidate.id) === target.id);
      if (display === undefined) return;
      const palette = paletteFor(banner, palettes());
      shown.set(sessionId, overlayWindows(display, banner, palette, stop, resume));
    },
    hide: destroy,
  };
}

function overlayWindows(
  display: Display,
  banner: IndicatorBanner,
  palette: IndicatorPalette,
  stop: () => void,
  resume: (() => void) | undefined,
): BrowserWindow[] {
  const area = display.workArea;
  const layout = indicatorLayout(area, display.scaleFactor);
  const edge = edgePage(palette, banner.controller === "agent");
  const edges = layout.edges.map((rect) => stripWindow(rect, edge, area));
  const bar = overlayWindow(layout.banner, bannerPage(banner, palette), "banner");
  bar.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (isStopNavigation(url)) stop();
    if (isResumeNavigation(url)) resume?.();
  });
  bar.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return [...edges, bar];
}

function receiveWornTheme(wear: (name: unknown) => void): () => void {
  const ipc = trustedIpc();
  const received = (_event: unknown, name: unknown): void => wear(name);
  ipc.on(screenChannels.wornTheme, received);
  return () => ipc.removeListener(screenChannels.wornTheme, received);
}

function screenIpc(): IpcMainSeam {
  return {
    ...trustedIpc(sentFrom((url) => isAppPage(url) || isSenderOrigin(url))),
    removeHandler: (channel: string) => ipcMain.removeHandler(channel),
  };
}

// Windows grows a frameless window to its minimum track size (about 28 by 36 DIP here), so a
// 4 DIP strip is a larger window whose shape paints only the strip.
function stripWindow(strip: Rect, html: string, area: Rect): BrowserWindow {
  const window = overlayWindow(strip, html, "edge");
  const placed = placedStrip(strip, window.getBounds(), area);
  window.setBounds(placed.bounds);
  window.setShape([placed.shape]);
  return window;
}

function overlayWindow(rect: Rect, html: string, part: "edge" | "banner"): BrowserWindow {
  const plan = overlayWindowPlan(part, process.platform);
  const options: BrowserWindowConstructorOptions = {
    ...rect,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: plan.focusable,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      javascript: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
  const window = new BrowserWindow(options);
  window.setAlwaysOnTop(true, plan.level);
  window.setContentProtection(plan.excludedFromCapture);
  if (plan.visibleOnFullScreen)
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (plan.clickThrough) window.setIgnoreMouseEvents(true);
  void window.loadURL(dataUrl(html)).then(() => {
    if (!window.isDestroyed()) window.showInactive();
  });
  return window;
}

function viewerSink(closed: (webContentsId: number) => void): ViewerSink {
  const prepared = new Set<number>();
  return {
    prepare: (id) => {
      const contents = webContents.fromId(id);
      if (contents === undefined) return;
      prepareWebRtc(contents);
      if (prepared.has(id)) return;
      prepared.add(id);
      contents.once("destroyed", () => {
        prepared.delete(id);
        closed(id);
      });
    },
    send: (id, event) => {
      const contents = webContents.fromId(id);
      if (contents !== undefined && !contents.isDestroyed())
        contents.send(screenChannels.viewerEvent, event);
    },
  };
}
