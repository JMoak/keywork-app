import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConsoleClient } from "@keywork-app/client";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../app.tsx";
import { browserHost } from "../host/browser.ts";
import { fakeClient } from "./client-testing.ts";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const notes = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join("\n");

const savedWithAFile = JSON.stringify({
  layout: {
    version: 1,
    tree: {
      kind: "split",
      orientation: "row",
      ratio: 0.5,
      first: { kind: "leaf", id: "conversation-1" },
      second: { kind: "leaf", id: "file-1" },
    },
    focused: "conversation-1",
  },
  specs: {
    "conversation-1": { kind: "conversation" },
    "file-1": { kind: "file", path: "notes.md" },
  },
});

interface Stage {
  reads(): number;
}

async function openTheStage(): Promise<Stage> {
  let reads = 0;
  const client = (): ConsoleClient =>
    fakeClient({
      sessions: async () => [],
      file: async (path) => {
        reads += 1;
        return {
          path,
          bytes: notes.length,
          from: 0,
          to: notes.length,
          text: notes,
          truncated: false,
          encoding: "utf-8",
        };
      },
    });
  localStorage.setItem("keywork.layout:C:/work", savedWithAFile);
  render(() => (
    <App
      host={browserHost({ server: { url: "http://127.0.0.1:4770", token: "t" } })}
      connect={client}
    />
  ));
  const input = await screen.findByLabelText("workspace");
  fireEvent.input(input, { target: { value: "C:/work" } });
  fireEvent.submit(input.closest("form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".cm-editor")).not.toBeNull());
  return { reads: () => reads };
}

function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  fireEvent.keyDown(document.body, { key, bubbles: true, ...modifiers });
}

function leader(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
  press("k", { ctrlKey: true });
  press(key, modifiers);
}

interface PaneParts {
  readonly slot: Element | null;
  readonly frame: Element | null;
  readonly body: Element | null;
  readonly content: readonly Element[];
}

function partsOf(pane: string): PaneParts {
  const slot = document.querySelector(`.kw-slot[data-pane-id="${pane}"]`);
  const body = slot?.querySelector(".kw-frame-body") ?? null;
  return {
    slot,
    frame: slot?.querySelector(":scope > .kw-frame") ?? null,
    body,
    content: [...(body?.children ?? [])],
  };
}

function watchPaneBodies(): () => string[] {
  const removed: string[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node instanceof Element) removed.push(node.className);
      }
    }
  });
  for (const body of document.querySelectorAll(".kw-frame-body")) {
    observer.observe(body, { childList: true, subtree: true });
  }
  return () => {
    observer.takeRecords();
    observer.disconnect();
    return removed;
  };
}

const focusedPane = (): string | null | undefined =>
  document
    .querySelector(".kw-frame[data-focused]")
    ?.closest(".kw-slot")
    ?.getAttribute("data-pane-id");

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

describe("a pane while the layout around it changes", () => {
  it("keeps its own elements through focus moves: nothing in it is removed or rebuilt", async () => {
    await openTheStage();
    const conversation = partsOf("conversation-1");
    const file = partsOf("file-1");
    const editor = document.querySelector(".cm-editor");
    const removedFromBodies = watchPaneBodies();

    leader("l");
    expect(focusedPane()).toBe("file-1");
    leader("h");
    expect(focusedPane()).toBe("conversation-1");
    press("2", { altKey: true });
    press("1", { altKey: true });
    await settled();

    expect(partsOf("conversation-1")).toEqual(conversation);
    expect(partsOf("file-1")).toEqual(file);
    expect(document.querySelector(".cm-editor")).toBe(editor);
    expect(removedFromBodies()).toEqual([]);
  });

  it("keeps its own elements when a split seats a new pane beside it, and reads nothing again", async () => {
    const stage = await openTheStage();
    const conversation = partsOf("conversation-1");
    const file = partsOf("file-1");
    const editor = document.querySelector(".cm-editor");
    const reads = stage.reads();
    const removedFromBodies = watchPaneBodies();

    leader("T", { shiftKey: true });
    await waitFor(() =>
      expect(document.querySelectorAll(".kw-slot[data-pane-id]")).toHaveLength(3),
    );
    await settled();

    expect(partsOf("conversation-1")).toEqual(conversation);
    expect(partsOf("file-1")).toEqual(file);
    expect(document.querySelector(".cm-editor")).toBe(editor);
    expect(removedFromBodies()).toEqual([]);
    expect(stage.reads()).toBe(reads);
  });

  it("never wears the frame, the arrival state or the motion of a pane outside the window", async () => {
    await openTheStage();
    leader("l");
    leader("T", { shiftKey: true });
    await waitFor(() =>
      expect(document.querySelectorAll(".kw-slot[data-pane-id]")).toHaveLength(3),
    );
    expect(document.querySelectorAll(".kw-surface, .kw-outside, [data-arrival]")).toHaveLength(0);
  });
});

describe("the styles a pane wears outside the window", () => {
  const sheets = ["surfaces/feel/surface-chrome.css", "surfaces/runtime/outside.css"];

  it("reach nothing inside the window: every rule is scoped to the frame a pane wears outside", () => {
    for (const sheet of sheets) {
      const css = readFileSync(join(process.cwd(), "packages/ui/src", sheet), "utf8");
      const selectors = selectorsIn(css);
      expect(selectors.length).toBeGreaterThan(0);
      const reachingInside = selectors.filter(
        (selector) => !/^\.kw-(surface|outside)\b/.test(selector),
      );
      expect(reachingInside).toEqual([]);
    }
  });
});

function selectorsIn(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...withoutComments.matchAll(/(^|[{}])\s*([^{}@]+?)\s*\{/g)]
    .flatMap((match) => (match[2] ?? "").split(","))
    .map((selector) => selector.trim())
    .filter((selector) => selector !== "");
}
