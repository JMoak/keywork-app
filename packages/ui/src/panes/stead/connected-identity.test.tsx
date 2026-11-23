import type { CreatureSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definitionOf } from "../index.ts";
import { mountPane, overviewShell, settle } from "../overview/testing.tsx";
import type { ShellSeams } from "../registry.ts";
import type { CreatureProjectsPort, SteadHomeScope } from "./home-scope.ts";

const steadPane = definitionOf("stead");

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a stead connected to its creature home", () => {
  it("saves automatic addresses and the town's style to the host pane without presenting another stead", async () => {
    const held = connectedHome();
    const { container } = mountPane(steadPane.component, { kind: "stead" }, held.shell);
    await waitFor(() =>
      expect(held.hostRebind).toHaveBeenLastCalledWith("p1", {
        kind: "stead",
        courtOrder: ["alpha", "missing"],
      }),
    );
    expect(held.homeRebind).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".kw-stead")).toHaveLength(1);
    fireEvent.click(within(container).getByRole("button", { name: "Deco" }));
    expect(held.hostRebind).toHaveBeenLastCalledWith("p1", {
      kind: "stead",
      courtOrder: ["alpha", "missing"],
      kit: "deco",
    });
    expect(held.homeRebind).not.toHaveBeenCalled();
    held.dispose();
  });

  it("keeps missing-artwork residents as the target of navigation, conversations and project actions", async () => {
    const held = connectedHome();
    const { container, act } = mountPane(steadPane.component, { kind: "stead" }, held.shell);
    const page = within(container);
    await page.findByRole("button", { name: "Open Alpha’s conversation" });
    act("stead.down");
    act("stead.down");
    await settle();
    expect(container.querySelector(".kw-stead-place")?.getAttribute("aria-label")).toBe(
      "Missing's workshop",
    );
    expect(page.queryByRole("button", { name: "Open Alpha’s conversation" })).toBeNull();
    fireEvent.click(page.getByRole("button", { name: "Open Missing’s conversation" }));
    await waitFor(() =>
      expect(held.openSession).toHaveBeenLastCalledWith({
        workspace: "C:/home",
        session: "home-missing",
      }),
    );
    expect(held.creature).toHaveBeenLastCalledWith("missing");
    fireEvent.click(await page.findByRole("button", { name: "Connect project" }));
    await waitFor(() => expect(held.bind).toHaveBeenLastCalledWith("missing", "C:/project"));
    held.openSession.mockClear();
    act("stead.open");
    expect(held.openSession).toHaveBeenCalledExactlyOnceWith({
      workspace: "C:/home",
      session: "home-missing",
    });
    act("stead.up");
    expect(page.getByRole("button", { name: "Open Alpha’s conversation" })).toBeTruthy();
    act("stead.down");
    expect(page.getByRole("button", { name: "Open Missing’s conversation" })).toBeTruthy();
    held.dispose();
  });
});

function connectedHome() {
  const base = overviewShell({ empty: true });
  const hostRebind = vi.fn<ShellSeams["rebind"]>();
  const homeRebind = vi.fn<ShellSeams["rebind"]>();
  const creature = vi.fn(async (slug: string) => ({ conversation: `home-${slug}` }));
  const list = vi.fn<CreatureProjectsPort["list"]>(async () => []);
  const bind = vi.fn<CreatureProjectsPort["bind"]>(async () => undefined);
  const openSession = vi.fn<SteadHomeScope["openSession"]>();
  const scope: SteadHomeScope = {
    workspace: "C:/home",
    shell: {
      ...base.shell,
      workspace: "C:/home",
      rebind: homeRebind,
      client: {
        ...base.shell.client,
        creatures: async () => [
          resident("alpha", "Alpha", "kid"),
          resident("missing", "Missing", "unavailable-art"),
        ],
        routines: async () => [],
        creature,
      } as unknown as ShellSeams["client"],
    },
    activeProject: () => ({ workspace: "C:/project", label: "Project" }),
    openSession,
    projects: {
      list,
      bind,
      unbind: async () => undefined,
      start: async () => ({ workspace: "C:/project", session: "unused" }),
      discuss: async () => ({ workspace: "C:/home", session: "unused" }),
    },
  };
  const shell: ShellSeams = {
    ...base.shell,
    workspace: "C:/project",
    rebind: hostRebind,
    steadHome: scope,
  };
  return { shell, hostRebind, homeRebind, creature, bind, openSession, dispose: base.dispose };
}

function resident(slug: string, name: string, skin: string): CreatureSummary {
  return {
    slug,
    name,
    skin,
    seed: 0,
    sigil: "◆",
    created: "2026-11-17T12:00:00.000Z",
    workshop: "host",
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    conversation: `home-${slug}`,
    threads: 0,
  };
}
