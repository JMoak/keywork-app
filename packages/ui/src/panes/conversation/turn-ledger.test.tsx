import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import type {
  BusEnvelope,
  ChangesReading,
  Message,
  SessionDetail,
  SessionEntries,
  SessionSummary,
  TurnRestored,
  TurnRestoreReading,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import recordedChanges from "../../../../client/src/fixtures/changes.json";
import recordedRestore from "../../../../client/src/fixtures/restored.json";
import restoredStream from "../../../../client/src/fixtures/restored.jsonl?raw";
import { parseJsonl } from "../../dev/replay.ts";
import { browserHost } from "../../host/browser.ts";
import { appActions } from "../../keys/actions.ts";
import { createSessionStore } from "../../shell/session-store.ts";
import type { ShellSeams } from "../registry.ts";
import { conversationPane } from "./index.tsx";
import {
  forkedNotice,
  noSettledTurnNotice,
  restoredNotice,
  restoreQuestion,
  unplacedNotice,
} from "./turn-ledger.ts";

afterEach(cleanup);

const stream = parseJsonl(restoredStream);
const twoTurns = stream.filter((envelope) => envelope.id <= 17);
const afterRestore = stream.filter((envelope) => envelope.id >= 18 && envelope.id <= 22);
const afterRedo = stream.filter((envelope) => envelope.id === 23);
const recordedLog = recordedRestore.entries.body as SessionEntries;
const restored = recordedRestore.restored.body as TurnRestored;

type Phase = "before" | "restored" | "redone";

const logs: Readonly<Record<Phase, SessionEntries>> = {
  before: {
    ...recordedLog,
    leafId: "q2",
    activePath: recordedLog.activePath.filter((id) => id !== "q4"),
  },
  restored: { ...recordedLog, leafId: "q3", activePath: ["q6", "q3"] },
  redone: recordedLog,
};

interface ServerOptions {
  restore?: TurnRestoreReading;
  log?: SessionEntries | undefined;
}

interface Server {
  readonly client: KeyworkClient;
  readonly feed: ServerFeed;
  readonly sent: string[];
  emit(envelopes: readonly BusEnvelope[]): void;
}

function scriptedServer(options: ServerOptions = {}): Server {
  let phase: Phase = "before";
  const sent: string[] = [];
  const listeners: Array<(envelopes: readonly BusEnvelope[]) => void> = [];
  const client = {
    sessions: async () => [summary],
    session: async () => detailIn(phase),
    asks: async () => [],
    entries: async () => ("log" in options ? options.log : logs[phase]),
    changes: async (): Promise<ChangesReading> => recordedChanges,
    context: async () => "missing",
    cost: async () => "missing",
    restoreTurn: async (id: string, turn: number) => {
      sent.push(`restore ${id} ${turn}`);
      const answer = options.restore ?? restored;
      if (typeof answer !== "string" && !("refused" in answer)) phase = "restored";
      return answer;
    },
    redo: async (id: string) => {
      sent.push(`redo ${id}`);
      phase = "redone";
      return { restored: true, undoable: true, redoable: false };
    },
    fork: async (id: string, entryId: string) => {
      sent.push(`fork ${id} at ${entryId}`);
      return { sessionId: "s9" };
    },
  } as unknown as KeyworkClient;
  const feed = {
    subscribe: (listener: (envelopes: readonly BusEnvelope[]) => void) => {
      listeners.push(listener);
      return () => undefined;
    },
    onNotice: () => () => undefined,
    whenLost: () => () => undefined,
  } as unknown as ServerFeed;
  return {
    client,
    feed,
    sent,
    emit: (envelopes) => {
      for (const listener of listeners) listener(envelopes);
    },
  };
}

const summary: SessionSummary = {
  id: "s1",
  title: "notes",
  createdAt: "2026-09-07T12:00:00.000Z",
  lastActivityAt: "2026-09-07T12:00:00.000Z",
  messageCount: 0,
};

function detailIn(phase: Phase): SessionDetail {
  return { ...summary, cwd: "<cwd>", live: true, asOf: 0, messages: messagesIn(phase) };
}

function messagesIn(phase: Phase): Message[] {
  if (phase !== "redone") return [];
  const onPath = new Set(recordedLog.activePath);
  return recordedLog.entries.flatMap((entry) =>
    entry.type === "message" && onPath.has(entry.id) ? [entry.message] : [],
  );
}

async function mounted(options: ServerOptions = {}) {
  const server = scriptedServer(options);
  const store = createRoot(() => createSessionStore(server.client, server.feed));
  const opened: string[] = [];
  const shell = {
    store,
    client: server.client,
    keys: { chord: (action: string) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: {
      openSession: (id: string) => opened.push(id),
      newSession: async () => {},
      startSession: async () => {},
    },
    rebind: () => {},
    host: browserHost(),
    trust: { untrusted: () => false },
    unseen: () => false,
  } as unknown as ShellSeams;
  let handle: (action: string) => void = () => {};
  render(() => (
    <conversationPane.component
      id="conversation-1"
      spec={{ kind: "conversation", sessionId: "s1" }}
      focused
      shell={shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  await store.open("s1");
  server.emit(twoTurns);
  await waitFor(() => {
    expect(document.querySelectorAll(".kw-user")).toHaveLength(2);
    expect(ledgerLines()).not.toHaveLength(0);
  });
  return {
    server,
    shell,
    opened,
    act: (action: string) => handle(action),
  };
}

function ledgerLines(): string[] {
  return [...document.querySelectorAll(".kw-ledger-facts")].map((line) => line.textContent ?? "");
}

function ledgerOf(turn: number): HTMLElement {
  return document.querySelector(`.kw-ledger[data-turn='${turn}']`) as HTMLElement;
}

function said(): string[] {
  return [...document.querySelectorAll(".kw-controls-line")].map((line) => line.textContent ?? "");
}

function confirmLine(): HTMLElement | null {
  return document.querySelector(".kw-controls-confirm");
}

describe("the turn ledger in a live conversation", () => {
  it("ends each settled turn with its files, its time in tools and the turn the server counts", async () => {
    const { shell } = await mounted();
    await waitFor(() =>
      expect(ledgerLines()).toEqual(["turn 1 · 1 file · +2 −0 · 500ms in tools", "turn 2"]),
    );
    const adornments = conversationPane.adornments?.(
      { kind: "conversation", sessionId: "s1" },
      shell,
    );
    expect(adornments?.ribbon).toBe("turn 2");
  });

  it("asks before restoring, naming the turns and files that go back, then restores on y", async () => {
    const { server } = await mounted();
    await waitFor(() => expect(ledgerOf(1)).toBeTruthy());
    fireEvent.keyDown(ledgerOf(1), { key: "u" });
    await waitFor(() => expect(confirmLine()).toBeTruthy());
    expect(confirmLine()?.textContent).toBe(
      'restore to before turn 1, "write two lines to notes.txt"? 2 turns and 1 file go back · redo brings them back · y/n',
    );
    expect(server.sent).toEqual([]);
    fireEvent.keyDown(confirmLine() as HTMLElement, { key: "y" });
    await waitFor(() => expect(said()).toEqual([restoredNotice(restored)]));
    expect(said()).toEqual([
      "restored to before turn 1 · 2 turns went back · 1 file put back · the prompt is back in the composer",
    ]);
    expect(server.sent).toEqual(["restore s1 1"]);
    const composer = document.querySelector(".kw-composer-input") as HTMLTextAreaElement;
    expect(composer.value).toBe("write two lines to notes.txt");

    server.emit(afterRestore);
    await waitFor(() =>
      expect(document.querySelector("[data-mark='restore']")?.textContent).toBe(
        "restored to before turn 1 · redo brings the turns back",
      ),
    );
    expect(ledgerLines()).toEqual([]);
  });

  it("shows the restore taken back once redo brings the turns home", async () => {
    const { server, act } = await mounted();
    fireEvent.keyDown(ledgerOf(1), { key: "u" });
    await waitFor(() => expect(confirmLine()).toBeTruthy());
    fireEvent.keyDown(confirmLine() as HTMLElement, { key: "y" });
    await waitFor(() => expect(server.sent).toEqual(["restore s1 1"]));
    server.emit(afterRestore);
    await waitFor(() => expect(document.querySelector("[data-mark='restore']")).toBeTruthy());

    act("conversation.redo");
    await waitFor(() => expect(server.sent).toEqual(["restore s1 1", "redo s1"]));
    server.emit(afterRedo);
    await waitFor(() =>
      expect(document.querySelector("[data-mark='restore-undone']")?.textContent).toBe(
        "the restore to before turn 1 was taken back",
      ),
    );
    expect(ledgerLines()).toEqual(["turn 1 · 1 file · +2 −0", "turn 2"]);
  });

  it("leaves everything as it was when the restore is declined", async () => {
    const { server } = await mounted();
    fireEvent.keyDown(ledgerOf(2), { key: "u" });
    await waitFor(() => expect(confirmLine()).toBeTruthy());
    expect(confirmLine()?.textContent).toBe(
      'restore to before turn 2, "now say done"? 1 turn goes back · redo brings them back · y/n',
    );
    fireEvent.keyDown(confirmLine() as HTMLElement, { key: "n" });
    await waitFor(() => expect(said()).toEqual(["left unchanged"]));
    expect(server.sent).toEqual([]);
  });

  it("says a refusal in the words undo uses", async () => {
    const { server } = await mounted({ restore: { refused: "busy", detail: "a turn is running" } });
    fireEvent.keyDown(ledgerOf(1), { key: "u" });
    await waitFor(() => expect(confirmLine()).toBeTruthy());
    fireEvent.keyDown(confirmLine() as HTMLElement, { key: "y" });
    await waitFor(() => expect(said()).toEqual(["a turn is running"]));
    expect(server.sent).toEqual(["restore s1 1"]);
    const composer = document.querySelector(".kw-composer-input") as HTMLTextAreaElement;
    expect(composer.value).toBe("");
  });

  it("forks at the turn's last message and opens the fork", async () => {
    const { server, opened } = await mounted();
    fireEvent.keyDown(ledgerOf(1), { key: "f" });
    await waitFor(() => expect(opened).toEqual(["s9"]));
    expect(server.sent).toEqual(["fork s1 at q1"]);
    expect(said()).toEqual([forkedNotice(1)]);
  });

  it("runs the palette verbs on the line that last held focus, else on the latest turn", async () => {
    const { server, act } = await mounted();
    act("conversation.restore-turn");
    await waitFor(() => expect(confirmLine()?.textContent).toMatch(/^restore to before turn 2,/));
    fireEvent.keyDown(confirmLine() as HTMLElement, { key: "n" });
    fireEvent.focus(ledgerOf(1));
    act("conversation.fork-turn");
    await waitFor(() => expect(server.sent).toEqual(["fork s1 at q1"]));
    act("conversation.fork-turn");
    await waitFor(() => expect(server.sent).toEqual(["fork s1 at q1", "fork s1 at q2"]));
  });
});

describe("the turn ledger without the server's path", () => {
  it("shows the facts it has, offers no verbs, and says why the palette cannot place a turn", async () => {
    const { act } = await mounted({ log: undefined });
    expect(ledgerLines()).toEqual(["500ms in tools"]);
    expect(document.querySelector(".kw-ledger-hint")).toBeNull();
    act("conversation.restore-turn");
    await waitFor(() => expect(said()).toEqual([unplacedNotice]));
  });

  it("says when no turn has settled yet", () => {
    const server = scriptedServer();
    const store = createRoot(() => createSessionStore(server.client, server.feed));
    let handle: (action: string) => void = () => {};
    const shell = {
      store,
      keys: { chord: (action: string) => action, leader: () => "" },
      sessions: { openSession: () => {} },
      trust: { untrusted: () => false },
    } as unknown as ShellSeams;
    render(() => (
      <conversationPane.component
        id="conversation-1"
        spec={{ kind: "conversation", sessionId: "s1" }}
        focused
        shell={shell}
        onAction={(handler) => {
          handle = handler;
        }}
      />
    ));
    handle("conversation.fork-turn");
    expect(said()).toEqual([noSettledTurnNotice]);
  });
});

describe("the turn ledger's keys", () => {
  it("claims no chord: two palette names, and no binding a conversation hears takes u or f", () => {
    expect(conversationPane.localActions?.["conversation.restore-turn"]).toMatchObject({
      chords: "none",
      command: { name: "restore-turn" },
    });
    expect(conversationPane.localActions?.["conversation.fork-turn"]).toMatchObject({
      chords: "none",
      command: { name: "fork-turn" },
    });
    const heard = Object.values(appActions)
      .filter((action) => action.scope === undefined || action.scope === "conversation")
      .flatMap((action) => (typeof action.chords === "string" ? [action.chords] : action.chords));
    expect(heard).not.toContain("u");
    expect(heard).not.toContain("f");
  });
});

describe("the restore question", () => {
  const turn = {
    turn: 3,
    promptId: "p3",
    leafId: "r3",
    text: "rename every verb in the tiler to keywork's action ids, then run the checks",
    costUsd: undefined,
    marks: [],
  };

  it("names the turn by its prompt, cut to fit, and counts what goes back", () => {
    expect(restoreQuestion(turn, { turns: 1, files: undefined })).toBe(
      `restore to before turn 3, "rename every verb in the tiler to keywo…"? 1 turn goes back · redo brings them back · y/n`,
    );
    expect(restoreQuestion(turn, { turns: 3, files: 0 })).toMatch(/\? 3 turns go back · /);
    expect(restoreQuestion(turn, { turns: 3, files: 1 })).toMatch(
      /\? 3 turns and 1 file go back · /,
    );
  });

  it("falls back on the server's files note when no file moved", () => {
    expect(
      restoredNotice({ ...restored, undoneTurns: 1, files: [], filesNote: "files untouched" }),
    ).toBe(
      "restored to before turn 1 · 1 turn went back · files untouched · the prompt is back in the composer",
    );
  });
});
