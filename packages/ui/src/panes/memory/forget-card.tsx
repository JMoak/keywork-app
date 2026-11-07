import { For, Show } from "solid-js";
import { type ForgetCardView, forgetKeysLine, nothingToForgetLine, undoLine } from "./forget.ts";

export const forgetConfirmKey = "y";

export interface ForgetCardProps {
  view: ForgetCardView;
  onForget(): void;
  onKeep(): void;
}

export function ForgetCard(props: ForgetCardProps) {
  const onKeyDown = (event: KeyboardEvent): void => {
    event.preventDefault();
    if (!props.view.empty && (event.key === forgetConfirmKey || event.key === "Enter")) {
      props.onForget();
      return;
    }
    props.onKeep();
  };
  return (
    <fieldset
      class="kw-memory-forget"
      aria-label={props.view.title}
      tabIndex={-1}
      ref={(card) => queueMicrotask(() => card.focus())}
      onKeyDown={onKeyDown}
    >
      <legend class="kw-memory-forget-title">{props.view.title}</legend>
      <Show
        when={!props.view.empty}
        fallback={<p class="kw-memory-forget-line">{nothingToForgetLine}</p>}
      >
        <p class="kw-memory-forget-line" data-part="tally">
          {props.view.tally}
        </p>
        <For each={props.view.sections}>
          {(part) => (
            <section class="kw-memory-forget-section" data-part={part.heading}>
              <h4 class="kw-memory-forget-heading">{part.heading}</h4>
              <ul class="kw-memory-forget-lines">
                <For each={part.lines}>{(line) => <li>{line}</li>}</For>
              </ul>
              <Show when={part.more > 0}>
                <p class="kw-memory-forget-more">and {part.more} more</p>
              </Show>
            </section>
          )}
        </For>
        <For each={props.view.kept}>
          {(line) => (
            <p class="kw-memory-forget-line" data-part="kept">
              {line}
            </p>
          )}
        </For>
        <p class="kw-memory-forget-line" data-part="undo">
          {undoLine}
        </p>
      </Show>
      <p class="kw-memory-forget-keys">{props.view.empty ? "any key closes" : forgetKeysLine}</p>
    </fieldset>
  );
}
