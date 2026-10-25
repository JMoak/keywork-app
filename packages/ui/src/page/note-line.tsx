import { maxDenialNote } from "@keywork-app/client";
import { createSignal } from "solid-js";
import "./ask-card.css";

export const notePrompt = "in your words";

export const noteKeys = "enter sends · esc sends it without words";

export interface NoteLineProps {
  onSend: (note: string) => void;
}

export function NoteLine(props: NoteLineProps) {
  const [text, setText] = createSignal("");
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    props.onSend(event.key === "Enter" ? text() : "");
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
      <span class="kw-ask-note-keys">{noteKeys}</span>
    </label>
  );
}
