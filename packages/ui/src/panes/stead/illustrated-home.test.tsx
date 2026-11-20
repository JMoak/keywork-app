import type { ConsoleClient } from "@keywork-app/client";
import { steadProfile } from "@keywork-app/product";
import type {
  BotSummary,
  CreatureDraft,
  CreatureSummary,
  PendingAsk,
  SessionRow,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../../app.tsx";
import { browserHost } from "../../host/browser.ts";
import { localModels, noWorkshops } from "../../onboarding/fixtures.ts";
import { meetingName } from "../../onboarding/meet.tsx";
import { fakeClient } from "../../shell/client-testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("introduces Folio before the map and keeps model setup open as the new creature arrives", async () => {
  const home = openHome([]);
  const name = meetingName(workspace);
  const introduction = within(await screen.findByRole("region", { name: "Meet your creature" }));
  expect(introduction.getByRole("heading", { name: `Meet ${name}` })).toBeTruthy();
  expect(introduction.getByRole("button", { name: "Folio" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.queryByRole("button", { name: "Courtyards" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Back home/ })).toBeNull();
  fireEvent.click(introduction.getByRole("button", { name: "Start a conversation" }));
  const setupHeading = await screen.findByRole("heading", {
    name: `How would you like ${name} to reply?`,
  });
  expect(home.createCreature).toHaveBeenCalledExactlyOnceWith({
    name,
    skin: "folio",
  });
  await waitFor(() =>
    expect(home.bots.mock.results.some(({ value }) => value.length === 1)).toBe(true),
  );
  const beforeNotice = home.creatures.mock.calls.length;
  home.announceCreated();
  await waitFor(() => expect(home.creatures.mock.calls.length).toBeGreaterThan(beforeNotice));
  expect(screen.getByRole("heading", { name: setupHeading.textContent ?? "" })).toBe(setupHeading);
  expect(screen.queryByRole("button", { name: /Talk to / })).toBeNull();
  expect(screen.queryByRole("button", { name: /Explore the stead/i })).toBeNull();
  setupHeading.focus();
  fireEvent.keyDown(setupHeading, { key: "w" });
  expect(screen.getByRole("heading", { name: `How would you like ${name} to reply?` })).toBe(
    setupHeading,
  );
  expect(screen.queryByRole("region", { name: "desk" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Explore first" }));
  expect(await screen.findByRole("button", { name: `Talk to ${name}` })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: /How would you like/ })).toBeNull();
  expect(screen.queryByRole("region", { name: "Meet your creature" })).toBeNull();
  expect(home.createCreature).toHaveBeenCalledTimes(1);
});

it("returns from the map to the resident and preserves the selected courtyard view", async () => {
  openHome([resident("mira", "Mira", "tessera")]);
  const explore = () => screen.getByRole("button", { name: /Explore the stead/i });
  expect(await screen.findByRole("button", { name: "Talk to Mira" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Courtyards" })).toBeNull();
  fireEvent.click(explore());
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Back home/ })),
  );
  fireEvent.click(screen.getByRole("button", { name: "Courtyards" }));
  expect(await screen.findByRole("button", { name: /Open Mira's courtyard/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Back home/ }));
  expect(await screen.findByRole("button", { name: "Talk to Mira" })).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(explore()));
  fireEvent.click(explore());
  expect(screen.getByRole("button", { name: "Courtyards" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect(screen.getByRole("button", { name: /Open Mira's courtyard/ })).toBeTruthy();
});

it("gives the creator the screen when meeting another creature and returns to the same resident on dismissal", async () => {
  const { createCreature } = openHome([resident("mira", "Mira", "tessera")]);
  fireEvent.click(await screen.findByRole("button", { name: "Meet another creature" }));
  const creator = await screen.findByRole("complementary", { name: /creature/ });
  expect(screen.queryByRole("button", { name: "Talk to Mira" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Courtyards" })).toBeNull();
  const name = await within(creator).findByRole("textbox");
  name.focus();
  fireEvent.keyDown(name, { key: "Escape" });
  expect(await screen.findByRole("button", { name: "Talk to Mira" })).toBeTruthy();
  expect(createCreature).not.toHaveBeenCalled();
});

it("features the creature with a real request and opens its own conversation", async () => {
  const { session } = openHome(
    [resident("kit", "Kit", "folio"), resident("mira", "Mira", "tessera")],
    waiting,
  );
  const talk = await screen.findByRole("button", { name: "Talk to Mira" });
  expect(screen.getByRole("button", { name: /Visit Mira's courtyard, at the porch/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Review request" })).toBeTruthy();
  session.mockClear();
  fireEvent.click(talk);
  await waitFor(() => expect(session).toHaveBeenCalledWith("mira-conversation"));
  expect(session).not.toHaveBeenCalledWith("garden-notes");
});

it("opens the live request from home without answering it", async () => {
  const { answerAsk } = openHome([resident("mira", "Mira", "tessera")], waiting);
  fireEvent.click(await screen.findByRole("button", { name: "Review request" }));
  const desk = within(await screen.findByRole("region", { name: "desk" }));
  expect(await desk.findByText(/notes\.md/)).toBeTruthy();
  expect(answerAsk).not.toHaveBeenCalled();
});

it.each(["w", "y"])(
  "routes the %s shortcut on the home screen to review without answering the pending ask",
  async (key) => {
    const { answerAsk } = openHome([resident("mira", "Mira", "tessera")], waiting);
    const review = await screen.findByRole("button", { name: "Review request" });
    review.focus();
    fireEvent.keyDown(review, { key });
    const desk = within(await screen.findByRole("region", { name: "desk" }));
    expect(await desk.findByText(/notes\.md/)).toBeTruthy();
    expect(answerAsk).not.toHaveBeenCalled();
  },
);

const workspace = "/illustrated-home";
const date = "2026-11-19T12:00:00.000Z";
const waiting: PendingAsk = {
  sessionId: "garden-notes",
  callId: "notes",
  tool: "read",
  arguments: { path: "notes.md" },
  askedAt: date,
  rules: [{ action: "read", resource: "notes.md", effect: "allow" }],
};

function openHome(initial: readonly CreatureSummary[], ask?: PendingAsk) {
  const residents = [...initial];
  const host = browserHost({
    server: { url: "http://127.0.0.1:4770", token: "test" },
    fetch: async (url) => {
      switch (new URL(String(url)).pathname) {
        case "/creatures":
          return Response.json({ creatures: residents });
        case "/models":
          return Response.json(localModels.body);
        case "/workshops":
          return Response.json(noWorkshops.body);
        default:
          return Response.json({ error: "Missing" }, { status: 404 });
      }
    },
  });
  host.openHome = async () => ({
    ok: true,
    opened: { workspace, serverLabel: "local", attached: true, version: "test", binary: undefined },
  });
  const creatures = vi.fn(() => [...residents]);
  const bots = vi.fn((): BotSummary[] =>
    residents.map(({ slug, sigil }) => ({ name: slug, sigil, source: "project", sessions: 1 })),
  );
  const createCreature = vi.fn(async (draft: CreatureDraft) => {
    const created = resident("first", draft.name, draft.skin ?? "kid");
    residents.push(created);
    return created;
  });
  const sessions = (): SessionRow[] => [
    ...residents.map((creature) =>
      thread(`${creature.slug}-conversation`, `${creature.name} at home`, creature.slug),
    ),
    ...(ask ? [thread(ask.sessionId, "Garden notes", "mira")] : []),
  ];
  const session = vi.fn(async (id: string) => {
    const row = sessions().find((item) => item.id === id);
    return row && { ...row, cwd: workspace, asOf: 0, live: true, messages: [] };
  });
  const answerAsk = vi.fn<ConsoleClient["answerAsk"]>(async () => "settled");
  let announceCreated = () => {};
  const created = new Promise<void>((resolve) => {
    announceCreated = resolve;
  });
  const client = fakeClient({
    workspace: async () => ({
      identity: "illustrated",
      anchor: { root: workspace, source: "launch" },
      declared: false,
      contextDirs: [],
      missingContextDirs: [],
      focusDirs: [],
      trust: "trusted",
      readiness: "undeclared",
    }),
    permissions: async () => ({ trusted: true, bundle: [], workspace: [], session: {} }),
    creatures: async () => creatures(),
    bots: async () => bots(),
    createCreature,
    creature: async (slug) => {
      const held = residents.find((item) => item.slug === slug);
      if (!held) return { refused: "missing", detail: "Unknown resident" };
      return {
        ...held,
        conversation: `${slug}-conversation`,
        introduction: "",
        threads: [],
        nextRun: null,
        usage: { date, sessions: 1, costNanos: null },
        routines: "",
      };
    },
    sessions: async () => sessions(),
    session,
    routines: async () => [],
    asks: async () => (ask ? [ask] : []),
    answerAsk,
    events: async function* (options) {
      options?.onOpen?.();
      await created;
      yield {
        id: 1,
        ts: date,
        sessionId: "",
        type: "creature.changed",
        payload: { slug: "first", change: "created" },
      };
      await new Promise<void>(() => {});
    },
    listCreatureProjects: async () => ({ projects: [] }),
  });
  render(() => <App profile={steadProfile} host={host} connect={() => client} />);
  return { creatures, bots, createCreature, session, answerAsk, announceCreated };
}

function resident(slug: string, name: string, skin: string): CreatureSummary {
  return {
    slug,
    name,
    skin,
    seed: 0,
    sigil: "◆",
    created: date,
    workshop: "host",
    models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
    conversation: `${slug}-conversation`,
    threads: 0,
  };
}

function thread(id: string, title: string, bot: string): SessionRow {
  return { id, title, bot, createdAt: date, lastActivityAt: date, messageCount: 0 };
}
