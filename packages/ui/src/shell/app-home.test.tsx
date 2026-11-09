import { steadProfile } from "@keywork-app/product";
import type {
  CreatureDetail,
  CreatureSummary,
  SessionRow,
  WorkspaceView,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import type { HostPort, NeedsYouTrigger, OpenedWorkspace } from "../host/port.ts";
import { fakeClient } from "./client-testing.ts";
import { connectFix } from "./open-failure.tsx";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const homePath = "/managed-home";
const projectPath = "/project";
const homeIdentity = "qualified-home";
const projectIdentity = "qualified-project";
const date = "2026-10-31T09:00:00Z";
const wren: CreatureSummary = {
  slug: "wren",
  name: "Wren",
  sigil: "W",
  created: date,
  skin: "kid",
  seed: 1,
  workshop: "host",
  models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  conversation: "home-conversation",
  threads: 0,
};
const resident: CreatureDetail = {
  ...wren,
  conversation: "home-conversation",
  introduction: "",
  threads: [],
  nextRun: null,
  usage: { date, sessions: 1, costNanos: null },
  routines: "",
};
const conversation: SessionRow = {
  id: "home-conversation",
  title: "Wren at home",
  createdAt: date,
  lastActivityAt: date,
  messageCount: 0,
  bot: "wren",
};
const ide: SessionRow = {
  id: "project-ide",
  title: "Project conversation",
  createdAt: date,
  lastActivityAt: date,
  messageCount: 0,
};

function opened(workspace: string): OpenedWorkspace {
  return {
    workspace,
    serverLabel: "localhost",
    attached: true,
    version: "test",
    binary: undefined,
  };
}

function reading(root: string, identity: string, name: string): WorkspaceView {
  return {
    identity,
    name,
    anchor: { root, source: "launch" },
    declared: false,
    contextDirs: [],
    missingContextDirs: [],
    focusDirs: [],
    trust: "trusted",
    readiness: "undeclared",
  };
}

function harness() {
  const host = browserHost({ server: { url: "http://127.0.0.1:4770", token: "ticket" } });
  const openHome = vi.fn<NonNullable<HostPort["openHome"]>>(async () => ({
    ok: true,
    opened: opened(homePath),
  }));
  const openWorkspace = vi.fn(host.openWorkspace);
  host.openHome = openHome;
  host.openWorkspace = openWorkspace;
  const switchWorkspace = vi.fn(host.switchWorkspace);
  host.switchWorkspace = switchWorkspace;
  const activations = new Set<(trigger: NeedsYouTrigger) => void>();
  host.onNotificationActivated = (receive) => {
    activations.add(receive);
    return () => {
      activations.delete(receive);
    };
  };
  const activate = (trigger: NeedsYouTrigger): void => {
    for (const receive of activations) receive(trigger);
  };
  const home = fakeClient({
    workspace: async () => reading(homePath, homeIdentity, "Home"),
    sessions: async () => [conversation],
    session: async (id) =>
      id === conversation.id
        ? { ...conversation, cwd: homePath, asOf: 0, live: true, messages: [] }
        : undefined,
    creatures: async () => [wren],
    creature: async () => resident,
    routines: async () => [],
    listCreatureProjects: async () => ({ projects: [] }),
    bots: async () => [{ name: "wren", sigil: "W", source: "project", sessions: 1 }],
  });
  const project = fakeClient({
    workspace: async () => reading(projectPath, projectIdentity, "Project"),
    sessions: async () => [ide],
    session: async (id) =>
      id === ide.id ? { ...ide, cwd: projectPath, asOf: 0, live: true, messages: [] } : undefined,
  });
  const connect = vi.fn((_host, path: string) => (path === homePath ? home : project));
  return { host, openHome, openWorkspace, switchWorkspace, connect, activate };
}

it("opens the standalone creature home and conversation before selecting a project", async () => {
  const h = harness();
  render(() => <App profile={steadProfile} host={h.host} connect={h.connect} />);
  await screen.findByText("Wren at home", { selector: ".kw-frame-name" });
  expect(screen.getByRole("region", { name: "stead" })).toBeTruthy();
  expect(screen.queryByLabelText("workspace")).toBeNull();
  expect(h.openHome).toHaveBeenCalledTimes(1);
  expect(h.openWorkspace).not.toHaveBeenCalled();
  expect(h.connect).toHaveBeenCalledWith(expect.anything(), homePath);
});

it("uses the same home from the optional Keywork pane while the IDE stays attached", async () => {
  const h = harness();
  const { container } = render(() => <App host={h.host} connect={h.connect} />);
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: projectPath } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("Project conversation", { selector: ".kw-frame-name" });
  expect(h.openHome).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document.body, { key: "0" });
  fireEvent.click(await screen.findByRole("button", { name: "Open Wren’s conversation" }));
  await screen.findByRole("button", { name: "Back to creatures" });
  expect(container.querySelectorAll(".kw-workspace")).toHaveLength(1);
  expect(screen.getByText("Project conversation", { selector: ".kw-frame-name" })).toBeTruthy();
  expect(h.openWorkspace).toHaveBeenCalledExactlyOnceWith(projectPath);
  expect(h.openHome).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(h.connect).toHaveBeenCalledTimes(2));

  fireEvent.click(screen.getByRole("button", { name: "Back to creatures" }));
  h.activate({ kind: "ask", workspace: homePath, sessionId: conversation.id, callId: "home-ask" });
  await screen.findByRole("button", { name: "Back to creatures" });
  expect(h.switchWorkspace).not.toHaveBeenCalled();
});

it("reopens runtime consent only when the keeper explicitly retries home", async () => {
  const h = harness();
  const enableRuntime = vi.fn(async () => undefined);
  h.host.enableRuntime = enableRuntime;
  h.openHome.mockResolvedValueOnce({
    ok: false,
    failure: {
      kind: "unresolved",
      message: "Background work is disabled.",
      nextAction: "Retry home.",
    },
  });
  render(() => <App profile={steadProfile} host={h.host} connect={h.connect} />);
  const retry = await screen.findByRole("button", { name: "Retry home" });
  expect(enableRuntime).not.toHaveBeenCalled();
  fireEvent.click(retry);
  await screen.findByText("Wren at home", { selector: ".kw-frame-name" });
  expect(enableRuntime).toHaveBeenCalledTimes(1);
  expect(h.openHome).toHaveBeenCalledTimes(2);
});

it("says in the yard, in stead words, when a project cannot open for want of a model", async () => {
  const h = harness();
  h.openWorkspace.mockResolvedValueOnce({
    ok: false,
    failure: {
      kind: "unresolved",
      message: "no inference provider is configured",
      nextAction: "run keywork connect",
    },
  });
  const { container } = render(() => (
    <App profile={steadProfile} host={h.host} connect={h.connect} />
  ));
  await screen.findByText("Wren at home", { selector: ".kw-frame-name" });
  void h.host.switchWorkspace(projectPath);
  const card = await screen.findByRole("complementary", { name: "project did not open" });
  expect(container.querySelector(".kw-yard[data-mode='yard']")?.closest(".kw-workspace")).toBe(
    card.closest(".kw-workspace"),
  );
  expect(within(card).getByRole("status").textContent).toBe("no model is connected");
  expect(card.textContent).toContain(connectFix);
  expect(card.textContent).not.toContain("inference provider");
  fireEvent.click(within(card).getByRole("button", { name: "open it again" }));
  await waitFor(() => expect(h.connect).toHaveBeenCalledWith(expect.anything(), projectPath));
  expect(h.openWorkspace).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("complementary", { name: "project did not open" })).toBeNull();
});
