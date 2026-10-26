import type { QueuedPrompt } from "@keywork-app/protocol";
import { createMemo, createSignal } from "solid-js";
import "./queue-editor.css";

export interface QueueKeys {
  selected(): string | undefined;
  editing(): boolean;
  handle(event: QueueKeyEvent, draftEmpty: boolean): boolean;
}

export interface QueueEdits {
  queue(): readonly QueuedPrompt[];
  move(prompt: QueuedPrompt, to: number): void;
  cancel(prompt: QueuedPrompt): void;
  sendNow(prompt: QueuedPrompt): void;
  bringBack(): boolean;
}

export type QueueKeyEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey" | "isComposing"
>;

export const queueHint =
  "queue · ↑↓ picks · shift+↑↓ moves it · del drops it · enter sends it now · esc is done";

export function createQueueEditor(edits: QueueEdits): QueueKeys {
  const [chosen, setChosen] = createSignal<string>();
  const at = createMemo(() => {
    const index = edits.queue().findIndex((prompt) => prompt.id === chosen());
    return index === -1 ? undefined : index;
  });
  const prompt = (): QueuedPrompt | undefined => {
    const index = at();
    return index === undefined ? undefined : edits.queue()[index];
  };
  const choose = (index: number): void => {
    setChosen(edits.queue()[index]?.id);
  };
  const done = (): void => {
    setChosen(undefined);
  };

  const enter = (step: Step): boolean => {
    if (edits.bringBack()) return true;
    const count = edits.queue().length;
    if (count === 0) return false;
    choose(step === -1 ? count - 1 : 0);
    return true;
  };
  const stepTo = (step: Step): void => {
    const index = at();
    if (index !== undefined) choose(clamp(index + step, edits.queue().length));
  };
  const moveBy = (step: Step): void => {
    const held = prompt();
    const index = at();
    if (held === undefined || index === undefined) return;
    const to = index + step;
    if (to >= 0 && to < edits.queue().length) edits.move(held, to);
  };
  const drop = (): void => {
    const held = prompt();
    const index = at();
    if (held === undefined || index === undefined) return;
    const neighbor = edits.queue()[index + 1] ?? edits.queue()[index - 1];
    setChosen(neighbor?.id);
    edits.cancel(held);
  };
  const sendNow = (): void => {
    const held = prompt();
    done();
    if (held !== undefined) edits.sendNow(held);
  };

  const whileEditing = (event: QueueKeyEvent): boolean => {
    if (modifierKeys.has(event.key)) return false;
    const step = stepOf(event.key);
    if (step !== undefined && !event.ctrlKey && !event.metaKey) {
      if (event.shiftKey) moveBy(step);
      else stepTo(step);
      return true;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      drop();
      return true;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      sendNow();
      return true;
    }
    done();
    return event.key === "Escape";
  };

  return {
    selected: () => prompt()?.id,
    editing: () => at() !== undefined,
    handle: (event, draftEmpty) => {
      if (event.isComposing) return false;
      if (at() !== undefined) return whileEditing(event);
      const step = stepOf(event.key);
      const entering = draftEmpty && step !== undefined && event.altKey && !event.ctrlKey;
      return entering && !event.metaKey && enter(step);
    },
  };
}

export function setAsideNotice(count: number): string {
  const prompts = count === 1 ? "1 queued prompt" : `${count} queued prompts`;
  return `${prompts} set aside · alt+↑ on an empty prompt queues ${count === 1 ? "it" : "them"} again`;
}

export function broughtBackNotice(count: number): string {
  return count === 1
    ? "queued the set-aside prompt again"
    : `queued ${count} set-aside prompts again`;
}

type Step = -1 | 1;

const modifierKeys: ReadonlySet<string> = new Set(["Shift", "Alt", "Control", "Meta"]);

function stepOf(key: string): Step | undefined {
  if (key === "ArrowUp") return -1;
  if (key === "ArrowDown") return 1;
  return undefined;
}

function clamp(index: number, count: number): number {
  return Math.min(count - 1, Math.max(0, index));
}
