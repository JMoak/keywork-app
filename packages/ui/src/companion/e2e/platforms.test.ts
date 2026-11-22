import { describe, expect, it } from "vitest";
import { projectSkipReason, runnerOf } from "./platforms.ts";

describe("the companion Playwright matrix", () => {
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
});
