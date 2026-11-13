import { describe, expect, it } from "vitest";
import type { ShellSeams } from "../registry.ts";
import { creatureHomeShell } from "./creature-home.tsx";
import type { SteadHomeScope } from "./home-scope.ts";

const projectRebind = (): void => undefined;
const project = {
  workspace: "C:/work/site",
  rebind: projectRebind,
  sessions: { openSession: () => undefined },
  keys: { chord: () => "", leader: () => "ctrl+k" },
} as unknown as ShellSeams;

const homeStore = { name: "the home's store" };
const home = {
  workspace: "C:/me/.keywork/home",
  store: homeStore,
  rebind: () => undefined,
  sessions: { openSession: () => undefined },
} as unknown as SteadHomeScope["shell"];
const scope = {
  workspace: "C:/me/.keywork/home",
  shell: home,
  openSession: () => undefined,
} as unknown as SteadHomeScope;

describe("the shell a creature's panes talk through", () => {
  it("is the window's own where this host has no creature home", () => {
    expect(creatureHomeShell(project)).toBe(project);
  });

  it("is not known yet while the creature home is still opening", () => {
    expect(creatureHomeShell({ ...project, prepareSteadHome: () => undefined })).toBeUndefined();
  });

  it("is the window's own when the window is the creature home", () => {
    const atHome = { ...project, workspace: home.workspace, steadHome: scope } as ShellSeams;
    expect(creatureHomeShell(atHome)).toBe(atHome);
  });

  it("talks to the creature home from a project window, keeping the window's own pane binding", () => {
    const shell = creatureHomeShell({ ...project, steadHome: scope } as ShellSeams);
    expect(shell?.workspace).toBe("C:/me/.keywork/home");
    expect(shell?.store).toBe(homeStore);
    expect(shell?.rebind).toBe(projectRebind);
    expect(shell?.steadHome).toBe(scope);
  });
});
