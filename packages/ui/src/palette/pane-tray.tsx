import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { type CommandSpec, fuzzyScore } from "./commands.ts";
import { matchRuns } from "./palette.tsx";
import "./pane-tray.css";

export interface PaneTrayProps {
  paneName: string;
  commands: readonly CommandSpec[];
  onDismiss: () => void;
}

export function rankedForTray(commands: readonly CommandSpec[], query: string): CommandSpec[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...commands];
  return commands
    .flatMap((command) => {
      const score = fuzzyScore(needle, command.name);
      return score === undefined ? [] : [{ command, score }];
    })
    .sort((left, right) => right.score - left.score)
    .map((ranked) => ranked.command);
}

export function PaneTray(props: PaneTrayProps) {
  const [query, setQuery] = createSignal("");
  const [index, setIndex] = createSignal(0);
  let tray: HTMLDivElement | undefined;
  let input: HTMLInputElement | undefined;
  const matches = createMemo(() => rankedForTray(props.commands, query()));
  const selected = (): number => Math.min(index(), Math.max(0, matches().length - 1));
  const step = (delta: number): void => {
    const count = Math.max(1, matches().length);
    setIndex((selected() + delta + count) % count);
  };
  const run = (row: number): void => {
    const chosen = matches()[row];
    props.onDismiss();
    chosen?.run();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const intent = trayIntentOf(event);
    if (intent === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (intent === "close") props.onDismiss();
    else if (intent === "choose") run(selected());
    else step(intent === "down" ? 1 : -1);
  };
  onMount(() => {
    input?.focus();
    const dismissOutside = (event: PointerEvent): void => {
      if (tray !== undefined && !tray.contains(event.target as Node)) props.onDismiss();
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    onCleanup(() => document.removeEventListener("pointerdown", dismissOutside, true));
  });
  return (
    <div class="kw-tray" ref={tray} role="dialog" aria-label={`${props.paneName} commands`}>
      <Show
        when={matches().length > 0}
        fallback={<p class="kw-tray-empty">no matching commands</p>}
      >
        <div class="kw-tray-rows" role="listbox" data-searching={query() === "" ? undefined : ""}>
          <For each={matches()}>
            {(command, at) => (
              <div
                class="kw-tray-row"
                role="option"
                tabIndex={-1}
                aria-selected={at() === selected()}
                data-selected={at() === selected() ? "" : undefined}
                onMouseEnter={() => setIndex(at())}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run(at())}
                onKeyDown={onKeyDown}
              >
                <span class="kw-tray-mark" aria-hidden="true">
                  {at() === selected() ? "▸" : " "}
                </span>
                <span class="kw-tray-name">
                  <For each={matchRuns(command.name, query())}>
                    {(part) => (
                      <span class="kw-tray-run" data-match={part.matched ? "" : undefined}>
                        {part.text}
                      </span>
                    )}
                  </For>
                </span>
                <span class="kw-tray-description">{command.description}</span>
                <kbd class="kw-tray-key">{command.shortcut ?? ""}</kbd>
              </div>
            )}
          </For>
        </div>
      </Show>
      <label class="kw-tray-ask">
        <span class="kw-tray-prompt" aria-hidden="true">
          :
        </span>
        <input
          ref={input}
          class="kw-tray-input"
          aria-label={`${props.paneName} commands`}
          value={query()}
          onInput={(event) => {
            setQuery(event.currentTarget.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
    </div>
  );
}

type TrayIntent = "close" | "choose" | "down" | "up";

function trayIntentOf(event: KeyboardEvent): TrayIntent | undefined {
  switch (event.key) {
    case "Escape":
      return "close";
    case "Enter":
      return "choose";
    case "ArrowDown":
      return "down";
    case "ArrowUp":
      return "up";
    case "Tab":
      return event.shiftKey ? "up" : "down";
    default:
      return undefined;
  }
}
