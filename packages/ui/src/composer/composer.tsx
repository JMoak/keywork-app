import type { QueuedPrompt } from "@keywork-app/protocol";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import "./composer.css";
import { clusterAfter, clusterBefore, type TextSpan } from "./graphemes.ts";
import { createPasteVault, type PasteVault } from "./paste-vault.ts";

export interface ComposerProps {
  queue: readonly QueuedPrompt[];
  busy?: boolean | undefined;
  placeholder?: string | undefined;
  seed?: { readonly text: string } | undefined;
  onSteer: (text: string) => void;
  onQueue: (text: string) => void;
  onInterrupt: () => void;
  inputRef?: ((input: HTMLTextAreaElement) => void) | undefined;
}

export type ComposerIntent = "steer" | "queue" | "interrupt" | "newline" | "none";

export function intentOf(
  event: Pick<KeyboardEvent, "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey" | "isComposing">,
): ComposerIntent {
  if (event.isComposing) return "none";
  if (event.key === "Escape") return "interrupt";
  if (event.key !== "Enter") return "none";
  if (event.shiftKey) return "newline";
  if (event.altKey) return "steer";
  return "queue";
}

export function Composer(props: ComposerProps) {
  const [draft, setDraft] = createSignal("");
  const pastes = createPasteVault();
  createEffect(
    on(
      () => props.seed,
      (seed, withdrawn) => {
        if (seed !== undefined) setDraft(seed.text);
        else if (withdrawn !== undefined && draft() === withdrawn.text) setDraft("");
      },
    ),
  );
  const submit = (send: (text: string) => void): void => {
    const text = pastes.expandAll(draft()).trim();
    if (text === "") return;
    send(text);
    pastes.clear();
    setDraft("");
  };
  const replaceSpan = (input: HTMLTextAreaElement, span: TextSpan, text: string): void => {
    input.setRangeText(text, span.start, span.end, "end");
    setDraft(input.value);
  };
  const onPaste = (event: ClipboardEvent & { currentTarget: HTMLTextAreaElement }): void => {
    const pasted = event.clipboardData?.getData("text/plain");
    if (pasted === undefined || pasted === "") return;
    event.preventDefault();
    const input = event.currentTarget;
    replaceSpan(input, selectionOf(input), pastes.hold(withUnixNewlines(pasted)));
  };
  const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }): void => {
    const erased = erasedRange(event, event.currentTarget, pastes);
    if (erased !== undefined) {
      event.preventDefault();
      replaceSpan(event.currentTarget, erased, "");
      return;
    }
    const intent = intentOf(event);
    if (intent === "none" || intent === "newline") return;
    event.preventDefault();
    if (intent === "interrupt") props.onInterrupt();
    else if (intent === "queue") submit(props.onQueue);
    else submit(props.onSteer);
  };
  return (
    <div class="kw-composer" data-busy={props.busy ? "" : undefined}>
      <Show when={props.queue.length > 0}>
        <ol class="kw-queue" aria-label="queued prompts">
          <For each={props.queue}>
            {(prompt) => (
              <li class="kw-queue-item" data-behavior={prompt.behavior}>
                <span class="kw-queue-mark" aria-hidden="true">
                  ░
                </span>
                {prompt.text}
                <Show when={prompt.origin}>
                  {(origin) => <span class="kw-queue-origin">via {origin().client}</span>}
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <div class="kw-composer-row">
        <span class="kw-composer-prompt" aria-hidden="true">
          ❯
        </span>
        <textarea
          ref={(input) => props.inputRef?.(input)}
          class="kw-composer-input"
          aria-label="prompt"
          rows={1}
          placeholder={props.placeholder ?? "say what you want done"}
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

function erasedRange(
  event: KeyboardEvent,
  input: HTMLTextAreaElement,
  pastes: PasteVault,
): TextSpan | undefined {
  if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return undefined;
  const caret = input.selectionStart;
  if (caret !== input.selectionEnd) return undefined;
  const text = input.value;
  if (event.key === "Backspace" && caret > 0) {
    const placeholder = pastes.spanEndingAt(text, caret);
    return placeholder ?? clusterBefore(text, caret);
  }
  if (event.key === "Delete" && caret < text.length) {
    const placeholder = pastes.spanStartingAt(text, caret);
    return placeholder ?? clusterAfter(text, caret);
  }
  return undefined;
}

function selectionOf(input: HTMLTextAreaElement): TextSpan {
  return { start: input.selectionStart, end: input.selectionEnd };
}

function withUnixNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
