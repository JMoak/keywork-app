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

export function probeScript(everySeconds: number): string {
  return [
    'Add-Type -Namespace Stead -Name Shell -MemberDefinition \'[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();\'',
    "$last = -1",
    "$lastWindow = -1",
    "while ($true) {",
    "  $state = 0",
    "  [void][Stead.Shell]::SHQueryUserNotificationState([ref]$state)",
    "  if ($state -ne $last) { [Console]::Out.WriteLine($state); [Console]::Out.Flush(); $last = $state }",
    "  $window = [Stead.Shell]::GetForegroundWindow().ToInt64()",
    `  if ($window -ne $lastWindow) { [Console]::Out.WriteLine("${windowLinePrefix}$window"); [Console]::Out.Flush(); $lastWindow = $window }`,
    `  Start-Sleep -Seconds ${everySeconds}`,
    "}",
  ].join("\n");
}

export const windowLinePrefix = "window ";

export function parseWindowLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith(windowLinePrefix)) return undefined;
  const handle = trimmed.slice(windowLinePrefix.length);
  return /^\d+$/.test(handle) ? handle : undefined;
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
  noteForeground(handle: string): void;
  stop(): void;
}

export function foregroundFeed(spawn: ProbeSpawn, everySeconds = 5): ForegroundFeed {
  const listeners = new Set<(state: ForegroundState) => void>();
  let state: ForegroundState | undefined;
  let window: string | undefined;
  const child = spawn("powershell.exe", powershellArguments(probeScript(everySeconds)));
  child.onLine((line) => {
    window = parseWindowLine(line) ?? window;
    const code = parseProbeLine(line);
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
    window: () => window,
    noteForeground: (handle) => {
      window = handle;
    },
    stop: () => {
      listeners.clear();
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
