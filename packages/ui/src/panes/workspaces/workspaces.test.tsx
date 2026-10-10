import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { cursorRow, mountPane, overviewShell, rowTexts, settle } from "../overview/rows.test.tsx";
import { workspaceAside, workspaceMark, workspaceRows, workspacesPane } from "./index.tsx";

afterEach(cleanup);

describe("the workspaces pane", () => {
  it("lists the workspaces over the root with their focus dirs beneath", async () => {
    const harness = overviewShell();
    await harness.surfaces.load();
    const { container } = mountPane(
      workspacesPane.component,
      { kind: "workspaces" },
      harness.shell,
    );
    expect(rowTexts(container)).toEqual([
      "█ keywork-app · open 14 notes · 6 sessions",
      "· packages/ui focus",
      "░ docs 3 notes · 1 session",
      "· docs focus",
      "· packages/protocol/src/fixtures focus",
      "spike undeclared",
    ]);
    expect(workspaceRows(harness.surfaces.state.workspaces)).toHaveLength(6);
    const spike = harness.surfaces.state.workspaces[2];
    expect(spike && workspaceMark(spike)).toBe(" ");
    expect(spike && workspaceAside(spike)).toBe("undeclared");
    harness.dispose();
  });

  it("uses a workspace after a confirm keystroke and restarts the server when it reopens", async () => {
    const calls: string[] = [];
    const harness = overviewShell({
      client: {
        useWorkspace: async (slug) => {
          calls.push(`use:${slug}`);
          return { slug, reopens: true };
        },
      },
    });
    harness.shell.host.restartServer = async (path) => {
      calls.push(`restart:${path}`);
      return {
        ok: true,
        opened: {
          workspace: path,
          serverLabel: "x",
          attached: false,
          version: "0",
          binary: undefined,
        },
      };
    };
    await harness.surfaces.load();
    const { container, act } = mountPane(
      workspacesPane.component,
      { kind: "workspaces" },
      harness.shell,
    );
    act("workspaces.use");
    expect(container.querySelector("[data-tone='ask']")).toBeNull();
    act("workspaces.down");
    act("workspaces.down");
    expect(cursorRow(container)).toBe("docs");
    act("workspaces.use");
    fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key: "y" });
    await settle();
    expect(calls).toEqual(["use:docs", "restart:C:/work"]);
    expect(container.textContent).toContain("keywork reopened on docs");
    expect(harness.refreshed()).toBe(1);
    harness.dispose();
  });

  it("declares a workspace and focuses or unfocuses a dir through path inputs", async () => {
    const calls: string[] = [];
    const harness = overviewShell({
      client: {
        createWorkspace: async (slug) => {
          calls.push(`new:${slug}`);
          return { slug };
        },
        focusWorkspaceDir: async (slug, dir) => {
          calls.push(`focus:${slug}:${dir}`);
          return { dir };
        },
        unfocusWorkspaceDir: async (slug, dir) => {
          calls.push(`unfocus:${slug}:${dir}`);
          return { dir };
        },
      },
    });
    await harness.surfaces.load();
    const { container, act } = mountPane(
      workspacesPane.component,
      { kind: "workspaces" },
      harness.shell,
    );
    const type = (text: string): void => {
      const input = container.querySelector("input") as HTMLInputElement;
      fireEvent.input(input, { target: { value: text } });
      fireEvent.submit(input.closest("form") as HTMLFormElement);
    };
    act("workspaces.new");
    type("notes");
    await settle();
    act("workspaces.focus");
    type("packages/client");
    await settle();
    act("workspaces.down");
    act("workspaces.unfocus");
    await settle();
    expect(calls).toEqual(["new:notes", "focus:null:packages/client", "unfocus:null:packages/ui"]);
    harness.dispose();
  });
});
