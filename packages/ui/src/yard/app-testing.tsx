import type { ConsoleClient } from "@keywork-app/client";
import { type ProductProfile, steadProfile } from "@keywork-app/product";
import type {
  BusEnvelope,
  CreatureSummary,
  SessionRow,
  Setting,
  WorkspaceView,
} from "@keywork-app/protocol";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { vi } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import type { HostPort, SurroundingsPort } from "../host/port.ts";
import { fakeClient } from "../shell/client-testing.ts";
import { eventFeed } from "./testing.ts";

export const homePath = "/managed-home";
export const conversationId = "home-conversation";
export const date = "2026-11-08T09:00:00.000Z";
export const wren = {
  slug: "wren",
  name: "Wren",
  sigil: "W",
  created: date,
  skin: "kid",
  seed: 1,
  workshop: "host",
  models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  conversation: conversationId,
  threads: 0,
} as CreatureSummary;
export const conversation: SessionRow = {
  id: conversationId,
  title: "Wren at home",
  createdAt: date,
  lastActivityAt: date,
  messageCount: 0,
  bot: "wren",
};
export interface YardHarness {
  emit(envelopes: readonly BusEnvelope[]): void;
  readonly answered: Array<[string, string]>;
  readonly listed: ReturnType<typeof vi.fn>;
}

export async function openYard(
  profile: ProductProfile = steadProfile,
  surroundings?: SurroundingsPort,
  served: Partial<ConsoleClient> = {},
): Promise<YardHarness> {
  const feed = eventFeed();
  const answered: Array<[string, string]> = [];
  const listed = vi.fn(async () => [] as Setting[]);
  const client = fakeClient({
    workspace: async () => reading(),
    sessions: async () => [conversation],
    session: async (id) =>
      id === conversationId
        ? { ...conversation, cwd: homePath, asOf: 0, live: true, messages: [] }
        : undefined,
    creatures: async () => [wren],
    routines: async () => [],
    listCreatureProjects: async () => ({ projects: [] }),
    bots: async () => [{ name: "wren", sigil: "W", source: "project", sessions: 1 }],
    settings: listed,
    answerSetting: async (id, outcome) => {
      answered.push([id, outcome]);
      return undefined;
    },
    events: feed.events,
    ...served,
  } as Partial<ConsoleClient>);
  const host: HostPort = browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } });
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
  host.openExternal = async () => undefined;
  const hosted: HostPort = surroundings === undefined ? host : { ...host, surroundings };
  render(() => <App profile={profile} host={hosted} connect={() => client} />);
  if (profile.startup === "creature") {
    await screen.findByText("Wren at home", { selector: ".kw-frame-name" });
  } else {
    const input = await screen.findByLabelText("workspace");
    fireEvent.input(input, { target: { value: homePath } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await screen.findByText("Wren at home", { selector: ".kw-frame-name" });
  }
  return { emit: feed.emit, answered, listed };
}

export function reading(): WorkspaceView {
  return {
    identity: "qualified-home",
    name: "Home",
    anchor: { root: homePath, source: "launch" },
    declared: false,
    contextDirs: [],
    missingContextDirs: [],
    focusDirs: [],
    trust: "trusted",
    readiness: "undeclared",
  };
}

export function typing(): HTMLTextAreaElement {
  const composer = screen.getByLabelText("prompt") as HTMLTextAreaElement;
  composer.focus();
  fireEvent.focusIn(composer);
  return composer;
}

export function pressLeader(name: string, modifiers: { shiftKey?: boolean } = {}): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "k", ctrlKey: true });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: name, ...modifiers });
}

export function key(name: string): void {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: name });
}

export function yardField(): HTMLElement | null {
  return document.querySelector(".kw-yard");
}

export function satelliteOf(id: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`.kw-yard-satellite[data-setting="${id}"]`);
  if (found === null) throw new Error(`no satellite for ${id}`);
  return found;
}

export function cardCalled(title: string): HTMLElement {
  const found = cardTitled(title);
  if (found === undefined) throw new Error(`no card titled ${title}`);
  return found;
}

export function cardTitled(title: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(".kw-yard-card")].find(
    (card) => card.querySelector(".kw-yard-card-title")?.textContent === title,
  );
}

export function hubNames(): Array<string | null> {
  const hub = document.querySelector(".kw-yard-hub") as HTMLElement;
  return [...hub.querySelectorAll<HTMLElement>(".kw-slot")]
    .toSorted((a, b) => Number.parseFloat(a.style.left) - Number.parseFloat(b.style.left))
    .map((slot) => slot.querySelector(".kw-frame-name")?.textContent ?? null);
}

export function frameNamed(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(".kw-frame")].find(
    (frame) => frame.querySelector(".kw-frame-name")?.textContent === name,
  );
}
