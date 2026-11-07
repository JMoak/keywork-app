import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keyworkNight } from "@keywork-app/ui/theme";
import { describe, expect, it } from "vitest";
import { keeperOnSpark, primary } from "./fakes.ts";
import {
  answersCheck,
  applyScreenSwitches,
  captureStreams,
  defaultKillChord,
  fileSessionLog,
  killSwitch,
  macScreenOnboarding,
  nativeConsent,
  permitsCapture,
  prepareScreenBeforeReady,
  screenAccess,
  senderPage,
} from "./guards.ts";
import {
  bannerLine,
  bannerPage,
  edgePage,
  indicatorLayout,
  isStopNavigation,
  stopUrl,
  themedIndicatorPalettes,
} from "./indicator.ts";

describe("capture in main", () => {
  it("hands the renderer the source main chose and never audio", () => {
    expect(captureStreams(primary, { videoRequested: true, audioRequested: true })).toEqual({
      video: { id: primary.sourceId, name: "Primary" },
    });
    expect(captureStreams(undefined, { videoRequested: true, audioRequested: false })).toBeNull();
    expect(captureStreams(primary, { videoRequested: false, audioRequested: true })).toBeNull();
  });

  it("grants display-capture only to a live sender on the app's own origin", () => {
    expect(permitsCapture("display-capture", true, "keywork-screen://sender")).toBe(true);
    expect(permitsCapture("display-capture", true, "keywork-screen://sender/")).toBe(true);
    expect(permitsCapture("display-capture", false, "keywork-screen://sender")).toBe(false);
    expect(permitsCapture("display-capture", true, "https://evil.example")).toBe(false);
    expect(permitsCapture("display-capture", true, "keywork-screen://senderx")).toBe(false);
    for (const permission of ["media", "notifications", "clipboard-read", "openExternal"]) {
      expect(permitsCapture(permission, true, "keywork-screen://sender")).toBe(false);
    }
  });

  it("passes the media check for the live sender so every interface is gathered, but never the request", () => {
    expect(answersCheck("media", true, "keywork-screen://sender")).toBe(true);
    expect(answersCheck("display-capture", true, "keywork-screen://sender")).toBe(true);
    expect(answersCheck("media", false, "keywork-screen://sender")).toBe(false);
    expect(answersCheck("media", true, "https://evil.example")).toBe(false);
    expect(answersCheck("notifications", true, "keywork-screen://sender")).toBe(false);
    expect(permitsCapture("media", true, "keywork-screen://sender")).toBe(false);
  });

  it("registers its secure scheme and the mDNS switch before ready in one call", () => {
    const registered: unknown[] = [];
    const switches = new Map<string, string>();
    prepareScreenBeforeReady({
      commandLine: {
        getSwitchValue: (name) => switches.get(name) ?? "",
        appendSwitch: (name, value) => {
          switches.set(name, value ?? "");
        },
      },
      protocol: { registerSchemesAsPrivileged: (schemes) => registered.push(...schemes) },
    });
    expect(registered).toEqual([
      { scheme: "keywork-screen", privileges: { standard: true, secure: true } },
    ]);
    expect(switches.get("disable-features")).toBe("WebRtcHideLocalIpsWithMdns");
    expect(senderPage).toContain("default-src 'none'");
  });
});

describe("the mDNS switch", () => {
  it("merges into the single disable-features value before ready", () => {
    const switches = new Map<string, string>([["disable-features", "CalculateNativeWinOcclusion"]]);
    const merged = applyScreenSwitches({
      getSwitchValue: (name) => switches.get(name) ?? "",
      appendSwitch: (name, value) => {
        switches.set(name, value ?? "");
      },
    });
    expect(merged).toBe("CalculateNativeWinOcclusion,WebRtcHideLocalIpsWithMdns");
    expect(switches.get("disable-features")).toBe(merged);
  });

  it("forces zero playout delay and bounded video pacing beside any trial already forced", () => {
    const switches = new Map<string, string>([["force-fieldtrials", "Other/On/"]]);
    applyScreenSwitches({
      getSwitchValue: (name) => switches.get(name) ?? "",
      appendSwitch: (name, value) => {
        switches.set(name, value ?? "");
      },
    });
    expect(switches.get("force-fieldtrials")).toBe(
      "Other/On/WebRTC-ForcePlayoutDelay/min_ms:0,max_ms:0/WebRTC-Video-Pacing/factor:2.5,max_delay:50ms/",
    );
  });
});

describe("the kill switch", () => {
  it("registers its chord while armed, reports a refused registration, and releases it", () => {
    const registered: string[] = [];
    const shortcuts = {
      register: (chord: string) => {
        registered.push(chord);
        return true;
      },
      unregister: (chord: string) => {
        registered.splice(registered.indexOf(chord), 1);
      },
    };
    const kill = killSwitch(shortcuts);
    expect(kill.arm(() => {})).toEqual({ chord: defaultKillChord, registered: true });
    expect(kill.arm(() => {})).toEqual({ chord: defaultKillChord, registered: true });
    expect(registered).toEqual([defaultKillChord]);
    kill.disarm();
    expect(registered).toEqual([]);

    const taken = killSwitch({ register: () => false, unregister: () => {} }, "Ctrl+Alt+K");
    expect(taken.arm(() => {})).toEqual({ chord: "Ctrl+Alt+K", registered: false });
  });
});

describe("the native consent card", () => {
  it("is a main-process message box with Ignore as the default and cancel", async () => {
    let shown: Record<string, unknown> | undefined;
    const ask = nativeConsent({
      showMessageBox: async (options) => {
        shown = options;
        return { response: 0 };
      },
    });
    const signal = new AbortController().signal;
    const card = {
      title: "t",
      message: "m",
      detail: "d",
      buttons: ["View only", "Ignore"] as const,
      timeoutMs: 30_000,
    };
    await expect(ask(card, signal)).resolves.toBe(0);
    expect(shown).toMatchObject({
      buttons: ["View only", "Ignore"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      signal,
    });
  });
});

describe("the session log file", () => {
  it("appends one JSON line per row in order and reads them back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "screen-log-"));
    const path = join(dir, "screen-sessions.jsonl");
    const log = fileSessionLog(path, {
      appendFile: (file, text) => appendFile(file, text, "utf8"),
      readFile: (file) => readFile(file, "utf8").catch(() => undefined),
    });
    expect(await log.read()).toEqual([]);
    const requested = {
      kind: "requested",
      at: "2026-11-05T09:00:00.000Z",
      sessionId: "s1",
      peer: keeperOnSpark,
      scope: "view",
    } as const;
    const decided = {
      kind: "decided",
      at: "2026-11-05T09:00:03.000Z",
      sessionId: "s1",
      verdict: "denied",
      reason: "ignored",
    } as const;
    void log.append(requested);
    await log.append(decided);
    const text = await readFile(path, "utf8");
    expect(text.split("\n")).toHaveLength(3);
    expect(await log.read()).toEqual([requested, decided]);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("macOS screen recording", () => {
  it("is checked only on macOS and sends the keeper to onboarding when missing", () => {
    expect(screenAccess("win32", () => "denied")).toBe("granted");
    expect(screenAccess("darwin", () => "granted")).toBe("granted");
    expect(screenAccess("darwin", () => "not-determined")).toBe("needs-onboarding");
    expect(macScreenOnboarding.steps.at(-1)).toContain("restart");
  });
});

describe("the indicator", () => {
  it("frames the captured display with four edges and a banner along the top", () => {
    const layout = indicatorLayout({ x: -1920, y: 0, width: 1920, height: 1080 });
    expect(layout.edges).toEqual([
      { x: -1920, y: 0, width: 1920, height: 4 },
      { x: -1920, y: 1076, width: 1920, height: 4 },
      { x: -1920, y: 4, width: 4, height: 1072 },
      { x: -4, y: 4, width: 4, height: 1072 },
    ]);
    expect(layout.banner).toEqual({ x: -1240, y: 4, width: 560, height: 36 });
  });

  it("names who is viewing, escapes it, offers Stop and uses no literal colors", () => {
    const banner = {
      who: "<b>Mallory</b> on evil",
      mode: "view" as const,
      shortcut: "Ctrl+Alt+Shift+X",
    };
    expect(bannerLine(banner)).toBe(
      "<b>Mallory</b> on evil is viewing this screen · Stop or Ctrl+Alt+Shift+X ends it",
    );
    expect(bannerLine({ ...banner, shortcut: undefined })).toContain("Stop ends it");
    const palette = themedIndicatorPalettes(keyworkNight).view;
    const page = bannerPage(banner, palette);
    expect(page).toContain("&#60;b&#62;Mallory&#60;/b&#62;");
    expect(page).not.toContain("<b>Mallory");
    expect(page).toContain(`href="${stopUrl}"`);
    expect(page).toContain("default-src 'none'");
    const painted = `${page}${edgePage(palette)}`
      .replaceAll(palette.ground, "")
      .replaceAll(palette.ink, "");
    expect(painted).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(isStopNavigation(stopUrl)).toBe(true);
    expect(isStopNavigation("https://example.com/")).toBe(false);
  });
});
