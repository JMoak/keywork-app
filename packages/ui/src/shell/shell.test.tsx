import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, SessionDetail, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { attireStorageKey, createAttire } from "../theme/attire.ts";
import { createWardrobe } from "../theme/wardrobe.ts";
import { idleControlsClient } from "./controls-store.test.ts";
import { inertMemoryClient } from "./memory-store.test.ts";
import { emptySurfacesClient } from "./surfaces-store.test.ts";
import { inertWorkspaceClient } from "./trust.test.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const fixture = (name: string): string =>
  readFileSync(join(process.cwd(), "packages/client/src/fixtures", name), "utf8");

const toolStream = fixture("tool.jsonl")
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as BusEnvelope);

const liveAsk = fixture("asked-granted.jsonl")
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as BusEnvelope)
  .filter((envelope) => envelope.id <= 6)
  .map((envelope) => ({ ...envelope, id: envelope.id + 300, ts: new Date().toISOString() }));

const storedDetail = JSON.parse(fixture("session-detail.json")) as SessionDetail;

function fakeClient(options: { pendingAsk?: boolean; arc?: string } = {}): {
  client: KeyworkClient;
  prompts: string[];
  aborts: string[];
  answers: string[];
  emit: (envelopes: BusEnvelope[]) => void;
} {
  const answers: string[] = [];
  const prompts: string[] = [];
  const aborts: string[] = [];
  const summaries: SessionSummary[] = [
    {
      id: "s1",
      title: "run echo served",
      createdAt: storedDetail.createdAt,
      lastActivityAt: storedDetail.lastActivityAt,
      messageCount: 4,
      ...(options.arc !== undefined && { arc: options.arc }),
    },
  ];
  let push: ((envelope: BusEnvelope) => void) | undefined;
  const queue: BusEnvelope[] = [];
  const client: KeyworkClient = {
    url: "http://127.0.0.1:4770",
    document: async () => ({ version: "0.0.1", operationIds: [] }),
    sessions: async () => summaries,
    session: async (id) => (id === "s1" ? storedDetail : undefined),
    createSession: async () => {
      const created: SessionSummary = {
        id: `s${summaries.length + 1}`,
        title: "(untitled session)",
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        messageCount: 0,
      };
      summaries.unshift(created);
      return created;
    },
    prompt: async (id, text) => {
      if (!summaries.some((summary) => summary.id === id)) return "missing";
      prompts.push(`${id}: ${text}`);
      return "started";
    },
    abort: async (id) => {
      aborts.push(id);
      return "aborted";
    },
    inject: async () => "started",
    entries: async () => undefined,
    fork: async () => "missing",
    labelEntry: async () => "missing",
    moveLeaf: async () => "missing",
    changes: async () => "missing",
    ...inertMemoryClient(),
    ...idleControlsClient(),
    ...inertWorkspaceClient(),
    ...emptySurfacesClient(),
    changedFile: async () => "missing",
    removeSession: async () => "missing",
    listTrash: async () => [],
    restoreSession: async () => "missing",
    discardTrashedSession: async () => "missing",
    purgeTrash: async () => ({ purged: 0 }),
    asks: async () =>
      options.pendingAsk
        ? [
            {
              sessionId: "s1",
              callId: "c9",
              tool: "bash",
              arguments: { command: "rm -rf dist" },
              askedAt: new Date().toISOString(),
              rules: [{ action: "bash", resource: "rm -rf *", effect: "allow" as const }],
            },
          ]
        : [],
    answerAsk: async (callId, verdict, scope) => {
      answers.push([callId, verdict, scope].filter((part) => part !== undefined).join(":"));
      return "settled" as const;
    },
    permissions: async () => ({ trusted: false, bundle: [], workspace: [], session: {} }),
    revokeWorkspaceGrant: async (rule) => ({ revoked: rule }),
    events: async function* (options) {
      options?.onOpen?.();
      for (;;) {
        const next = queue.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }
        await new Promise<void>((resolve) => {
          push = (envelope) => {
            queue.push(envelope);
            push = undefined;
            resolve();
          };
        });
      }
    },
  };
  return {
    client,
    prompts,
    aborts,
    answers,
    emit: (envelopes) => {
      for (const envelope of envelopes) {
        if (push === undefined) queue.push(envelope);
        else push(envelope);
      }
    },
  };
}

async function openTyped(path: string): Promise<void> {
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: path } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.body, { key, bubbles: true, ...modifiers });
}

function pressLeader(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  press("k", { ctrlKey: true });
  press(key, modifiers);
}

function frameNamed(name: string): HTMLElement | undefined {
  return ([...document.querySelectorAll(".kw-frame")] as HTMLElement[]).find(
    (frame) => frame.querySelector(".kw-frame-name")?.textContent === name,
  );
}

function themesHead(): string {
  return document.querySelector(".kw-themes .kw-ov-head")?.textContent ?? "";
}

function wearOnArcBeforeRender(workspace: string, slug: string, theme: string): void {
  createRoot((dispose) => {
    createAttire({
      wardrobe: createWardrobe({ serverThemes: () => [], storage: localStorage }),
      storage: localStorage,
      storageKey: attireStorageKey(workspace),
      arcOf: () => slug,
      dressable: () => true,
      titleOf: (paneId) => paneId,
    }).wear({ kind: "arc", slug }, theme);
    dispose();
  });
}

function hostWithServer() {
  return browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } });
}

describe("the app shell", () => {
  it("opens a workspace, lists sessions, replays stored history, and streams live turns", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("run echo served", { selector: ".kw-tree-name" });
    await screen.findByText("It printed served.");
    expect(screen.getByText("bash echo served", { selector: ".kw-tool-span" })).toBeTruthy();

    const later = toolStream.map((envelope) => ({
      ...envelope,
      id: envelope.id + 100,
      ts: new Date().toISOString(),
    }));
    fake.emit(later);
    await waitFor(() => expect(screen.getAllByText("It printed served.")).toHaveLength(2));
    const usage = "17 tokens · unpriced · live turns only";
    expect(screen.getByText(usage, { selector: ".kw-frame-usage" })).toBeTruthy();
    expect(screen.getByText(usage, { selector: ".kw-status-item" })).toBeTruthy();
  });

  it("sends the composer's prompt and interrupt to the server", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    const input = (await screen.findByLabelText("prompt")) as HTMLTextAreaElement;
    input.value = "hello there";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fake.prompts).toEqual(["s1: hello there"]));
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(fake.aborts).toEqual(["s1"]));
  });

  it("restores a pending ask from the server and answers it with the approve chord", async () => {
    const fake = fakeClient({ pendingAsk: true });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    const card = await screen.findByRole("group", { name: "permission ask" });
    expect(card.textContent).toContain("rm -rf dist");
    expect(card.textContent).toContain("rm -rf *");
    fireEvent.keyDown(document, { key: "y", ctrlKey: true });
    await waitFor(() => expect(fake.answers).toEqual(["c9:granted"]));
  });

  it("lets the ask card take the keys from a composer that just sent its prompt", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    const input = (await screen.findByLabelText("prompt")) as HTMLTextAreaElement;
    input.focus();
    input.value = "run echo served";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fake.prompts).toEqual(["s1: run echo served"]));
    expect(document.activeElement).toBe(input);
    fake.emit(liveAsk);
    const card = await screen.findByRole("group", { name: "permission ask" });
    await waitFor(() => expect(document.activeElement).toBe(card));
    fireEvent.keyDown(card, { key: "w" });
    await waitFor(() => expect(fake.answers).toEqual(["c1:granted:workspace"]));
  });

  it("answers for the workspace with the global chord while a draft holds the composer", async () => {
    const fake = fakeClient({ pendingAsk: true });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    const card = await screen.findByRole("group", { name: "permission ask" });
    expect(card.textContent).toContain("alt+w");
    const input = (await screen.findByLabelText("prompt")) as HTMLTextAreaElement;
    input.focus();
    input.value = "while you wait";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "w", code: "KeyW", altKey: true });
    await waitFor(() => expect(fake.answers).toEqual(["c9:granted:workspace"]));
    expect(input.value).toBe("while you wait");
  });

  it("offers to restore the session a pane shows when the server moves it to the trash", async () => {
    const fake = fakeClient();
    const restored: string[] = [];
    const client: KeyworkClient = {
      ...fake.client,
      restoreSession: async (id) => {
        restored.push(id);
        return (await fake.client.sessions())[0] ?? "missing";
      },
    };
    render(() => <App host={hostWithServer()} connect={() => client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    fake.emit([
      {
        id: 200,
        ts: new Date().toISOString(),
        sessionId: "",
        type: "session.removed",
        payload: { sessionId: "s1" },
      },
    ]);
    const offer = await screen.findByText(
      'removed "run echo served" · it is in the trash, memory notes stay · restore it? y/n',
    );
    fireEvent.keyDown(offer, { key: "y" });
    await waitFor(() => expect(restored).toEqual(["s1"]));
    await screen.findByText('restored "run echo served" · it is back in the session tree');
  });

  it("rehomes a restored pane whose session the server no longer knows", async () => {
    localStorage.setItem(
      "keywork.layout:C:/work",
      JSON.stringify({
        layout: {
          version: 1,
          tree: { kind: "leaf", id: "conversation-1" },
          focused: "conversation-1",
          docks: {},
        },
        specs: { "conversation-1": { kind: "conversation", sessionId: "never-prompted" } },
      }),
    );
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText(/the session this pane showed is gone from the server/);
    const input = (await screen.findByLabelText("prompt")) as HTMLTextAreaElement;
    input.value = "are you there";
    fireEvent.input(input);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(fake.prompts).toEqual(["s2: are you there"]));
  });

  it("dresses a conversation in its arc's theme while the house panes keep the window's", async () => {
    wearOnArcBeforeRender("C:/work", "pricing", "nord");
    const fake = fakeClient({ arc: "pricing" });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    await waitFor(() => expect(frameNamed("run echo served")?.dataset.theme).toBe("nord"));
    expect(frameNamed("run echo served")?.dataset.attire).toBe("arc");
    expect(frameNamed("sessions")?.dataset.attire).toBeUndefined();
    expect(frameNamed("sessions")?.dataset.theme).toBeUndefined();
  });

  it("marks the focused pane with the leader and shows the mark in its title row", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    pressLeader("b");
    const conversation = frameNamed("run echo served");
    await waitFor(() => expect(conversation?.querySelector(".kw-frame-mark")).toBeTruthy());
    await screen.findByText("marked · 1 pane carries the mark · theme-marked dresses them");
    expect(frameNamed("sessions")?.querySelector(".kw-frame-mark")).toBeNull();
  });

  it("retargets the open themes pane to the focused pane and wears the theme there alone", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    pressLeader("F", { shiftKey: true });
    await waitFor(() => expect(frameNamed("themes")?.dataset.focused).toBe(""));
    expect(themesHead()).toContain("the window");
    press("2", { altKey: true });
    pressLeader("w");
    await waitFor(() => expect(themesHead()).toContain('pane "run echo served"'));
    expect(document.querySelectorAll(".kw-themes")).toHaveLength(1);
    expect(frameNamed("themes")?.dataset.focused).toBe("");
    press("j");
    const chosen = document.querySelector(".kw-themes-row[data-cursor]") as HTMLElement;
    const name = chosen.dataset.themeName;
    press("Enter");
    const conversation = frameNamed("run echo served");
    await waitFor(() => expect(conversation?.dataset.attire).toBe("pane"));
    expect(conversation?.dataset.theme).toBe(name);
    expect(frameNamed("themes")?.dataset.attire).toBeUndefined();
    expect(frameNamed("sessions")?.dataset.attire).toBeUndefined();
  });

  it("says why when the server answers the open but its sessions cannot be read", async () => {
    const fake = fakeClient();
    const failing: KeyworkClient = {
      ...fake.client,
      sessions: async () => {
        throw new Error("GET /sessions answered 500");
      },
    };
    render(() => <App host={hostWithServer()} connect={() => failing} />);
    await openTyped("C:/work");
    await screen.findByText("could not open C:/work · GET /sessions answered 500");
    expect(screen.queryByText(/starting keywork in/)).toBeNull();
  });

  it("says why when the host itself throws while opening a recent workspace", async () => {
    const host = {
      ...hostWithServer(),
      recentWorkspaces: async () => [{ path: "C:/work", openedAt: new Date().toISOString() }],
      openWorkspace: async () => {
        throw new Error("Error invoking remote method 'host:open-workspace'");
      },
    };
    render(() => <App host={host} connect={() => fakeClient().client} />);
    fireEvent.click(await screen.findByText("C:/work"));
    await screen.findByText(
      "could not open C:/work · Error invoking remote method 'host:open-workspace'",
    );
    expect(screen.queryByText(/starting keywork in/)).toBeNull();
  });

  it("shows the host's failure text when a workspace cannot open", async () => {
    render(() => <App host={browserHost()} connect={() => fakeClient().client} />);
    await openTyped("C:/work");
    await screen.findByText(/no server/);
  });
});
