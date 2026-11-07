import { spawnSync } from "node:child_process";

const user32 = [
  '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();',
  '[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
  '[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, System.UIntPtr extra);',
  '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();',
  '[DllImport("user32.dll")] public static extern System.IntPtr WindowFromPoint(long point);',
  '[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr window, out int pid);',
  '[DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(System.IntPtr window, System.Text.StringBuilder name, int size);',
].join(" ");

const leftDown = 0x0002;
const leftUp = 0x0004;

export interface WindowAtPoint {
  handle: string;
  pid: number;
  className: string;
}

export function osMove(x: number, y: number): void {
  run(`[W.U]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null`);
}

export function osClick(x: number, y: number): void {
  run(
    [
      `[W.U]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}) | Out-Null`,
      "Start-Sleep -Milliseconds 120",
      `[W.U]::mouse_event(${leftDown}, 0, 0, 0, [System.UIntPtr]::Zero)`,
      "Start-Sleep -Milliseconds 40",
      `[W.U]::mouse_event(${leftUp}, 0, 0, 0, [System.UIntPtr]::Zero)`,
    ].join("; "),
  );
}

export function foregroundWindowHandle(): string {
  return run("[W.U]::GetForegroundWindow().ToInt64()").trim();
}

export function windowAtPoint(x: number, y: number): WindowAtPoint {
  const packed = (BigInt(Math.round(y)) << 32n) | (BigInt(Math.round(x)) & 0xffffffffn);
  const output = run(
    [
      `$window = [W.U]::WindowFromPoint([long]${packed})`,
      "$pid = 0",
      "[void][W.U]::GetWindowThreadProcessId($window, [ref]$pid)",
      "$name = New-Object System.Text.StringBuilder 256",
      "[void][W.U]::GetClassName($window, $name, 256)",
      '"$($window.ToInt64())|$pid|$($name.ToString())"',
    ].join("; "),
  ).trim();
  const [handle = "", pid = "0", className = ""] = output.split("|");
  return { handle, pid: Number(pid), className };
}

export function windowsInputAvailable(): boolean {
  return process.platform === "win32";
}

function run(body: string): string {
  const script = `Add-Type -Namespace W -Name U -MemberDefinition '${user32}'; [W.U]::SetProcessDPIAware() | Out-Null; ${body}`;
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    },
  );
  if (result.status !== 0) throw new Error(`powershell failed: ${result.stderr}`);
  return result.stdout;
}
