export type ForegroundState = "free" | "busy";

export interface ForegroundProbe {
  start(onChange: (state: ForegroundState) => void): () => void;
}

export const notificationStates = {
  notPresent: 1,
  busy: 2,
  d3dFullScreen: 3,
  presentationMode: 4,
  acceptsNotifications: 5,
  quietTime: 6,
  app: 7,
} as const;

export function foregroundOf(code: number): ForegroundState {
  switch (code) {
    case notificationStates.busy:
    case notificationStates.d3dFullScreen:
    case notificationStates.presentationMode:
      return "busy";
    default:
      return "free";
  }
}

export function parseProbeLine(line: string): number | undefined {
  const trimmed = line.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

export const perMonitorDpiAwareV2 = -4;

export function probeScript(everySeconds: number): string {
  return [
    `Add-Type -Namespace Stead -Name Shell -MemberDefinition '${probeDeclarations.join(" ")}'`,
    `$perMonitorAware = [IntPtr]::new(${perMonitorDpiAwareV2})`,
    "$last = -1",
    '$lastWindow = ""',
    "while ($true) {",
    "  $state = 0",
    "  [void][Stead.Shell]::SHQueryUserNotificationState([ref]$state)",
    "  if ($state -ne $last) { [Console]::Out.WriteLine($state); [Console]::Out.Flush(); $last = $state }",
    "  $foreground = [Stead.Shell]::GetForegroundWindow()",
    `  $window = "${windowLinePrefix}" + $foreground.ToInt64()`,
    "  $aware = $false",
    "  try { $aware = [Stead.Shell]::SetThreadDpiAwarenessContext($perMonitorAware) -ne [IntPtr]::Zero } catch { }",
    "  $bounds = New-Object Stead.Shell+Bounds",
    '  if ($aware -and [Stead.Shell]::GetWindowRect($foreground, [ref]$bounds)) { $window += " $($bounds.Left) $($bounds.Top) $($bounds.Right) $($bounds.Bottom)" }',
    "  if ($window -ne $lastWindow) { [Console]::Out.WriteLine($window); [Console]::Out.Flush(); $lastWindow = $window }",
    `  Start-Sleep -Seconds ${everySeconds}`,
    "}",
  ].join("\n");
}

export const windowLinePrefix = "window ";

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ForegroundWindow {
  readonly handle: string;
  readonly bounds: ScreenRect | undefined;
}

export function parseWindowLine(line: string): ForegroundWindow | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith(windowLinePrefix)) return undefined;
  const [handle, ...edges] = trimmed.slice(windowLinePrefix.length).split(" ");
  if (handle === undefined || !/^\d+$/.test(handle)) return undefined;
  return { handle, bounds: boundsOfEdges(edges) };
}

export function encodedCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export function powershellArguments(script: string): string[] {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedCommand(script),
  ];
}

export interface ProbeProcess {
  onLine(listener: (line: string) => void): void;
  kill(): void;
}

export type ProbeSpawn = (command: string, args: readonly string[]) => ProbeProcess;

export function windowsForegroundProbe(spawn: ProbeSpawn, everySeconds = 5): ForegroundProbe {
  return {
    start: (onChange) => {
      const feed = foregroundFeed(spawn, everySeconds);
      feed.probe.start(onChange);
      return () => feed.stop();
    },
  };
}

export interface ForegroundFeed {
  probe: ForegroundProbe;
  window(): string | undefined;
  bounds(): ScreenRect | undefined;
  notificationState(): number | undefined;
  onChange(listener: () => void): () => void;
  noteForeground(handle: string): void;
  stop(): void;
}

export function foregroundFeed(spawn: ProbeSpawn, everySeconds = 5): ForegroundFeed {
  const listeners = new Set<(state: ForegroundState) => void>();
  const watchers = new Set<() => void>();
  let state: ForegroundState | undefined;
  let window: ForegroundWindow | undefined;
  let notification: number | undefined;
  const child = spawn("powershell.exe", powershellArguments(probeScript(everySeconds)));
  child.onLine((line) => {
    window = parseWindowLine(line) ?? window;
    const code = parseProbeLine(line);
    notification = code ?? notification;
    for (const watcher of [...watchers]) watcher();
    if (code === undefined || foregroundOf(code) === state) return;
    state = foregroundOf(code);
    for (const listener of [...listeners]) listener(state);
  });
  return {
    probe: {
      start: (onChange) => {
        listeners.add(onChange);
        if (state !== undefined) onChange(state);
        return () => listeners.delete(onChange);
      },
    },
    window: () => window?.handle,
    bounds: () => window?.bounds,
    notificationState: () => notification,
    onChange: (watcher) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    noteForeground: (handle) => {
      window = { handle, bounds: undefined };
    },
    stop: () => {
      listeners.clear();
      watchers.clear();
      child.kill();
    },
  };
}

export interface OwnWindow {
  handle: string;
  visible: boolean;
  minimized: boolean;
}

export function holdsForeground(
  foreground: string | undefined,
  windows: readonly OwnWindow[],
): boolean | undefined {
  if (foreground === undefined) return undefined;
  return windows.some(
    (window) => window.handle === foreground && window.visible && !window.minimized,
  );
}

export function handleOf(native: Buffer): string {
  return native.length >= 8
    ? native.readBigUInt64LE(0).toString()
    : native.readUInt32LE(0).toString();
}

export const noForegroundProbe: ForegroundProbe = { start: () => () => undefined };

const probeDeclarations = [
  '[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);',
  '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '[DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);',
  '[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Bounds bounds);',
  "public struct Bounds { public int Left; public int Top; public int Right; public int Bottom; }",
];

function boundsOfEdges(edges: readonly string[]): ScreenRect | undefined {
  if (edges.length !== 4 || !edges.every((edge) => /^-?\d+$/.test(edge))) return undefined;
  const [left, top, right, bottom] = edges.map(Number) as [number, number, number, number];
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
