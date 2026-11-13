import { maxDenialNote } from "@keywork-app/client";
import { createSignal } from "solid-js";
import "./ask-card.css";

export const notePrompt = "in your words";

export const noteKeys = "enter sends · esc sends it without words";

export const noteKeysWithBack = "enter sends · esc back";

export interface NoteLineProps {
  onSend: (note: string) => void;
  onBack?: (() => void) | undefined;
}

export function NoteLine(props: NoteLineProps) {
  const [text, setText] = createSignal("");
  const leave = (): void => {
    if (props.onBack === undefined) props.onSend("");
    else props.onBack();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Enter") props.onSend(text());
    else leave();
  };
  return (
    <label class="kw-ask-note">
      <span class="kw-ask-reason-prompt">{notePrompt}</span>
      <input
        class="kw-ask-note-input"
        aria-label={notePrompt}
        maxLength={maxDenialNote}
        value={text()}
        ref={(input) => queueMicrotask(() => input.focus())}
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <span class="kw-ask-note-keys">
        {props.onBack === undefined ? noteKeys : noteKeysWithBack}
      </span>
    </label>
  );
}
