import { describe, expect, it } from "vitest";
import {
  companionPlatform,
  companionPlatforms,
  osInputSkipReason,
  projectSkipReason,
  runnerOf,
} from "./platforms.ts";
import config from "./playwright.config.ts";

const windows = runnerOf("win32", {});

describe("the companion Playwright matrix", () => {
  it("has one project per platform and session, plus perf", () => {
    expect(config.projects?.map((project) => project.name)).toEqual([
      "companion-win32",
      "companion-darwin",
      "companion-linux-x11",
      "companion-linux-wayland",
      "perf",
    ]);
  });

  it("runs the Windows project here and skips the others by name, saying what runner they need", () => {
    expect(projectSkipReason("companion-win32", windows)).toBeUndefined();
    expect(projectSkipReason("companion-darwin", windows)).toBe(
      "companion-darwin runs on macos-latest in its logged-in Aqua session, with Screen Recording pre-granted to the Electron binary in TCC for the self-test; this machine is win32",
    );
    expect(projectSkipReason("companion-linux-x11", windows)).toMatch(
      /^companion-linux-x11 runs on ubuntu-latest under xvfb-run -a .*; this machine is win32$/,
    );
    expect(projectSkipReason("companion-linux-wayland", windows)).toMatch(
      /^companion-linux-wayland runs on .*weston --backend=headless.*; this machine is win32$/,
    );
    expect(projectSkipReason("perf", windows)).toBeUndefined();
  });

  it("tells an X11 runner from a Wayland one the way the companion does", () => {
    expect(runnerOf("linux", { XDG_SESSION_TYPE: "x11" })).toEqual({
      platform: "linux",
      session: "x11",
    });
    expect(runnerOf("linux", { XDG_SESSION_TYPE: "wayland" }).session).toBe("wayland");
    expect(runnerOf("linux", { WAYLAND_DISPLAY: "wayland-0" }).session).toBe("wayland");
    expect(
      runnerOf("linux", { XDG_SESSION_TYPE: "x11", WAYLAND_DISPLAY: "wayland-0" }).session,
    ).toBe("x11");
    expect(runnerOf("linux", {}).session).toBe("x11");
    const xvfb = runnerOf("linux", { DISPLAY: ":99" });
    expect(projectSkipReason("companion-linux-x11", xvfb)).toBeUndefined();
    expect(projectSkipReason("companion-linux-wayland", xvfb)).toContain(
      "this machine is linux (x11)",
    );
  });

  it("floats everywhere but Wayland, and drives OS input only where a driver exists", () => {
    expect(
      companionPlatforms.filter((target) => !target.floats).map((target) => target.project),
    ).toEqual(["companion-linux-wayland"]);
    expect(osInputSkipReason(companionPlatform("companion-win32"))).toBeUndefined();
    expect(osInputSkipReason(companionPlatform("companion-darwin"))).toBe(
      "companion-darwin has no OS-level input driver yet: the click-through probes run on companion-win32 only",
    );
  });
});
