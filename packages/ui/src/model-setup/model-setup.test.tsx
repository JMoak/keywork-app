import { keyworkProfile } from "@keywork-app/product";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { browserHost } from "../host/browser.ts";
import type { HostPort, PtyExit, ServerResponseHead } from "../host/port.ts";
import { fakeSurface } from "../panes/terminal/session-testing.ts";
import { type OpenFailureView, openFailureView, plainOpenFailure } from "../shell/open-failure.tsx";
import { OpenScreen } from "../shell/open-screen.tsx";
import { ModelSetup } from "./index.tsx";
import { setupInventory } from "./inventory.ts";

vi.mock("../panes/terminal/surface.ts", () => ({
  xtermSurface: () => Object.assign(fakeSurface(), { setTheme: () => {}, remeasure: () => {} }),
}));

afterEach(cleanup);

describe("model setup", () => {
  it("uses the strong model for conversations on runtimes without a conversation field", () => {
    const model = { provider: "openai", model: "legacy-default" };
    expect(
      setupInventory({ nodes: [], inherits: { strong: model } }, "conversation").selected,
    ).toEqual(model);
  });

  it("checks only the named local model after an explicit request and uses fresh project eligibility", async () => {
    const target = { endpoint: "http://127.0.0.1:1234", model: "local/model" };
    const model = { provider: "local", model: target.model };
    const serverFetch = vi.fn<HostPort["serverFetch"]>(async (_workspace, path) => {
      if (path === "/models/probe") return json(200, { status: "recognized" });
      if (path === "/models/refresh") return json(200, report(model));
      return json(200, {
        ...report(),
        conversation: { ...model, mode: "chat", projectCheck: target },
        inherits: {
          strong: { refused: "missing-capability", detail: "Tool calls are unverified." },
        },
      });
    });
    const { host } = setupHost(serverFetch);
    showSetup(host);
    const check = await screen.findByRole("button", { name: "Check project capabilities" });
    expect(serverFetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    fireEvent.click(check);
    expect(
      await screen.findByText(/meets the starting requirements for project work/),
    ).toBeTruthy();
    expect(serverFetch).toHaveBeenNthCalledWith(
      2,
      "C:/managed-home",
      "/models/probe",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ...target, behaviour: true, refresh: true }),
      }),
    );
    expect(serverFetch).toHaveBeenNthCalledWith(
      3,
      "C:/managed-home",
      "/models/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("does not expose an opt-in project probe for a nonlocal endpoint", () => {
    expect(
      setupInventory({
        nodes: [],
        conversation: {
          provider: "remote",
          model: "remote-model",
          mode: "chat",
          projectCheck: { endpoint: "https://remote.test/v1", model: "remote-model" },
        },
      }).projectCheck,
    ).toBeUndefined();
  });

  it("refreshes a connection after cancellation while keeping the stopped status", async () => {
    const model = { provider: "openai", model: "existing" };
    const serverFetch = vi.fn<HostPort["serverFetch"]>(async () => json(200, report(model)));
    const { host, exit } = setupHost(serverFetch);
    const use = vi.fn();
    showSetup(host, use);
    await screen.findByText("existing");
    fireEvent.click(screen.getByRole("button", { name: /Flagship AI/ }));
    await waitFor(() => expect(host.pty.open).toHaveBeenCalledOnce());
    exit(130);
    expect(await screen.findByText(/Model setup stopped.*Starting model unchanged/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check selection again" })).toBeTruthy();
    expect(serverFetch).toHaveBeenLastCalledWith(
      "C:/managed-home",
      "/models/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(use).not.toHaveBeenCalled();
  });
  it("keeps the current choice and the focused route when local discovery completes", async () => {
    let answer!: (result: ServerResponseHead) => void;
    const requests = new Promise<ServerResponseHead>((resolve) => {
      answer = resolve;
    });
    const { host } = setupHost(async () => requests);
    showSetup(host);
    const flagship = screen.getByRole("button", { name: /Flagship AI/ });
    flagship.focus();
    answer(json(200, report({ provider: "openai", model: "current" }, true)));
    expect(await screen.findByText("current")).toBeTruthy();
    expect(screen.getByText("local-model is loaded locally.")).toBeTruthy();
    expect(document.activeElement).toBe(flagship);
    expect(
      screen.getByRole("button", { name: /On this computer/ }).hasAttribute("data-recommended"),
    ).toBe(false);
    expect(host.pty.open).not.toHaveBeenCalled();
  });

  it("names the detected server without recommending a model that is still loading", async () => {
    const { host } = setupHost(async () => json(200, report(undefined, false)));
    showSetup(host);
    expect(await screen.findByText(/ollama found/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /On this computer/ }).hasAttribute("data-recommended"),
    ).toBe(false);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("does not call a network endpoint local or replace an unconfirmed saved creature choice", async () => {
    const { host } = setupHost(async () =>
      json(
        200,
        report({ provider: "default", model: "different" }, true, "http://192.168.0.10:11434"),
      ),
    );
    render(() => (
      <ModelSetup
        host={host}
        workspace="C:/managed-home"
        heading="Connect a model"
        continueLabel="Continue"
        current={{ provider: "saved", model: "preserved" }}
        onContinue={vi.fn()}
        onExplore={vi.fn()}
      />
    ));
    expect(await screen.findByText("No local service found yet.")).toBeTruthy();
    expect(screen.getByText(/Saved model · saved/)).toBeTruthy();
    expect(screen.queryByText("different")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("runs only the chosen terminal route and reads the active model before offering to continue", async () => {
    const selected = { provider: "openrouter", model: "test/model" };
    const serverFetch = vi.fn<HostPort["serverFetch"]>(async (_workspace, path) =>
      json(200, report(path === "/models/refresh" ? selected : undefined)),
    );
    const { host, exit } = setupHost(serverFetch);
    const use = vi.fn();
    showSetup(host, use);
    await screen.findByText("No local service found yet.");
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
    await waitFor(() => expect(host.pty.open).toHaveBeenCalledOnce());
    expect(host.pty.open).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace: "C:/managed-home",
        program: "keywork",
        args: ["connect", "--group", "openrouter", "--first-model"],
      }),
    );
    expect(serverFetch).toHaveBeenCalledTimes(1);
    exit(0);
    expect(await screen.findByText("test/model")).toBeTruthy();
    expect(serverFetch).toHaveBeenLastCalledWith(
      "C:/managed-home",
      "/models/refresh",
      expect.objectContaining({ method: "POST" }),
    );
    expect(use).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(use).toHaveBeenCalledWith(selected);
  });

  it.each([404, 503])(
    "keeps the previous choice visible while refusing an unverified refresh (%d)",
    async (status) => {
      const serverFetch = vi.fn<HostPort["serverFetch"]>(async (_workspace, path) =>
        path === "/models/refresh"
          ? json(status, { error: "unavailable" })
          : json(200, report({ provider: "openai", model: "previous" })),
      );
      const { host, exit } = setupHost(serverFetch);
      const use = vi.fn();
      showSetup(host, use);
      await screen.findByText("previous");
      fireEvent.click(screen.getByRole("button", { name: /Flagship AI/ }));
      await waitFor(() => expect(host.pty.open).toHaveBeenCalledOnce());
      exit(0);
      expect(
        await screen.findByText(/check again after updating this app and its engine/),
      ).toBeTruthy();
      expect(screen.getByText("previous")).toBeTruthy();
      expect(screen.getByRole<HTMLButtonElement>("button", { name: "Continue" }).disabled).toBe(
        true,
      );
      expect(use).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Check selection again" }));
      await waitFor(() => expect(serverFetch).toHaveBeenCalledTimes(3));
      expect(host.pty.open).toHaveBeenCalledOnce();
    },
  );

  it("reports an unchanged starting model when the user keeps their existing default", async () => {
    const model = { provider: "openai", model: "previous" };
    const { host, exit } = setupHost(async () => json(200, report(model)));
    showSetup(host);
    await screen.findByText("previous");
    fireEvent.click(screen.getByRole("button", { name: /On this computer/ }));
    await waitFor(() => expect(host.pty.open).toHaveBeenCalledOnce());
    exit(0);
    expect(await screen.findByText("Starting model unchanged.")).toBeTruthy();
    expect(screen.getByText(/openai may charge for replies/)).toBeTruthy();
  });

  it("shows why a configured model was refused after terminal setup", async () => {
    const { host, exit } = setupHost(async (_workspace, path) =>
      json(
        200,
        path === "/models/refresh"
          ? {
              nodes: [],
              inherits: {
                strong: {
                  refused: "missing-capability",
                  detail: "This model needs a larger context window.",
                },
              },
            }
          : report(),
      ),
    );
    showSetup(host);
    await screen.findByText("No local service found yet.");
    fireEvent.click(screen.getByRole("button", { name: /Flagship AI/ }));
    await waitFor(() => expect(host.pty.open).toHaveBeenCalledOnce());
    exit(0);
    expect(await screen.findByText(/This model needs a larger context window/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("can leave a failed setup without refreshing or opening a project", async () => {
    const serverFetch = vi.fn<HostPort["serverFetch"]>(async () => json(200, report()));
    const { host } = setupHost(serverFetch);
    host.pty.open = vi.fn(async () => {
      throw new Error("no PTY");
    });
    const explore = vi.fn();
    showSetup(host, vi.fn(), explore);
    await screen.findByText("No local service found yet.");
    fireEvent.click(screen.getByRole("button", { name: /On this computer/ }));
    expect(screen.getByText(/Install and open LM Studio or Ollama/)).toBeTruthy();
    expect(await screen.findByText(/terminal could not start/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Explore first" }));
    expect(explore).toHaveBeenCalledOnce();
    expect(serverFetch).toHaveBeenCalledTimes(1);
  });
});

it("keeps the chosen workspace while Keywork model setup uses the managed home", async () => {
  const { host } = setupHost(async () =>
    json(200, report({ provider: "openai", model: "current" })),
  );
  const open = vi.fn();
  host.pickFolder = async () => "C:/chosen-project";
  render(() => <OpenScreen host={host} failure={undefined} opening={undefined} onOpen={open} />);
  fireEvent.click(screen.getByRole("button", { name: "Set up a model" }));
  await screen.findByText("current");
  fireEvent.click(screen.getByRole("button", { name: "open a folder" }));
  expect(await screen.findByText("Folder to open after setup: C:/chosen-project")).toBeTruthy();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Open this folder" }));
  expect(open).toHaveBeenCalledWith("C:/chosen-project");
  expect(host.pty.open).not.toHaveBeenCalled();
});

it("uses the latest folder if the user explores and then chooses another project", async () => {
  const { host } = setupHost(async () =>
    json(200, report({ provider: "openai", model: "current" })),
  );
  const picks = ["C:/first", "C:/second"];
  host.pickFolder = async () => picks.shift();
  const [failure, setFailure] = createSignal<OpenFailureView>();
  render(() => (
    <OpenScreen
      host={host}
      failure={failure()}
      opening={undefined}
      onOpen={(path) => {
        setFailure(plainOpenFailure(path, "A model is needed."));
      }}
    />
  ));
  fireEvent.click(screen.getByRole("button", { name: "Set up a model" }));
  await screen.findByText("current");
  fireEvent.click(screen.getByRole("button", { name: "open a folder" }));
  await screen.findByText("Folder to open after setup: C:/first");
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  fireEvent.click(screen.getByRole("button", { name: "open a folder" }));
  await screen.findByText("A model is needed.");
  fireEvent.click(screen.getByRole("button", { name: "Set up a model" }));
  expect(await screen.findByText("Folder to open after setup: C:/second")).toBeTruthy();
});

it("offers setting up a model as the one way on when a folder did not open for want of one, then opens that folder", async () => {
  const { host } = setupHost(async () =>
    json(200, report({ provider: "openai", model: "current" })),
  );
  const open = vi.fn();
  const keyless = openFailureView(
    "C:/work/keyless",
    {
      kind: "unresolved",
      message: "no inference provider is configured",
      nextAction: "run keywork connect",
    },
    keyworkProfile,
  );
  render(() => (
    <OpenScreen
      host={host}
      failure={keyless}
      opening={undefined}
      onOpen={open}
      onEnableRuntime={vi.fn()}
    />
  ));
  expect(screen.getByText("keyless did not open")).toBeTruthy();
  expect(screen.getByText("no model is connected")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/inference provider|keywork connect/);
  expect(screen.queryByRole("button", { name: "Enable background work" })).toBeNull();
  expect(screen.getAllByRole("button", { name: "Set up a model" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Set up a model" }));
  await screen.findByText("current");
  expect(screen.getByText("Folder to open after setup: C:/work/keyless")).toBeTruthy();
  expect(screen.queryByText("no model is connected")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open this folder" }));
  expect(open).toHaveBeenCalledWith("C:/work/keyless");
});

it("asks before enabling the managed runtime when setup needs background work", async () => {
  const { host } = setupHost(async () => json(200, report()));
  const available = host.openHome;
  if (available === undefined) throw new Error("Missing fixture home");
  let enabled = false;
  host.enableRuntime = vi.fn(async () => {
    enabled = true;
  });
  host.openHome = vi.fn<NonNullable<HostPort["openHome"]>>(async () =>
    enabled
      ? available()
      : {
          ok: false,
          failure: {
            kind: "unresolved",
            message: "Runtime consent is required.",
            nextAction: "Enable background work before opening your creature home or a project.",
          },
        },
  );
  render(() => <OpenScreen host={host} failure={undefined} opening={undefined} onOpen={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Set up a model" }));
  const enable = await screen.findByRole("button", { name: "Enable background work" });
  expect(host.enableRuntime).not.toHaveBeenCalled();
  fireEvent.click(enable);
  await screen.findByRole("heading", { name: "How would you like to connect a model?" });
  expect(host.enableRuntime).toHaveBeenCalledOnce();
  expect(host.openHome).toHaveBeenCalledTimes(2);
});

it("tabs from its heading to its own first choice, never back to the top of the pane around it", async () => {
  const laidOut = vi
    .spyOn(HTMLElement.prototype, "getClientRects")
    .mockReturnValue([{}] as unknown as DOMRectList);
  const { host } = setupHost(async () =>
    json(200, report({ provider: "openai", model: "current" })),
  );
  render(() => (
    <section>
      <button type="button">companion off</button>
      <ModelSetup
        host={host}
        workspace="C:/managed-home"
        heading="How would you like Wren to reply?"
        continueLabel="Open conversation"
        onContinue={vi.fn()}
        onExplore={vi.fn()}
      />
    </section>
  ));
  const continuing = await screen.findByRole("button", { name: "Open conversation" });
  const heading = screen.getByRole("heading", { name: "How would you like Wren to reply?" });
  expect(document.activeElement).toBe(heading);
  fireEvent.keyDown(heading, { key: "Tab" });
  expect(document.activeElement).toBe(continuing);
  laidOut.mockRestore();
});

function showSetup(host: HostPort, use = vi.fn(), explore = vi.fn()): void {
  render(() => (
    <ModelSetup
      host={host}
      workspace="C:/managed-home"
      heading="Connect a model"
      continueLabel="Continue"
      onContinue={use}
      onExplore={explore}
    />
  ));
}

function setupHost(serverFetch: HostPort["serverFetch"]) {
  let onExit: ((exit: PtyExit) => void) | undefined;
  const browser = browserHost();
  const host: HostPort = {
    ...browser,
    serverFetch,
    openHome: async () => ({
      ok: true,
      opened: {
        workspace: "C:/managed-home",
        serverLabel: "home",
        attached: false,
        version: "test",
        binary: undefined,
      },
    }),
    pty: {
      ...browser.pty,
      open: vi.fn(async () => ({ id: 1, title: "connect" })),
      onExit: (_id, listener) => {
        onExit = listener;
        return () => {
          onExit = undefined;
        };
      },
    },
  };
  return { host, exit: (exitCode: number) => onExit?.({ id: 1, exitCode, signal: undefined }) };
}

function json(status: number, body: unknown): ServerResponseHead {
  let bytes: Uint8Array | undefined = new TextEncoder().encode(JSON.stringify(body));
  return {
    status,
    statusText: "",
    headers: [["content-type", "application/json"]],
    read: async () => {
      const chunk = bytes;
      bytes = undefined;
      return chunk;
    },
    cancel: () => {
      bytes = undefined;
    },
  };
}

function report(
  selected?: { provider: string; model: string },
  loaded?: boolean,
  endpoint = "http://127.0.0.1:11434",
) {
  return {
    nodes:
      loaded === undefined
        ? []
        : [
            {
              servers: [
                {
                  kind: "ollama",
                  root: endpoint,
                  health: { state: "up" },
                  models: [
                    {
                      id: "local-model",
                      loaded,
                      health: { state: loaded ? "up" : "loading" },
                      classes: ["strong"],
                    },
                  ],
                },
              ],
            },
          ],
    inherits: selected === undefined ? undefined : { strong: selected },
    market: [{ kind: "openai" }, { kind: "openrouter" }],
  };
}
