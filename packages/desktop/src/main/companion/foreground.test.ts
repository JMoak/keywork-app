import { describe, expect, it } from "vitest";
import {
  encodedCommand,
  foregroundFeed,
  foregroundOf,
  handleOf,
  holdsForeground,
  notificationStates,
  parseProbeLine,
  parseWindowLine,
  perMonitorDpiAwareV2,
  powershellArguments,
  probeScript,
  windowsForegroundProbe,
} from "./foreground.ts";

describe("foregroundOf", () => {
  it("hides only for busy, Direct3D fullscreen and presentation", () => {
    expect(foregroundOf(notificationStates.busy)).toBe("busy");
    expect(foregroundOf(notificationStates.d3dFullScreen)).toBe("busy");
    expect(foregroundOf(notificationStates.presentationMode)).toBe("busy");
    expect(foregroundOf(notificationStates.acceptsNotifications)).toBe("free");
    expect(foregroundOf(notificationStates.quietTime)).toBe("free");
    expect(foregroundOf(0)).toBe("free");
  });
});

describe("the probe script", () => {
  it("polls SHQueryUserNotificationState no faster than every five seconds and prints only changes", () => {
    const script = probeScript(5);
    expect(script).toContain("SHQueryUserNotificationState");
    expect(script).toContain("Start-Sleep -Seconds 5");
    expect(script).toContain("-ne $last");
    const encoded = encodedCommand(script);
    expect(Buffer.from(encoded, "base64").toString("utf16le")).toBe(script);
    expect(powershellArguments(script)).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encoded,
    ]);
  });

  it("parses state lines and ignores noise", () => {
    expect(parseProbeLine(" 3\r")).toBe(3);
    expect(parseProbeLine("Add-Type warning")).toBeUndefined();
  });
});

describe("windowsForegroundProbe", () => {
  it("spawns one process, reports transitions once, and kills it on stop", () => {
    let listener: ((line: string) => void) | undefined;
    let killed = 0;
    const spawned: string[] = [];
    const probe = windowsForegroundProbe((command, args) => {
      spawned.push(`${command} ${args[0]}`);
      return {
        onLine: (next) => {
          listener = next;
        },
        kill: () => {
          killed += 1;
        },
      };
    });
    const states: string[] = [];
    const stop = probe.start((state) => states.push(state));
    listener?.("5");
    listener?.("3");
    listener?.("2");
    listener?.("garbage");
    listener?.("5");
    stop();
    expect(spawned).toEqual(["powershell.exe -NoProfile"]);
    expect(states).toEqual(["free", "busy", "free"]);
    expect(killed).toBe(1);
  });
});

describe("the OS foreground window", () => {
  it("asks GetForegroundWindow in the same loop and prints only changes", () => {
    const script = probeScript(5);
    expect(script).toContain("GetForegroundWindow");
    expect(script).toContain("$window -ne $lastWindow");
    expect(parseWindowLine("window 1311054\r")).toEqual({ handle: "1311054", bounds: undefined });
    expect(parseWindowLine("5")).toBeUndefined();
    expect(parseProbeLine("window 1311054")).toBeUndefined();
  });

  it("prints the foreground window's rectangle in physical pixels, per-monitor DPI aware", () => {
    const script = probeScript(5);
    expect(script).toContain("SetThreadDpiAwarenessContext");
    expect(script).toContain(`[IntPtr]::new(${perMonitorDpiAwareV2})`);
    expect(perMonitorDpiAwareV2).toBe(-4);
    expect(script).toContain("GetWindowRect($foreground, [ref]$bounds)");
    expect(script.indexOf("SetThreadDpiAwarenessContext($perMonitorAware)")).toBeLessThan(
      script.indexOf("GetWindowRect($foreground"),
    );
  });

  it("reads the rectangle beside the handle as left, top, right and bottom", () => {
    expect(parseWindowLine("window 1311054 -13 -13 3853 2077\r")).toEqual({
      handle: "1311054",
      bounds: { x: -13, y: -13, width: 3866, height: 2090 },
    });
    expect(parseWindowLine("window 77 -3840 0 0 2160")?.bounds).toEqual({
      x: -3840,
      y: 0,
      width: 3840,
      height: 2160,
    });
    for (const noRect of ["window 77 0 0 1920", "window 77 0 0 0 1080", "window 77 a b c d"]) {
      expect(parseWindowLine(noRect), noRect).toEqual({ handle: "77", bounds: undefined });
    }
    expect(parseWindowLine("window x 0 0 1920 1080")).toBeUndefined();
  });

  it("keeps the foreground's rectangle with its handle, and forgets it when the console takes focus", () => {
    let listener: ((line: string) => void) | undefined;
    const feed = foregroundFeed(() => ({
      onLine: (next) => {
        listener = next;
      },
      kill: () => undefined,
    }));
    expect(feed.bounds()).toBeUndefined();
    listener?.("window 777 0 0 1920 1080");
    expect(feed.bounds()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    listener?.("5");
    expect(feed.bounds()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    listener?.("window 777");
    expect(feed.bounds()).toBeUndefined();
    listener?.("window 777 1920 0 3840 1080");
    feed.noteForeground("4242");
    expect([feed.window(), feed.bounds()]).toEqual(["4242", undefined]);
    feed.stop();
  });

  it("feeds one process to every listener and remembers the foreground window", () => {
    let listener: ((line: string) => void) | undefined;
    let spawned = 0;
    let killed = 0;
    const feed = foregroundFeed(() => {
      spawned += 1;
      return {
        onLine: (next) => {
          listener = next;
        },
        kill: () => {
          killed += 1;
        },
      };
    });
    expect(feed.window()).toBeUndefined();
    listener?.("5");
    listener?.("window 777");
    const late: string[] = [];
    const stopLate = feed.probe.start((state) => late.push(state));
    listener?.("3");
    stopLate();
    listener?.("5");
    expect(late).toEqual(["free", "busy"]);
    expect(feed.window()).toBe("777");
    feed.stop();
    expect([spawned, killed]).toEqual([1, 1]);
  });

  it("keeps the raw notification state and tells a watcher about every probe line", () => {
    let listener: ((line: string) => void) | undefined;
    const feed = foregroundFeed(() => ({
      onLine: (next) => {
        listener = next;
      },
      kill: () => undefined,
    }));
    let heard = 0;
    const stop = feed.onChange(() => {
      heard += 1;
    });
    expect(feed.notificationState()).toBeUndefined();
    listener?.("4");
    listener?.("window 777");
    expect(feed.notificationState()).toBe(4);
    stop();
    listener?.("2");
    expect([feed.notificationState(), heard]).toEqual([2, 2]);
    feed.stop();
  });

  it("takes a focus event as the foreground at once, until the next probe line says otherwise", () => {
    let listener: ((line: string) => void) | undefined;
    const feed = foregroundFeed(() => ({
      onLine: (next) => {
        listener = next;
      },
      kill: () => undefined,
    }));
    listener?.("window 777");
    feed.noteForeground("4242");
    expect(feed.window()).toBe("4242");
    listener?.("window 777");
    expect(feed.window()).toBe("777");
    feed.stop();
  });

  it("calls a covered console unfocused, and a shown one in front focused", () => {
    const console = { handle: "4242", visible: true, minimized: false };
    expect(holdsForeground("777", [console])).toBe(false);
    expect(holdsForeground("4242", [console])).toBe(true);
    expect(holdsForeground("4242", [{ ...console, minimized: true }])).toBe(false);
    expect(holdsForeground(undefined, [console])).toBeUndefined();
  });

  it("reads a native window handle the way GetForegroundWindow prints it", () => {
    const wide = Buffer.alloc(8);
    wide.writeBigUInt64LE(1311054n);
    expect(handleOf(wide)).toBe("1311054");
    const narrow = Buffer.alloc(4);
    narrow.writeUInt32LE(4242);
    expect(handleOf(narrow)).toBe("4242");
  });
});
