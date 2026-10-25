import type { QueuedPrompt } from "@keywork-app/protocol";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import type { CommandRegistry } from "../palette/commands.ts";
import "./composer.css";
import { clusterAfter, clusterBefore, type TextSpan } from "./graphemes.ts";
import { createPasteVault, type PasteVault } from "./paste-vault.ts";
import type { QueueKeys } from "./queue-editor.ts";
import { createSlashInput } from "./slash-input.ts";
import { SlashMenu } from "./slash-menu.tsx";

export interface ComposerProps {
  queue: readonly QueuedPrompt[];
  busy?: boolean | undefined;
  placeholder?: string | undefined;
  seed?: { readonly text: string } | undefined;
  hold?: string | undefined;
  commands?: CommandRegistry | undefined;
  commandScope?: string | undefined;
  onSteer: (text: string) => void;
  onQueue: (text: string) => void;
  onNow?: ((text: string) => void) | undefined;
  onInterrupt: () => void;
  queueKeys?: QueueKeys | undefined;
  inputRef?: ((input: HTMLTextAreaElement) => void) | undefined;
}

export type ComposerIntent = "steer" | "queue" | "now" | "interrupt" | "newline" | "none";

export function intentOf(
  event: Pick<KeyboardEvent, "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey" | "isComposing">,
): ComposerIntent {
  if (event.isComposing) return "none";
  if (event.key === "Escape") return "interrupt";
  if (event.key !== "Enter") return "none";
  if (event.shiftKey) return "newline";
  if (event.ctrlKey || event.metaKey) return "now";
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
    if (text === "" || props.hold !== undefined) return;
    send(text);
    pastes.clear();
    setDraft("");
  };
  const slash = createSlashInput({
    draft,
    expanded: () => pastes.expandAll(draft()),
    setDraft: (text) => {
      if (text === "") pastes.clear();
      setDraft(text);
    },
    commands: () => props.commands,
    scope: () => props.commandScope,
  });
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
    if (props.queueKeys?.handle(event, draft() === "")) {
      event.preventDefault();
      return;
    }
    const erased = erasedRange(event, event.currentTarget, pastes);
    if (erased !== undefined) {
      event.preventDefault();
      replaceSpan(event.currentTarget, erased, "");
      return;
    }
    if (slash.handle(event)) {
      event.preventDefault();
      return;
    }
    const intent = intentOf(event);
    if (intent === "none" || intent === "newline") return;
    event.preventDefault();
    if (intent === "interrupt") props.onInterrupt();
    else if (intent === "queue") submit(props.onQueue);
    else if (intent === "now") submit(props.onNow ?? props.onSteer);
    else submit(props.onSteer);
  };
  return (
    <div class="kw-composer" data-busy={props.busy ? "" : undefined}>
      <Show when={props.queue.length > 0}>
        <ol class="kw-queue" aria-label="queued prompts">
          <For each={props.queue}>
            {(prompt) => (
              <li
                class="kw-queue-item"
                data-behavior={prompt.behavior}
                data-selected={props.queueKeys?.selected() === prompt.id ? "" : undefined}
              >
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
      <Show when={slash.active()}>
        <SlashMenu
          suggestions={slash.suggestions()}
          selected={slash.selected()}
          onHover={slash.select}
          onChoose={slash.choose}
        />
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
      <Show when={props.hold}>{(reason) => <p class="kw-composer-hold">{reason()}</p>}</Show>
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
