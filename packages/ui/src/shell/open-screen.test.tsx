import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
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
  it("starts on opening a folder, teaches no keys that only work in a workspace, and lists workspaces after the first", async () => {
    const first = openScreen([]);
    await settled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "open a folder" }));
    expect(document.querySelector(".kw-first-run")).toBeNull();
    first.unmount();
    openScreen([{ path: "C:\\src\\keywork", openedAt: new Date().toISOString() }]);
    expect(await screen.findByText("C:\\src\\keywork")).toBeTruthy();
    expect(document.querySelector(".kw-first-run")).toBeNull();
  });
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
