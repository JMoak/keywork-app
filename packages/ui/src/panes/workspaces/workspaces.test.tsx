import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { cursorRow, mountPane, overviewShell, rowTexts, settle } from "../overview/testing.tsx";
import { workspaceAside, workspaceMark, workspaceRows, workspacesPane } from "./index.tsx";
import { servingLine, stoppedServingNotice, stopServingQuestion } from "./serving.ts";

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
    expect(container.textContent).toContain("the server reopened on docs");
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

describe("the workspaces pane says who serves this folder", () => {
  function servedShell(answer: "node" | "console") {
    const calls: string[] = [];
    let serving: "node" | "console" = answer;
    const harness = overviewShell();
    Object.assign(harness.shell.host, {
      servingOf: async (workspace: string) => {
        calls.push(`serving:${workspace}`);
        return serving;
      },
      stopServing: async (workspace: string) => {
        calls.push(`stop:${workspace}`);
        serving = "console";
        return {
          ok: true,
          opened: {
            workspace,
            serverLabel: "127.0.0.1:4771",
            attached: false,
            version: "0",
            binary: undefined,
          },
        };
      },
    });
    return { harness, calls };
  }

  function servingText(container: HTMLElement): string | undefined {
    return container.querySelector(".kw-workspaces-serving")?.textContent?.replace(/\s+/g, " ");
  }

  it("shows served by the node and stops serving after a confirm keystroke", async () => {
    const { harness, calls } = servedShell("node");
    await harness.surfaces.load();
    const { container, act } = mountPane(
      workspacesPane.component,
      { kind: "workspaces" },
      harness.shell,
    );
    await settle();
    expect(servingText(container)).toBe("this folder served by the node · s stops serving");
    act("workspaces.stop-serving");
    expect(container.textContent).toContain(stopServingQuestion);
    fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key: "y" });
    await settle();
    expect(calls).toEqual(["serving:C:/work", "stop:C:/work", "serving:C:/work"]);
    expect(container.textContent).toContain(stoppedServingNotice);
    expect(servingText(container)).toBe("this folder runs with the console");
    harness.dispose();
  });

  it("offers no stop for a folder that runs with the console, nor a line where the host cannot say", async () => {
    const { harness, calls } = servedShell("console");
    await harness.surfaces.load();
    const { container, act } = mountPane(
      workspacesPane.component,
      { kind: "workspaces" },
      harness.shell,
    );
    await settle();
    expect(servingText(container)).toBe("this folder runs with the console");
    act("workspaces.stop-serving");
    expect(container.querySelector("[data-tone='ask']")).toBeNull();
    expect(calls).toEqual(["serving:C:/work"]);
    harness.dispose();

    const plain = overviewShell();
    await plain.surfaces.load();
    const mounted = mountPane(workspacesPane.component, { kind: "workspaces" }, plain.shell);
    await settle();
    expect(servingText(mounted.container)).toBeUndefined();
    plain.dispose();
  });

  it("words each way a folder is served", () => {
    expect(servingLine("node")).toBe("served by the node");
    expect(servingLine("console")).toBe("runs with the console");
  });
});
