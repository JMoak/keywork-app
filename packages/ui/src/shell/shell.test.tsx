import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyworkClient } from "@keywork-app/client";
import type {
  BusEnvelope,
  ContextReport,
  SessionDetail,
  SessionSummary,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { quietMark } from "../chrome/title-row.tsx";
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

const recordedContext = (JSON.parse(fixture("controls.json")) as ControlAnswers).context.body;

interface ControlAnswers {
  readonly context: { readonly body: ContextReport };
}

interface AskedCommand {
  readonly command: string;
  readonly rule: string;
}

const deleteAsked: AskedCommand = { command: "rm -rf dist", rule: "rm -rf *" };

function fakeClient(options: { pendingAsk?: boolean; asked?: AskedCommand; arc?: string } = {}): {
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
    sendNow: async () => "missing",
    moveQueued: async () => "missing",
    cancelQueued: async () => "missing",
    setQuiet: async () => "missing",
    spill: async () => "missing",
    ...inertWorkspaceClient(),
    ...emptySurfacesClient(),
    changedFile: async () => "missing",
    removeSession: async () => "missing",
    listTrash: async () => [],
    restoreSession: async () => "missing",
    discardTrashedSession: async () => "missing",
    purgeTrash: async () => ({ purged: 0 }),
    asks: async () => {
      const asked = options.asked ?? (options.pendingAsk ? deleteAsked : undefined);
      return asked === undefined
        ? []
        : [
            {
              sessionId: "s1",
              callId: "c9",
              tool: "bash",
              arguments: { command: asked.command },
              askedAt: new Date().toISOString(),
              rules: [{ action: "bash", resource: asked.rule, effect: "allow" as const }],
            },
          ];
    },
    answerAsk: async (callId, verdict, scope) => {
      answers.push([callId, verdict, scope].filter((part) => part !== undefined).join(":"));
      return "settled" as const;
    },
    permissions: async () => ({ trusted: false, bundle: [], workspace: [], session: {} }),
    grantWorkspaceRule: async (rule) => ({ granted: rule }),
    grantSessionRule: async (_sessionId, rule) => ({ granted: rule }),
    revokeWorkspaceGrant: async (rule) => ({ revoked: rule }),
    revokeSessionGrant: async (_sessionId, rule) => ({ revoked: rule }),
    restoreTurn: async () => "missing",
    previewRestore: async () => "missing",
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

  it("empties the trash from the sessions pane with shift+d behind a confirm", async () => {
    const fake = fakeClient();
    const leftover: SessionSummary = {
      id: "s9",
      title: "old spike",
      createdAt: storedDetail.createdAt,
      lastActivityAt: storedDetail.lastActivityAt,
      messageCount: 2,
    };
    let trash = [leftover];
    const purges: number[] = [];
    const client: KeyworkClient = {
      ...fake.client,
      listTrash: async () => trash,
      purgeTrash: async () => {
        purges.push(trash.length);
        trash = [];
        return { purged: purges.at(-1) ?? 0 };
      },
    };
    render(() => <App host={hostWithServer()} connect={() => client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    pressLeader("t");
    await waitFor(() => expect(frameNamed("sessions")?.dataset.focused).toBe(""));
    press("D", { shiftKey: true });
    const question = await screen.findByText(
      /^empty the trash\? 1 session goes for good, there is no undo/,
    );
    expect(purges).toEqual([]);
    fireEvent.keyDown(question, { key: "y" });
    await screen.findByText("deleted 1 session for good · the trash is empty");
    expect(purges).toEqual([1]);
    expect(screen.queryByText("old spike")).toBeNull();
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

  it("tags a conversation's title row with its arc while the sessions pane carries none", async () => {
    const fake = fakeClient({ arc: "pricing" });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    const conversation = frameNamed("run echo served");
    await waitFor(() =>
      expect(conversation?.querySelector(".kw-frame-arc")?.textContent).toBe("#pricing"),
    );
    expect(frameNamed("sessions")?.querySelector(".kw-frame-arc")).toBeNull();
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

  it("quiets the focused session with the leader, marks its title row, and approves for the session", async () => {
    const fake = fakeClient({ asked: { command: "mkdir -p build", rule: "mkdir -p *" } });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    const card = await screen.findByRole("group", { name: "permission ask" });
    expect(card.textContent).toContain("once ctrl+y");
    pressLeader("S", { shiftKey: true });
    await screen.findByText(
      "quiet · ctrl+y now grants an ask for the rest of this session · ctrl+k shift+s ends it",
    );
    expect(frameNamed("run echo served")?.querySelector(".kw-frame-quiet")?.textContent).toBe(
      quietMark,
    );
    expect(frameNamed("sessions")?.querySelector(".kw-frame-quiet")).toBeNull();
    expect(card.textContent).toContain("this session ctrl+y");
    expect(card.textContent).toContain("once alt+o");
    expect(frameNamed("run echo served")?.dataset.state).toBe("needs-you");
    fireEvent.keyDown(document, { key: "y", ctrlKey: true });
    await waitFor(() => expect(fake.answers).toEqual(["c9:granted:session"]));
  });

  it("still approves once from anywhere in a quiet session", async () => {
    const fake = fakeClient({ asked: { command: "mkdir -p build", rule: "mkdir -p *" } });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByRole("group", { name: "permission ask" });
    pressLeader("S", { shiftKey: true });
    await waitFor(() =>
      expect(frameNamed("run echo served")?.querySelector(".kw-frame-quiet")).toBeTruthy(),
    );
    fireEvent.keyDown(document, { key: "o", code: "KeyO", altKey: true });
    await waitFor(() => expect(fake.answers).toEqual(["c9:granted"]));
  });

  it("lets a delete in a quiet session stop and approve only once by default", async () => {
    const fake = fakeClient({ asked: { command: "rm -rf dist", rule: "rm -rf dist" } });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    const card = await screen.findByRole("group", { name: "permission ask" });
    pressLeader("S", { shiftKey: true });
    await waitFor(() =>
      expect(card.textContent).toContain(
        "quiet · a destructive command is never the quiet default",
      ),
    );
    expect(frameNamed("run echo served")?.dataset.state).toBe("needs-you");
    fireEvent.keyDown(document, { key: "y", ctrlKey: true });
    await waitFor(() => expect(fake.answers).toEqual(["c9:granted"]));
  });

  it("brings the session back with the same chord and offers the revoke for the grants it left", async () => {
    const fake = fakeClient();
    const held = { action: "bash", resource: "rm -rf dist", effect: "allow" as const };
    const revoked: string[] = [];
    const client: KeyworkClient = {
      ...fake.client,
      permissions: async () => ({
        trusted: true,
        bundle: [],
        workspace: [],
        session: revoked.length === 0 ? { s1: [held] } : {},
      }),
      revokeSessionGrant: async (sessionId, rule) => {
        revoked.push(`${sessionId}: ${rule.resource}`);
        return { revoked: rule };
      },
    };
    render(() => <App host={hostWithServer()} connect={() => client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    pressLeader("S", { shiftKey: true });
    await waitFor(() =>
      expect(frameNamed("run echo served")?.querySelector(".kw-frame-quiet")).toBeTruthy(),
    );
    pressLeader("S", { shiftKey: true });
    await screen.findByText("quiet off · 1 session grant still holds · ctrl+k shift+p revokes it");
    expect(frameNamed("run echo served")?.querySelector(".kw-frame-quiet")).toBeNull();
    expect(revoked).toEqual([]);

    pressLeader("P", { shiftKey: true });
    await screen.findByText("rm -rf dist", { selector: ".kw-perm-session .kw-ov-name" });
    press("x");
    const confirm = await screen.findByText(/^revoke rm -rf dist for run echo served/);
    fireEvent.keyDown(confirm, { key: "y" });
    await waitFor(() => expect(revoked).toEqual(["s1: rm -rf dist"]));
  });

  it("asks for a focused session before going quiet", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    press("1", { altKey: true });
    pressLeader("S", { shiftKey: true });
    await screen.findByText("no session is focused · quiet is kept per session");
    expect(document.querySelector(".kw-frame-quiet")).toBeNull();
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

describe("the needs-you flow", () => {
  it("lifts a waiting ask into the strip, and leader n hands its card the keys while leader shift+n goes back", async () => {
    const fake = fakeClient({ pendingAsk: true });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await waitFor(() =>
      expect(stripText()).toBe("█1 needs youask: rm -rf dist(run echo served)ctrl+k n"),
    );
    expect(document.title).toBe("(1) keywork");

    pressLeader("t");
    await waitFor(() => expect(frameNamed("sessions")?.dataset.focused).toBe(""));
    pressLeader("n");
    const card = await screen.findByRole("group", { name: "permission ask" });
    await waitFor(() => expect(frameNamed("run echo served")?.dataset.focused).toBe(""));
    await waitFor(() => expect(document.activeElement).toBe(card));

    pressLeader("N", { shiftKey: true });
    await waitFor(() => expect(frameNamed("sessions")?.dataset.focused).toBe(""));

    fake.emit([answered("c9")]);
    await waitFor(() => expect(document.querySelector(".kw-needs-you")).toBeNull());
    expect(document.title).toBe("keywork");
  });

  it("says so when nothing waits and there is no jump to return from", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    pressLeader("n");
    await screen.findByText("nothing needs you", { selector: ".kw-status-notice" });
    pressLeader("N", { shiftKey: true });
    await screen.findByText("no needs-you jump to go back from", {
      selector: ".kw-status-notice",
    });
  });

  it("summons the desk on leader q, collapses the strip to its count, and jumps from a row", async () => {
    const fake = fakeClient({ pendingAsk: true });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await waitFor(() => expect(stripText()).toContain("ask: rm -rf dist"));

    pressLeader("q");
    await waitFor(() => expect(frameNamed("desk · 1 needs you")?.dataset.focused).toBe(""));
    expect(stripText()).toBe("█1 needs you");
    expect(frameNamed("desk · 1 needs you")?.dataset.state).toBe("needs-you");
    expect(frameNamed("desk · 1 needs you")?.dataset.attire).toBeUndefined();

    press("Enter");
    await waitFor(() => expect(frameNamed("run echo served")?.dataset.focused).toBe(""));
    pressLeader("N", { shiftKey: true });
    await waitFor(() => expect(frameNamed("desk · 1 needs you")?.dataset.focused).toBe(""));
  });

  it("answers the waiting ask from the desk with the card's keys, and the desk clears", async () => {
    const fake = fakeClient({ pendingAsk: true });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await waitFor(() => expect(stripText()).toContain("ask: rm -rf dist"));

    pressLeader("q");
    const desk = await waitFor(() => {
      const frame = frameNamed("desk · 1 needs you");
      expect(frame?.dataset.focused).toBe("");
      return frame as HTMLElement;
    });
    await waitFor(() =>
      expect(
        [...desk.querySelectorAll(".kw-desk-answer")].map((answer) => answer.textContent),
      ).toEqual(["once y", "this session s", "this workspace w", "deny n"]),
    );
    press("s");
    await waitFor(() => expect(fake.answers).toEqual(["c9:granted:session"]));
    fake.emit([answered("c9")]);
    await waitFor(() => expect(frameNamed("desk")).toBeDefined());
    expect(document.querySelector(".kw-needs-you")).toBeNull();
  });

  it("brings a session back to the desk when it moves unseen, and reads it once visited", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    pressLeader("q");
    await waitFor(() => expect(frameNamed("desk")?.dataset.focused).toBe(""));
    expect(backOnTheDesk()).toEqual([]);

    const listed = await fake.client.sessions();
    const moved = { ...(listed[0] as SessionSummary), lastActivityAt: new Date().toISOString() };
    (listed as SessionSummary[])[0] = moved;
    fake.emit([turnCompleted("s1")]);
    await waitFor(() => expect(backOnTheDesk()).toEqual(["run echo served"]));

    press("Enter");
    await waitFor(() => expect(frameNamed("run echo served")?.dataset.focused).toBe(""));
    pressLeader("N", { shiftKey: true });
    await waitFor(() => expect(frameNamed("desk")?.dataset.focused).toBe(""));
    expect(backOnTheDesk()).toEqual([]);
  });

  it("hides the strip from the palette and remembers that across launches", async () => {
    const fake = fakeClient({ pendingAsk: true });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await waitFor(() => expect(stripText()).toContain("1 needs you"));
    runCommand("needs-you-strip");
    await waitFor(() => expect(document.querySelector(".kw-needs-you")).toBeNull());
    await screen.findByText("needs-you strip hidden · ctrl+k q still lists everything");
    expect(localStorage.getItem("keywork.needs-you-strip")).toBe("hidden");

    cleanup();
    render(() => (
      <App host={hostWithServer()} connect={() => fakeClient({ pendingAsk: true }).client} />
    ));
    await openTyped("C:/work");
    await screen.findByRole("group", { name: "permission ask" });
    expect(document.querySelector(".kw-needs-you")).toBeNull();
    runCommand("needs-you-strip");
    await waitFor(() => expect(stripText()).toContain("1 needs you"));
  });
});

describe("the context map", () => {
  it("maps the focused session on leader shift+g, docked beside it, and closes on escape", async () => {
    const fake = fakeClient();
    const client = { ...fake.client, context: async () => recordedContext };
    render(() => <App host={hostWithServer()} connect={() => client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    pressLeader("G", { shiftKey: true });
    await waitFor(() => expect(frameNamed("context")?.dataset.focused).toBe(""));
    const map = frameNamed("context") as HTMLElement;
    await waitFor(() =>
      expect(map.querySelector(".kw-context-map-total")?.textContent).toBe("1.9k of 200k · 1%"),
    );
    expect(map.querySelector(".kw-ov-head-lead")?.textContent).toBe("run echo served");
    expect(slotLeft(map)).toBeGreaterThan(slotLeft(frameNamed("run echo served")));
    press("Escape");
    await waitFor(() => expect(frameNamed("context")).toBeUndefined());
    expect(frameNamed("run echo served")?.dataset.focused).toBe("");
  });

  it("opens from the conversation's gauge and the palette, and compacts with c", async () => {
    const fake = fakeClient();
    const compacted: string[] = [];
    const client = {
      ...fake.client,
      context: async () => recordedContext,
      compact: async (id: string) => {
        compacted.push(id);
        return { compacted: null, notices: [] };
      },
    };
    render(() => <App host={hostWithServer()} connect={() => client} />);
    await openTyped("C:/work");
    await screen.findByText("It printed served.");
    const gauge = await waitFor(() => {
      const button = frameNamed("run echo served")?.querySelector(".kw-frame-gauge");
      expect(button).toBeTruthy();
      return button as HTMLButtonElement;
    });
    fireEvent.click(gauge);
    await waitFor(() => expect(frameNamed("context")?.dataset.focused).toBe(""));
    expect(frameNamed("context")?.querySelector(".kw-frame-gauge")).toBeNull();
    press("c");
    await screen.findByText("nothing to fold yet");
    expect(compacted).toEqual(["s1"]);
    press("Escape");
    await waitFor(() => expect(frameNamed("context")).toBeUndefined());
    runCommand("context");
    await waitFor(() => expect(frameNamed("context")?.dataset.focused).toBe(""));
  });
});

function slotLeft(frame: HTMLElement | undefined): number {
  return Number.parseFloat((frame?.closest(".kw-slot") as HTMLElement | null)?.style.left ?? "");
}

function stripText(): string | undefined {
  return document.querySelector(".kw-needs-you")?.textContent ?? undefined;
}

function runCommand(name: string): void {
  press("p", { ctrlKey: true, shiftKey: true });
  const palette = screen.getByLabelText("palette") as HTMLInputElement;
  palette.value = `/${name}`;
  fireEvent.input(palette);
  fireEvent.keyDown(palette, { key: "Enter" });
}

function answered(callId: string): BusEnvelope {
  return {
    id: 900,
    ts: new Date().toISOString(),
    sessionId: "s1",
    type: "gate.permission",
    payload: { decision: { tool: "bash", callId, verdict: "granted", gate: "user" } },
  };
}

function turnCompleted(sessionId: string): BusEnvelope {
  return {
    id: 901,
    ts: new Date().toISOString(),
    sessionId,
    type: "turn.completed",
    payload: {
      message: { role: "assistant", parts: [{ type: "text", text: "done" }] },
      usage: { inputTokens: 10, outputTokens: 2 },
    },
  };
}

function backOnTheDesk(): string[] {
  return [...document.querySelectorAll(".kw-desk-group[data-group='back'] .kw-desk-name")].map(
    (name) => name.textContent ?? "",
  );
}
