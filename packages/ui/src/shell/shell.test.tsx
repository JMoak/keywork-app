import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, SessionDetail, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";

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

const storedDetail = JSON.parse(fixture("session-detail.json")) as SessionDetail;

function fakeClient(options: { pendingAsk?: boolean } = {}): {
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
    prompt: async (_id, text) => {
      prompts.push(text);
      return "accepted";
    },
    abort: async (id) => {
      aborts.push(id);
      return "aborted";
    },
    asks: async () =>
      options.pendingAsk
        ? [
            {
              sessionId: "s1",
              callId: "c9",
              tool: "bash",
              arguments: { command: "rm -rf dist" },
              askedAt: new Date().toISOString(),
            },
          ]
        : [],
    answerAsk: async (callId, verdict) => {
      answers.push(`${callId}:${verdict}`);
      return "settled" as const;
    },
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

function hostWithServer() {
  return browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } });
}

describe("the app shell", () => {
  it("opens a workspace, lists sessions, replays stored history, and streams live turns", async () => {
    const fake = fakeClient();
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    await screen.findByText("run echo served", { selector: ".kw-session-name" });
    await screen.findByText("It printed served.");
    expect(screen.getByText("bash echo served", { selector: ".kw-tool-span" })).toBeTruthy();

    const later = toolStream.map((envelope) => ({
      ...envelope,
      id: envelope.id + 100,
      ts: new Date().toISOString(),
    }));
    fake.emit(later);
    await waitFor(() => expect(screen.getAllByText("It printed served.")).toHaveLength(2));
    expect(
      screen.getByText("17 tokens · unpriced", { selector: ".kw-frame-telemetry" }),
    ).toBeTruthy();
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
    await waitFor(() => expect(fake.prompts).toEqual(["hello there"]));
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(fake.aborts).toEqual(["s1"]));
  });

  it("restores a pending ask from the server and answers it with the approve chord", async () => {
    const fake = fakeClient({ pendingAsk: true });
    render(() => <App host={hostWithServer()} connect={() => fake.client} />);
    await openTyped("C:/work");
    const card = await screen.findByRole("group", { name: "permission ask" });
    expect(card.textContent).toContain("rm -rf dist");
    fireEvent.keyDown(document, { key: "y", ctrlKey: true });
    await waitFor(() => expect(fake.answers).toEqual(["c9:granted"]));
  });

  it("shows the host's failure text when a workspace cannot open", async () => {
    render(() => <App host={browserHost()} connect={() => fakeClient().client} />);
    await openTyped("C:/work");
    await screen.findByText(/no server/);
  });
});
