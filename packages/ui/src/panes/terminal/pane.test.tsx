import { emptyProjection, projectAll } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHost } from "../../host/browser.ts";
import type { HostPort } from "../../host/port.ts";
import { createKeyboardScope, KeyboardScopeProvider } from "../../shell/keyboard-claim.ts";
import { inertShellExtras } from "../../shell/trust-testing.ts";
import type { PaneSpecBase, ShellSeams } from "../registry.ts";
import { type TerminalSpec, terminalPane } from "./index.tsx";
import { type FakeSurface, fakeSurface } from "./session-testing.ts";

const surfaces: FakeSurface[] = [];

vi.mock("./surface.ts", () => ({
  xtermSurface: () => {
    const surface = Object.assign(fakeSurface(), {
      setTheme: () => {},
      remeasure: () => {},
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

function recordingHost(written: string[]): HostPort {
  const host = browserHost();
  return {
    ...host,
    pty: {
      ...host.pty,
      write: (id, data) => {
        written.push(data);
        host.pty.write(id, data);
      },
    },
  };
}

function shellSeams(rebound: PaneSpecBase[] = [], host: HostPort = browserHost()): ShellSeams {
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
    host,
    workspace: "C:/work",
    currentSession: () => "s1",
    focusedPane: () => undefined,
    rebind: (_paneId, spec) => {
      rebound.push(spec);
    },
    unseen: () => false,
    ...inertShellExtras(),
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
    expect(surface.text().endsWith("\f")).toBe(true);
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
    expect(terminalPane.title({ kind: "terminal", mode: "bridge" }, shell)).toBe("bridge");
    expect(terminalPane.title({ kind: "terminal", mode: "bridge", verb: "connect" }, shell)).toBe(
      "connect",
    );
    expect(terminalPane.title({ kind: "terminal", mode: "mirror" }, shell)).toBe("mirror");
    expect(terminalPane.emptyState(shell.keys)).toContain("every key but the leader");
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

describe("a shell in the terminal pane", () => {
  function mountShell(shell: ShellSeams, keyboard = createKeyboardScope()) {
    let handle: (action: string) => void = () => {};
    const view = render(() => (
      <KeyboardScopeProvider value={keyboard}>
        <terminalPane.component
          id="p1"
          spec={{ kind: "terminal", mode: "shell" }}
          focused={true}
          shell={shell}
          onAction={(handler) => {
            handle = handler;
          }}
        />
      </KeyboardScopeProvider>
    ));
    return { view, act: (action: string) => handle(action) };
  }

  function stubClipboard(): string[] {
    const copied: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => void copied.push(text),
        readText: async () => "pasted",
      },
    });
    return copied;
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("takes the keyboard back when an overlay that covered it closes", async () => {
    const keyboard = createKeyboardScope();
    mountShell(shellSeams(), keyboard);
    await settle();
    const surface = surfaces[0] as FakeSurface;
    expect(surface.focused).toBe(true);
    surface.blur();
    keyboard.returnHome();
    expect(surface.focused).toBe(true);
  });

  it("copies only a real selection, so copying nothing leaves the clipboard alone", async () => {
    const copied = stubClipboard();
    const { act } = mountShell(shellSeams());
    await settle();
    const surface = surfaces[0] as FakeSurface;
    surface.selected = "";
    act("terminal.copy");
    surface.selected = "git status";
    act("terminal.copy");
    await settle();
    expect(copied).toEqual(["git status"]);
  });

  it("clears through the shell so a wrapped prompt survives, and on screen once the shell is gone", async () => {
    const written: string[] = [];
    const { act } = mountShell(shellSeams([], recordingHost(written)));
    await settle();
    const surface = surfaces[0] as FakeSurface;
    act("terminal.clear");
    expect(written).toEqual(["\f"]);
    expect(surface.clears).toBe(0);
    surface.type("\rexit\r");
    await settle();
    act("terminal.clear");
    expect(surface.clears).toBe(1);
  });

  it("hands the leader to the shell when it is pressed twice", async () => {
    const written: string[] = [];
    const { act } = mountShell(shellSeams([], recordingHost(written)));
    await settle();
    act("terminal.send-leader");
    expect(written).toEqual(["\x0b"]);
  });

  it("starts the shell again in place when enter is pressed after it exits", async () => {
    const { view, act } = mountShell(shellSeams());
    await settle();
    const surface = surfaces[0] as FakeSurface;
    act("terminal.restart");
    expect(surface.resets).toBe(1);
    surface.type("exit\r");
    await settle();
    expect(view.container.textContent).toContain("exited with code 0 · enter starts it again");
    surface.type("x");
    expect(surface.resets).toBe(1);
    surface.type("\r");
    await settle();
    expect(surface.resets).toBe(2);
    expect(view.container.textContent).not.toContain("exited");
    expect(surface.text()).toContain("C:/work> ");
    surface.type("dir\r");
    expect(surface.text()).toContain("dir\r\ndir\r\n");
  });
});
