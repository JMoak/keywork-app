import { emptyProjection, projectAll } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHost } from "../../host/browser.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { type TerminalSpec, terminalPane } from "./index.tsx";
import { type FakeSurface, fakeSurface } from "./session.test.ts";

const surfaces: FakeSurface[] = [];

vi.mock("./surface.ts", () => ({
  xtermSurface: () => {
    const surface = Object.assign(fakeSurface(), {
      setTheme: () => {},
      fit: () => {},
      renderer: () => "dom",
    });
    surfaces.push(surface);
    return surface;
  },
}));

const bashTurn: BusEnvelope[] = [
  {
    id: 1,
    ts: "t",
    sessionId: "s1",
    type: "tool.started",
    payload: {
      call: { type: "tool-call", callId: "c1", name: "bash", arguments: { command: "echo hi" } },
    },
  },
  {
    id: 2,
    ts: "t",
    sessionId: "s1",
    type: "tool.finished",
    payload: { callId: "c1", output: "hi", isError: false },
  },
];

function shellSeams(rebound: PaneSpecBase[] = []): ShellSeams {
  const projection = projectAll(emptyProjection, bashTurn);
  return {
    store: {
      projection: (id: string | undefined) => (id === "s1" ? projection : emptyProjection),
      summary: () => undefined,
    } as unknown as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: {
      openSession: () => {},
      newSession: async () => {},
      startSession: async () => {},
    },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: () => "s1",
    rebind: (_paneId, spec) => {
      rebound.push(spec);
    },
    unseen: () => false,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => surfaces.splice(0));

describe("the terminal pane", () => {
  it("mounts a shell in the workspace, takes focus, and echoes what is typed", async () => {
    let handle: (action: string) => void = () => {};
    render(() => (
      <terminalPane.component
        id="p1"
        spec={{ kind: "terminal", mode: "shell" }}
        focused={true}
        shell={shellSeams()}
        onAction={(handler) => {
          handle = handler;
        }}
      />
    ));
    await settle();
    const surface = surfaces[0] as FakeSurface;
    expect(surface.focused).toBe(true);
    expect(surface.text()).toContain("C:/work> ");
    surface.type("dir\r");
    expect(surface.text()).toContain("dir\r\ndir\r\n");
    surface.grow({ cols: 132, rows: 50 });
    expect(surface.text()).toContain("[132x50]");
    handle("terminal.clear");
    expect(surface.clears).toBe(1);
  });

  it("renders a bash turn in mirror mode and offers the session picker without one", async () => {
    const [spec, setSpec] = createSignal<TerminalSpec>({
      kind: "terminal",
      mode: "mirror",
      sessionId: "s1",
    });
    const view = render(() => (
      <terminalPane.component
        id="p1"
        spec={spec()}
        focused={false}
        shell={shellSeams()}
        onAction={() => {}}
      />
    ));
    await settle();
    const surface = surfaces[0] as FakeSurface;
    expect(surface.text()).toContain("$ echo hi");
    expect(surface.text()).toContain("hi\r\n");
    expect(surface.text()).toContain("done");
    expect(surface.focused).toBe(false);
    setSpec({ kind: "terminal", mode: "mirror" });
    await settle();
    expect(view.container.textContent).toContain("mirror needs a session");
  });

  it("cycles its mode through the shell's rebind and shows the exit line when the shell ends", async () => {
    const rebound: PaneSpecBase[] = [];
    let handle: (action: string) => void = () => {};
    const view = render(() => (
      <terminalPane.component
        id="p1"
        spec={{ kind: "terminal", mode: "shell" }}
        focused={true}
        shell={shellSeams(rebound)}
        onAction={(handler) => {
          handle = handler;
        }}
      />
    ));
    await settle();
    handle("terminal.mode.cycle");
    expect(rebound).toEqual([{ kind: "terminal", mode: "mirror" }]);
    (surfaces[0] as FakeSurface).type("exit\r");
    await settle();
    expect(view.container.textContent).toContain("exited with code 0");
  });

  it("describes itself per mode and names the leader in its empty state", () => {
    const shell = shellSeams();
    expect(terminalPane.title({ kind: "terminal", mode: "shell" }, shell)).toBe("shell");
    expect(terminalPane.title({ kind: "terminal", mode: "bridge" }, shell)).toBe("keywork");
    expect(terminalPane.title({ kind: "terminal", mode: "bridge", verb: "connect" }, shell)).toBe(
      "keywork connect",
    );
    expect(terminalPane.title({ kind: "terminal", mode: "mirror" }, shell)).toBe("mirror");
    expect(terminalPane.emptyState(shell.keys)).toContain("except ctrl+k");
    expect(terminalPane.adornments?.({ kind: "terminal", mode: "bridge" }, shell)).toEqual({
      modeWord: "bridge",
    });
    expect(terminalPane.summon?.spec(shell, "mirror")).toEqual({
      kind: "terminal",
      mode: "mirror",
      sessionId: "s1",
    });
    expect(terminalPane.summon?.spec(shell)).toEqual({ kind: "terminal", mode: "shell" });
  });
});
