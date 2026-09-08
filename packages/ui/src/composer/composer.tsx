import type { QueuedPrompt } from "@keywork-app/protocol";
import { createSignal, For, Show } from "solid-js";
import "./composer.css";

export interface ComposerProps {
  queue: readonly QueuedPrompt[];
  busy?: boolean | undefined;
  placeholder?: string | undefined;
  onSteer: (text: string) => void;
  onQueue: (text: string) => void;
  onInterrupt: () => void;
}

export type ComposerIntent = "steer" | "queue" | "interrupt" | "newline" | "none";

export function intentOf(
  event: Pick<KeyboardEvent, "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey" | "isComposing">,
): ComposerIntent {
  if (event.isComposing) return "none";
  if (event.key === "Escape") return "interrupt";
  if (event.key !== "Enter") return "none";
  if (event.shiftKey) return "newline";
  if (event.altKey) return "queue";
  if (event.ctrlKey || event.metaKey) return "steer";
  return "steer";
}

export function Composer(props: ComposerProps) {
  const [draft, setDraft] = createSignal("");
  const submit = (send: (text: string) => void): void => {
    const text = draft().trim();
    if (text === "") return;
    send(text);
    setDraft("");
  };
  const onKeyDown = (event: KeyboardEvent): void => {
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
          class="kw-composer-input"
          aria-label="prompt"
          rows={1}
          placeholder={props.placeholder ?? "say what you want done"}
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
