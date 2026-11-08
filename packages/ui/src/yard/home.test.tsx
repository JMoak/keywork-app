import type { ConsoleClient } from "@keywork-app/client";
import { keyworkProfile } from "@keywork-app/product";
import type {
  CreatureDetail,
  CreatureSummary,
  SessionRow,
  Setting,
  WorkspaceView,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { fakeClient } from "../shell/client-testing.ts";
import { aSetting, eventFeed, proposed, settled } from "./testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const homePath = "/managed-home";
const projectPath = "/project";
const date = "2026-11-08T09:00:00.000Z";
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
const fromHome = aSetting({
  id: "from-home",
  sessionId: conversation.id,
  what: { kind: "note", ref: "the nightly chore found two stale branches" },
});
const listedAtHome = aSetting({
  id: "listed-at-home",
  sessionId: conversation.id,
  what: { kind: "note", ref: "the preview deploy is green" },
});

describe("the yard while a project is active", () => {
  it("still shows what the creature sets out at home, and answers it at home", async () => {
    const run = await openProjectWithHome();
    await waitFor(() => cardCalled("the preview deploy is green"));
    run.home.emit([proposed(1, fromHome)]);
    const card = await waitFor(() => cardCalled("the nightly chore found two stale branches"));
    expect(card.querySelector(".kw-yard-card-by")?.textContent).toBe("Wren set out a note");

    pressLeader("y");
    const cursor = document.querySelector(".kw-yard-card[data-cursor]");
    const title = cursor?.querySelector(".kw-yard-card-title")?.textContent;
    key("x");
    await waitFor(() => expect(run.answeredAtHome).toHaveLength(1));
    expect(run.answeredInProject).toEqual([]);
    expect(run.answeredAtHome[0]?.[1]).toBe("dismissed");
    expect([fromHome.what.ref, listedAtHome.what.ref]).toContain(title);

    run.home.emit([settled(2, fromHome, "dismissed"), settled(3, listedAtHome, "dismissed")]);
    await waitFor(() =>
      expect(cardTitled("the nightly chore found two stale branches")).toBeUndefined(),
    );
  });
});

async function openProjectWithHome() {
  const home = eventFeed();
  const project = eventFeed();
  const answeredAtHome: Array<[string, string]> = [];
  const answeredInProject: Array<[string, string]> = [];
  const homeClient = fakeClient({
    workspace: async () => reading(homePath, "qualified-home", "Home"),
    sessions: async () => [conversation],
    session: async (id) =>
      id === conversation.id
        ? { ...conversation, cwd: homePath, asOf: 0, live: true, messages: [] }
        : undefined,
    creatures: async () => [wren],
    creature: async () => ({ ...wren, introduction: "", threads: [] }) as unknown as CreatureDetail,
    routines: async () => [],
    listCreatureProjects: async () => ({ projects: [] }),
    bots: async () => [{ name: "wren", sigil: "W", source: "project", sessions: 1 }],
    settings: async () => [listedAtHome] as Setting[],
    answerSetting: async (id, outcome) => {
      answeredAtHome.push([id, outcome]);
      return undefined;
    },
    events: home.events,
  } as Partial<ConsoleClient>);
  const projectClient = fakeClient({
    workspace: async () => reading(projectPath, "qualified-project", "Project"),
    sessions: async () => [ide],
    session: async (id) =>
      id === ide.id ? { ...ide, cwd: projectPath, asOf: 0, live: true, messages: [] } : undefined,
    settings: async () => [] as Setting[],
    answerSetting: async (id, outcome) => {
      answeredInProject.push([id, outcome]);
      return undefined;
    },
    events: project.events,
  } as Partial<ConsoleClient>);
  const host = browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } });
  host.openHome = async () => ({
    ok: true,
    opened: {
      workspace: homePath,
      serverLabel: "localhost",
      attached: true,
      version: "test",
      binary: undefined,
    },
  });
  render(() => (
    <App
      profile={keyworkProfile}
      host={host}
      connect={(_host, path) => (path === homePath ? homeClient : projectClient)}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: projectPath } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("Project conversation", { selector: ".kw-frame-name" });
  pressLeader("0");
  await screen.findByRole("button", { name: "Open Wren’s conversation" });
  pressLeader("Y", { shiftKey: true });
  await waitFor(() =>
    expect(document.querySelector(".kw-yard")?.getAttribute("data-mode")).toBe("yard"),
  );
  return { home, project, answeredAtHome, answeredInProject };
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

function pressLeader(name: string, modifiers: { shiftKey?: boolean } = {}): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: name, ...modifiers });
}

function key(name: string): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: name });
}

function cardCalled(title: string): HTMLElement {
  const found = cardTitled(title);
  if (found === undefined) throw new Error(`no card titled ${title}`);
  return found;
}

function cardTitled(title: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(".kw-yard-card")].find(
    (card) => card.querySelector(".kw-yard-card-title")?.textContent === title,
  );
}
