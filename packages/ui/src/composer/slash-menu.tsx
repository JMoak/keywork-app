import { For, Match, Show, Switch } from "solid-js";
import { descriptionOf, hintOf, type Suggestion } from "../palette/slash.ts";

export interface SlashMenuProps {
  suggestions: readonly Suggestion[];
  selected: number;
  onHover: (row: number) => void;
  onChoose: (row: number) => void;
}

export function SlashMenu(props: SlashMenuProps) {
  return (
    <Show
      when={props.suggestions.length > 0}
      fallback={<p class="kw-slash-empty">no command by that name · enter sends it as a prompt</p>}
    >
      <div class="kw-slash" role="listbox" aria-label="commands">
        <For each={props.suggestions}>
          {(suggestion, at) => (
            <div
              class="kw-slash-row"
              role="option"
              tabIndex={-1}
              aria-selected={at() === props.selected}
              data-selected={at() === props.selected ? "" : undefined}
              onMouseEnter={() => props.onHover(at())}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onChoose(at())}
              onKeyDown={(event) => {
                if (event.key === "Enter") props.onChoose(at());
              }}
            >
              <span class="kw-slash-name">
                <SuggestionName suggestion={suggestion} />
              </span>
              <span class="kw-slash-description">{descriptionOf(suggestion)}</span>
              <kbd class="kw-slash-key">{suggestion.command.shortcut ?? ""}</kbd>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function SuggestionName(props: { suggestion: Suggestion }) {
  return (
    <Switch>
      <Match when={props.suggestion.kind === "value" ? props.suggestion : undefined}>
        {(value) => (
          <>
            /{value().command.name} <span class="kw-slash-value">{value().value}</span>
          </>
        )}
      </Match>
      <Match when={props.suggestion.kind === "command"}>
        /{props.suggestion.command.name}
        <Show when={hintOf(props.suggestion.command)}>
          {(hint) => <span class="kw-slash-hint"> {hint()}</span>}
        </Show>
      </Match>
    </Switch>
  );
}
