import { describe, expect, it } from "vitest";
import { companionChannels } from "./channels.ts";
import { startCompanion } from "./companion.ts";
import {
  displaySessionOf,
  floatsNatively,
  type SessionSignals,
  waylandFallbackReason,
  waylandNotice,
} from "./session.ts";
import { fakePorts } from "./testing.ts";

const linux = (signals: Partial<SessionSignals>): SessionSignals => ({
  platform: "linux",
  sessionType: undefined,
  ...signals,
});

describe("the display session", () => {
  it("is a plain desktop on Windows and macOS whatever the environment says", () => {
    expect(displaySessionOf({ platform: "win32", sessionType: "wayland" })).toBe("desktop");
    expect(
      displaySessionOf({ platform: "darwin", sessionType: undefined, waylandDisplay: "wayland-0" }),
    ).toBe("desktop");
  });

  it("reads XDG_SESSION_TYPE first, in any case", () => {
    expect(displaySessionOf(linux({ sessionType: "wayland" }))).toBe("wayland");
    expect(displaySessionOf(linux({ sessionType: " Wayland " }))).toBe("wayland");
    expect(displaySessionOf(linux({ sessionType: "x11", waylandDisplay: "wayland-0" }))).toBe(
      "x11",
    );
  });

  it("falls back to WAYLAND_DISPLAY when the session type is missing or tty", () => {
    expect(displaySessionOf(linux({ waylandDisplay: "wayland-0" }))).toBe("wayland");
    expect(displaySessionOf(linux({ sessionType: "tty", waylandDisplay: "wayland-1" }))).toBe(
      "wayland",
    );
    expect(displaySessionOf(linux({ sessionType: "tty", waylandDisplay: "" }))).toBe("x11");
    expect(displaySessionOf(linux({}))).toBe("x11");
  });

  it("counts the XWayland opt-in (--ozone-platform=x11) as a session that can float", () => {
    const xwayland = displaySessionOf(linux({ sessionType: "wayland", ozonePlatform: "x11" }));
    expect(xwayland).toBe("xwayland");
    expect(floatsNatively(xwayland)).toBe(true);
    expect(displaySessionOf(linux({ sessionType: "wayland", ozonePlatform: "wayland" }))).toBe(
      "wayland",
    );
    expect(floatsNatively("wayland")).toBe(false);
    expect(floatsNatively("x11")).toBe(true);
  });
});

describe("the Wayland presence fallback", () => {
  it("puts the creature in the pane with the tray, creates no window, and says so once", async () => {
    const ports = fakePorts({ platform: "linux", wayland: true, prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    expect(companion.presence()).toEqual({
      mode: "pane",
      window: "none",
      reason: waylandFallbackReason,
    });
    expect(ports.windows.created).toHaveLength(0);
    await companion.setPreferences({ size: 150 });
    await companion.hide();
    await companion.show();
    await companion.setPreferences({ enabled: false });
    await companion.setPreferences({ enabled: true });
    expect(ports.windows.created).toHaveLength(0);
    expect(ports.logs.filter((line) => line === waylandNotice)).toHaveLength(1);
    expect(waylandNotice).toContain("--ozone-platform=x11");
    companion.dispose();
  });

  it("tells the console the reason with every presence change it sends", async () => {
    const ports = fakePorts({ platform: "linux", wayland: true });
    const companion = await startCompanion(ports);
    expect(ports.logs).not.toContain(waylandNotice);
    await companion.setPreferences({ enabled: true });
    const sent = ports.console.sent.filter(
      ([channel]) => channel === companionChannels.presenceChanged,
    );
    expect(sent.at(-1)?.[1]).toMatchObject({ mode: "pane", reason: waylandFallbackReason });
    expect(ports.logs.filter((line) => line === waylandNotice)).toHaveLength(1);
    companion.dispose();
  });

  it("stays silent when the keeper already prefers the pane or the tray", async () => {
    const ports = fakePorts({
      platform: "linux",
      wayland: true,
      prefs: { enabled: true, mode: "tray" },
    });
    const companion = await startCompanion(ports);
    expect(companion.presence()).toMatchObject({ mode: "tray", window: "none" });
    expect(ports.logs).not.toContain(waylandNotice);
    companion.dispose();
  });

  it("floats as usual on X11 and under the XWayland opt-in", async () => {
    const ports = fakePorts({ platform: "linux", wayland: false, prefs: { enabled: true } });
    const companion = await startCompanion(ports);
    expect(companion.presence()).toMatchObject({ mode: "floating", window: "shown" });
    expect(ports.logs).not.toContain(waylandNotice);
    companion.dispose();
  });
});
