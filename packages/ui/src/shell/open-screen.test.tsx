import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { tileFill } from "../chrome/stamp.ts";
import { browserHost } from "../host/browser.ts";
import type { HostPort, RecentWorkspace } from "../host/port.ts";
import { OpenScreen } from "./open-screen.tsx";

afterEach(async () => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  await settled();
});

function hostWith(recents: readonly RecentWorkspace[]): HostPort {
  return {
    ...browserHost(),
    about: async () => ({ shell: "electron", platform: "win32", version: "test" }),
    recentWorkspaces: async () => recents,
  };
}

function openScreen(recents: readonly RecentWorkspace[], opening?: string) {
  return render(() => (
    <OpenScreen host={hostWith(recents)} failure={undefined} opening={opening} onOpen={() => {}} />
  ));
}

describe("OpenScreen", () => {
  it("names the theme it is wearing beside the masthead", async () => {
    document.documentElement.setAttribute("data-theme", "keywork-day");
    await settled();
    openScreen([]);
    expect((await screen.findByText("keywork-day")).className).toBe("kw-open-theme-name");
  });

  it("teaches the five keys on the very first run and lists workspaces after that", async () => {
    const first = openScreen([]);
    await screen.findByLabelText("five keys to start");
    first.unmount();
    openScreen([{ path: "C:\\src\\keywork", openedAt: new Date().toISOString() }]);
    expect(await screen.findByText("C:\\src\\keywork")).toBeTruthy();
    expect(document.querySelector(".kw-first-run")).toBeNull();
  });

  it("marks a starting server with the tile-fill, never a spinner", async () => {
    const { container } = openScreen([], "C:\\src\\keywork");
    expect(container.querySelector(".kw-open-note")?.textContent).toContain(
      "starting keywork in C:\\src\\keywork",
    );
    expect(tileFill).toContain(container.querySelector(".kw-open-stamp")?.textContent);
  });
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
