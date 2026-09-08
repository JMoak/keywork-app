import type { KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope, SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
  prompts.length = 0;
});

function type(text: string): void {
  const input = document.querySelector(
    ".kw-frame[data-focused] .kw-composer-input",
  ) as HTMLTextAreaElement;
  input.value = text;
  fireEvent.input(input);
  fireEvent.keyDown(input, { key: "Enter" });
}

const prompts: Array<[string, string]> = [];

function quietClient(): KeyworkClient {
  const summaries: SessionSummary[] = [];
  return {
    url: "http://127.0.0.1:4770",
    document: async () => ({ version: "0.0.1", operationIds: [] }),
    sessions: async () => summaries,
    session: async () => undefined,
    createSession: async () => {
      const created: SessionSummary = {
        id: `s${summaries.length + 1}`,
        title: `session ${summaries.length + 1}`,
        createdAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        messageCount: 0,
      };
      summaries.unshift(created);
      return created;
    },
    prompt: async (id, text) => {
      prompts.push([id, text]);
      return "accepted";
    },
    abort: async () => "idle",
    events: async function* (): AsyncIterable<BusEnvelope> {
      await new Promise(() => undefined);
    },
    asks: async () => [],
    answerAsk: async () => "settled" as const,
  };
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.body, { key, bubbles: true, ...modifiers });
}

async function openWorkspace(): Promise<void> {
  render(() => (
    <App
      host={browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } })}
      connect={quietClient}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await screen.findByText("sessions", { selector: ".kw-frame-name" });
}

const frames = () => [...document.querySelectorAll(".kw-frame")] as HTMLElement[];
const focusedName = () =>
  document.querySelector(".kw-frame[data-focused] .kw-frame-name")?.textContent ?? undefined;

describe("keyboard workflows", () => {
  it("splits a new session pane with the leader, jumps by ordinal, zooms, and closes with focus handoff", async () => {
    await openWorkspace();
    expect(frames()).toHaveLength(2);
    expect(focusedName()).toBe("new session");

    press("k", { ctrlKey: true });
    expect(screen.getByText("ctrl+k …")).toBeTruthy();
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    expect(focusedName()).toBe("session 1");

    press("1", { altKey: true });
    expect(focusedName()).toBe("sessions");
    press("3", { altKey: true });
    expect(focusedName()).toBe("session 1");

    press("z", { altKey: true });
    expect(frames()).toHaveLength(1);
    press("z", { altKey: true });
    expect(frames()).toHaveLength(3);

    press("k", { ctrlKey: true });
    press("x");
    await waitFor(() => expect(frames()).toHaveLength(2));
    expect(focusedName()).toBe("new session");
  });

  it("lets a text burst on an armed leader fall through without firing verbs", async () => {
    await openWorkspace();
    press("k", { ctrlKey: true });
    for (const character of "quick brown") press(character);
    expect(frames()).toHaveLength(2);
    expect(screen.queryByText("ctrl+k …")).toBeNull();
  });

  it("opens the palette with ctrl+p and the keys overlay with f1, and both close on escape", async () => {
    await openWorkspace();
    press("p", { ctrlKey: true });
    const palette = await screen.findByLabelText("palette");
    expect(screen.getByRole("dialog", { name: "go to" })).toBeTruthy();
    fireEvent.keyDown(palette, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("palette")).toBeNull());

    press("F1");
    const help = await screen.findByRole("dialog", { name: "keys" });
    expect(screen.getByText("ctrl+k s")).toBeTruthy();
    fireEvent.keyDown(help, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "keys" })).toBeNull());
  });

  it("starts a session from a prompt in an unbound pane, and routes the next prompt to the split pane only", async () => {
    await openWorkspace();
    type("please run echo served for me");
    await waitFor(() => expect(prompts).toEqual([["s1", "please run echo served for me"]]));
    expect(focusedName()).toBe("session 1");
    press("k", { ctrlKey: true });
    press("s");
    await waitFor(() => expect(frames()).toHaveLength(3));
    type("give me the long answer");
    await waitFor(() => expect(prompts).toHaveLength(2));
    expect(prompts[1]).toEqual(["s2", "give me the long answer"]);
  });

  it("runs a palette command by name", async () => {
    await openWorkspace();
    press("p", { ctrlKey: true, shiftKey: true });
    const palette = (await screen.findByLabelText("palette")) as HTMLInputElement;
    expect(palette.value).toBe("/");
    palette.value = "/split";
    fireEvent.input(palette);
    fireEvent.keyDown(palette, { key: "Enter" });
    await waitFor(() => expect(frames()).toHaveLength(3));
  });
});
