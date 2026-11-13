import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { tileFill } from "../chrome/stamp.ts";
import { browserHost } from "../host/browser.ts";
import type { HostPort, RecentWorkspace } from "../host/port.ts";
import { openFailureView } from "./open-failure.tsx";
import { OpenScreen, startingLine } from "./open-screen.tsx";

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

  it("names Keywork on the workspace picker", () => {
    openScreen([]);
    expect(screen.getByRole("heading", { name: "keywork" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "open a folder" })).toBeTruthy();
  });

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

  it("says which folder did not open and offers background work only when that is what it needs", () => {
    const view = openFailureView("C:\\work\\site", {
      kind: "unresolved",
      message: "The shared engine is not running.",
      nextAction: "Enable background work before opening your creature home or a project.",
    });
    const { unmount } = render(() => (
      <OpenScreen
        host={hostWith([])}
        failure={view}
        opening={undefined}
        onOpen={() => {}}
        onEnableRuntime={() => {}}
      />
    ));
    expect(screen.getByText("site did not open")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enable background work" })).toBeTruthy();
    unmount();
    render(() => (
      <OpenScreen
        host={hostWith([])}
        failure={openFailureView("C:\\work\\site", { kind: "port-in-use", port: 4770, detail: "" })}
        opening={undefined}
        onOpen={() => {}}
        onEnableRuntime={() => {}}
      />
    ));
    expect(screen.getByText("port 4770 is taken")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable background work" })).toBeNull();
  });

  it("marks a starting server with the tile-fill, never a spinner, in the product's words", async () => {
    const { container } = openScreen([], "C:\\src\\keywork");
    expect(startingLine("C:\\src\\keywork")).toBe("starting keywork in C:\\src\\keywork");
    expect(container.querySelector(".kw-open-note")?.textContent).toContain(
      startingLine("C:\\src\\keywork"),
    );
    expect(tileFill).toContain(container.querySelector(".kw-open-stamp")?.textContent);
  });
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
