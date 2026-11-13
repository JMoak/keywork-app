import type { ConsoleClient } from "@keywork-app/client";
import type { BusEnvelope, SessionDetail, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { fakeClient } from "./client-testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("a pane bound to a session", () => {
  it("shows the turns and the ask of a session started in a pane split beside", async () => {
    const served = servedSessions(["a first session"]);
    await openWorkspace(served.client);
    press("k", { ctrlKey: true });
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    type("write notes/a.md hi");
    await waitFor(() => expect(focusedFrame()?.querySelector(".kw-ask")).not.toBeNull());
    expect(focusedFrame()?.querySelector(".kw-user")?.textContent).toBe("write notes/a.md hi");
    expect(focusedName()).toBe("write notes/a.md hi");
  });

  it("shows every session of a restored split layout", async () => {
    localStorage.setItem("keywork.layout:C:/work", splitLayout);
    const served = servedSessions(["the left one", "the right one"]);
    await openWorkspace(served.client);
    await waitFor(() => expect(transcripts()).toEqual([["the left one"], ["the right one"]]));
  });

  it("focuses the pane already showing a session instead of opening it twice", async () => {
    const served = servedSessions(["a first session"]);
    await openWorkspace(served.client);
    press("1", { altKey: true });
    expect(focusedName()).toBe("sessions");
    fireEvent.click(await screen.findByText("a first session", { selector: ".kw-tree-name" }));
    await waitFor(() => expect(focusedName()).toBe("a first session"));
    expect(frames()).toHaveLength(2);
  });
});

const splitLayout = JSON.stringify({
  layout: {
    version: 1,
    tree: {
      kind: "split",
      orientation: "row",
      ratio: 0.5,
      first: { kind: "leaf", id: "conversation-1" },
      second: { kind: "leaf", id: "conversation-2" },
    },
    focused: "conversation-1",
  },
  specs: {
    "conversation-1": { kind: "conversation", sessionId: "s1" },
    "conversation-2": { kind: "conversation", sessionId: "s2" },
  },
});

interface Served {
  readonly client: ConsoleClient;
}

function servedSessions(prompts: readonly string[]): Served {
  const at = "2026-11-12T12:00:00.000Z";
  let lastId = 0;
  const details = new Map<string, SessionDetail>();
  prompts.forEach((text, index) => {
    const id = `s${index + 1}`;
    details.set(id, {
      ...summaryOf(id, text, at),
      cwd: "C:/work",
      live: true,
      asOf: 0,
      messages: [{ role: "user", parts: [{ type: "text", text }] }],
    });
  });
  const listeners: Array<(envelope: BusEnvelope) => void> = [];
  const waiting: BusEnvelope[] = [];
  const emit = (
    sessionId: string,
    events: readonly Omit<BusEnvelope, "id" | "ts" | "sessionId">[],
  ) => {
    for (const event of events) {
      lastId += 1;
      const envelope = { ...event, id: lastId, ts: at, sessionId } as BusEnvelope;
      const listener = listeners.shift();
      if (listener === undefined) waiting.push(envelope);
      else listener(envelope);
    }
  };
  const client = fakeClient({
    sessions: async () => [...details.values()].map(({ messages: _, ...summary }) => summary),
    session: async (id) => {
      const detail = details.get(id);
      return detail === undefined ? undefined : { ...detail, asOf: lastId };
    },
    createSession: async () => {
      const id = `s${details.size + 1}`;
      details.set(id, {
        ...summaryOf(id, "(untitled session)", at),
        cwd: "C:/work",
        live: true,
        asOf: lastId,
        messages: [],
      });
      return summaryOf(id, "(untitled session)", at);
    },
    prompt: async (id, text) => {
      emit(id, [
        { type: "turn.started", payload: { userText: text } },
        {
          type: "turn.delta",
          payload: {
            delta: {
              type: "tool-call",
              call: {
                type: "tool-call",
                callId: "w1",
                name: "write",
                arguments: { path: "notes/a.md" },
              },
            },
          },
        },
        {
          type: "gate.ask",
          payload: {
            ask: {
              tool: "write",
              callId: "w1",
              arguments: { path: "notes/a.md", content: "hi" },
              rule: "default",
              rules: [],
            },
          },
        },
      ]);
      return "started";
    },
    events: async function* (options) {
      options?.onOpen?.();
      for (;;) {
        const ready = waiting.shift();
        if (ready !== undefined) {
          yield ready;
          continue;
        }
        yield await new Promise<BusEnvelope>((resolve) => listeners.push(resolve));
      }
    },
  });
  return { client };
}

function summaryOf(id: string, title: string, at: string): SessionSummary {
  return { id, title, createdAt: at, lastActivityAt: at, messageCount: 1 };
}

async function openWorkspace(client: ConsoleClient): Promise<void> {
  render(() => (
    <App
      host={browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } })}
      connect={() => client}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await waitFor(() => expect(frames().length).toBeGreaterThan(1));
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.body, { key, bubbles: true, ...modifiers });
}

function type(text: string): void {
  const input = focusedFrame()?.querySelector(".kw-composer-input") as HTMLTextAreaElement;
  input.value = text;
  fireEvent.input(input);
  fireEvent.keyDown(input, { key: "Enter" });
}

const frames = () => [...document.querySelectorAll(".kw-frame")] as HTMLElement[];
const focusedFrame = () => document.querySelector(".kw-frame[data-focused]") ?? undefined;
const focusedName = () => focusedFrame()?.querySelector(".kw-frame-name")?.textContent ?? undefined;
const transcripts = () =>
  frames()
    .map((frame) => [...frame.querySelectorAll(".kw-user")].map((user) => user.textContent))
    .filter((users) => users.length > 0);
