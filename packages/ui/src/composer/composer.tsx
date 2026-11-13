import type { QueuedPrompt } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, For, on, Show, untrack } from "solid-js";
import { originLabel } from "../page/origin.ts";
import type { CommandRegistry } from "../palette/commands.ts";
import { useKeyboardScope } from "../shell/keyboard-claim.ts";
import "./composer.css";
import { clusterAfter, clusterBefore, type TextSpan } from "./graphemes.ts";
import type { DraftMemory, KeptDraft } from "./kept-draft.ts";
import { createPasteVault, type PasteVault } from "./paste-vault.ts";
import { createPromptHistory, historyStepOf } from "./prompt-history.ts";
import type { QueueDraft, QueueKeys } from "./queue-editor.ts";
import { createSlashInput } from "./slash-input.ts";
import { SlashMenu } from "./slash-menu.tsx";
import { editUndoably } from "./undoable.ts";

export interface ComposerProps {
  queue: readonly QueuedPrompt[];
  busy?: boolean | undefined;
  placeholder?: string | undefined;
  seed?: { readonly text: string } | undefined;
  memory?: DraftMemory | undefined;
  hold?: string | undefined;
  commands?: CommandRegistry | undefined;
  commandScope?: string | undefined;
  onSteer: (text: string) => void;
  onQueue: (text: string) => void;
  onNow?: ((text: string) => void) | undefined;
  onInterrupt: () => void;
  queueKeys?: QueueKeys | undefined;
  inputRef?: ((input: HTMLTextAreaElement) => void) | undefined;
  onDraft?: ((open: boolean) => void) | undefined;
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
  const keyboard = useKeyboardScope();
  const [draft, setDraft] = createSignal("");
  const pastes = createPasteVault();
  const history = createPromptHistory();
  let field: HTMLTextAreaElement | undefined;
  const kept = (): KeptDraft => ({ text: draft(), pastes: pastes.heldIn(draft()) });
  const replaceSpan = (input: HTMLTextAreaElement, span: TextSpan, text: string): void => {
    editUndoably(input, span, text);
    setDraft(input.value);
  };
  const adopt = (next: KeptDraft): void => {
    pastes.restore(next.pastes);
    if (field !== undefined && field.value !== next.text) {
      replaceSpan(field, { start: 0, end: field.value.length }, next.text);
    }
    setDraft(next.text);
  };
  const adoptText = (text: string): void => adopt({ text, pastes: pastes.heldIn(text) });
  createEffect(
    on(
      () => draft().trim() !== "",
      (open) => props.onDraft?.(open),
    ),
  );
  plantSeedsAsTheyArrive(() => props.seed, draft, adoptText);
  keepDraftIn(() => props.memory, kept, adopt);

  const submit = (send: (text: string) => void): void => {
    const text = pastes.expandAll(draft()).trim();
    if (text === "" || props.hold !== undefined) return;
    const sent = kept();
    send(text);
    history.remember(sent);
    adopt({ text: "", pastes: sent.pastes });
  };
  const slash = createSlashInput({
    draft,
    expanded: () => pastes.expandAll(draft()),
    setDraft: adoptText,
    commands: () => props.commands,
    scope: () => props.commandScope,
  });
  const onPaste = (event: ClipboardEvent & { currentTarget: HTMLTextAreaElement }): void => {
    const pasted = event.clipboardData?.getData("text/plain");
    if (pasted === undefined || pasted === "") return;
    event.preventDefault();
    const input = event.currentTarget;
    replaceSpan(input, selectionOf(input), pastes.hold(withUnixNewlines(pasted)));
  };

  const queueDraft = (): QueueDraft => ({
    empty: draft() === "",
    edit: (text) => adopt({ text, pastes: [] }),
  });
  const editQueue = (event: KeyboardEvent): boolean =>
    props.queueKeys?.handle(event, queueDraft()) ?? false;
  const recallHistory = (event: KeyboardEvent, input: HTMLTextAreaElement): boolean => {
    const step = historyStepOf(event, input);
    const prompt = step === undefined ? undefined : history.step(step, draft());
    if (prompt === undefined) return false;
    adopt(prompt);
    return true;
  };
  const eraseCluster = (event: KeyboardEvent, input: HTMLTextAreaElement): boolean => {
    const erased = erasedRange(event, input, pastes);
    if (erased === undefined) return false;
    replaceSpan(input, erased, "");
    return true;
  };
  const sendByIntent = (event: KeyboardEvent): boolean => {
    const intent = intentOf(event);
    if (intent === "none" || intent === "newline") return false;
    if (intent === "interrupt") props.onInterrupt();
    else if (intent === "queue") submit(props.onQueue);
    else if (intent === "now") submit(props.onNow ?? props.onSteer);
    else submit(props.onSteer);
    return true;
  };
  const keyHandlers: readonly KeyHandler[] = [
    editQueue,
    recallHistory,
    eraseCluster,
    slash.handle,
    sendByIntent,
  ];
  const onKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement }): void => {
    const input = event.currentTarget;
    if (keyHandlers.some((handle) => handle(event, input))) event.preventDefault();
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
                  {(origin) => <span class="kw-queue-origin">{originLabel(origin())}</span>}
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
          ref={(input) => {
            field = input;
            props.inputRef?.(input);
          }}
          class="kw-composer-input"
          aria-label="prompt"
          rows={1}
          placeholder={props.placeholder ?? "say what you want done"}
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onFocus={(event) => keyboard?.yieldToClaim(event.currentTarget)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
        />
      </div>
      <Show when={props.hold}>{(reason) => <p class="kw-composer-hold">{reason()}</p>}</Show>
    </div>
  );
}

type KeyHandler = (event: KeyboardEvent, input: HTMLTextAreaElement) => boolean;

function plantSeedsAsTheyArrive(
  seed: () => { readonly text: string } | undefined,
  draft: () => string,
  plant: (text: string) => void,
): void {
  createEffect(
    on(createMemo(seed), (current, withdrawn) => {
      if (current !== undefined) plant(current.text);
      else if (withdrawn !== undefined && draft() === withdrawn.text) plant("");
    }),
  );
}

function keepDraftIn(
  memory: () => DraftMemory | undefined,
  kept: () => KeptDraft,
  adopt: (draft: KeptDraft) => void,
): void {
  const keeper = createMemo(memory);
  createEffect(
    on(keeper, (current) => {
      const recalled = current?.recall();
      if (recalled !== undefined) adopt(recalled);
    }),
  );
  createEffect(on(kept, (draft) => untrack(keeper)?.keep(draft), { defer: true }));
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
