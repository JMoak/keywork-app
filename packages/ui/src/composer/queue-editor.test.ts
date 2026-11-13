import type { QueuedPrompt } from "@keywork-app/protocol";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  createQueueEditor,
  type QueueDraft,
  type QueueKeyEvent,
  queueHint,
} from "./queue-editor.ts";

describe("the queue editor", () => {
  it("takes the picked prompt out of the queue and into the draft on e", () => {
    const { keys, queue, press, edited } = editor();
    press("ArrowUp", { altKey: true });
    expect(keys.selected()).toBe("q3");
    press("ArrowUp");
    expect(press("e")).toBe(true);
    expect(edited).toEqual(["second thought"]);
    expect(queue().map((prompt) => prompt.id)).toEqual(["q1", "q3"]);
    expect(keys.editing()).toBe(false);
  });

  it("never drops a prompt on backspace; delete drops it", () => {
    const { keys, queue, press } = editor();
    press("ArrowUp", { altKey: true });
    expect(press("Backspace")).toBe(false);
    expect(queue()).toHaveLength(3);
    expect(keys.editing()).toBe(false);
    press("ArrowUp", { altKey: true });
    press("Delete");
    expect(queue().map((prompt) => prompt.id)).toEqual(["q1", "q2"]);
  });

  it("names the edit key in its hint", () => {
    expect(queueHint).toContain("e edits it");
    expect(queueHint).toContain("del drops it");
  });
});

function editor() {
  const [queue, setQueue] = createSignal<readonly QueuedPrompt[]>([
    { id: "q1", text: "first thought", behavior: "queue" },
    { id: "q2", text: "second thought", behavior: "queue" },
    { id: "q3", text: "third thought", behavior: "queue" },
  ]);
  const edited: string[] = [];
  const draft: QueueDraft = { empty: true, edit: (text) => edited.push(text) };
  const keys = createRoot(() =>
    createQueueEditor({
      queue,
      move: () => {},
      cancel: (prompt) => setQueue((held) => held.filter((queued) => queued.id !== prompt.id)),
      sendNow: () => {},
      bringBack: () => false,
    }),
  );
  const press = (key: string, modifiers: Partial<QueueKeyEvent> = {}): boolean =>
    keys.handle(
      {
        key,
        altKey: false,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        isComposing: false,
        ...modifiers,
      },
      draft,
    );
  return { keys, queue, press, edited };
}
