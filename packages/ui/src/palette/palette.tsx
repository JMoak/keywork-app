import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { Keymap } from "../keys/keymap.ts";
import { type CommandRegistry, type CommandSpec, fuzzyMatches } from "./commands.ts";
import "./palette.css";

export type PaletteMode = "go" | "commands";

export const paletteRowLimit = 10;

export function paletteModeOf(query: string): PaletteMode {
  return query.startsWith("/") || query.startsWith(">") ? "commands" : "go";
}

export function searchTextOf(query: string): string {
  return paletteModeOf(query) === "commands" ? query.slice(1) : query;
}

export interface MatchRun {
  readonly text: string;
  readonly matched: boolean;
}

export function matchRuns(text: string, query: string): MatchRun[] {
  const hits = new Set(fuzzyMatches(query, text) ?? []);
  const runs: MatchRun[] = [];
  Array.from(text).forEach((character, index) => {
    const matched = hits.has(index);
    const last = runs.at(-1);
    if (last?.matched === matched) runs[runs.length - 1] = { text: last.text + character, matched };
    else runs.push({ text: character, matched });
  });
  return runs;
}

export function paletteEntries(registry: CommandRegistry, query: string): CommandSpec[] {
  const commandMode = paletteModeOf(query) === "commands";
  return registry
    .search(searchTextOf(query))
    .filter((command) => (command.jump === true) !== commandMode)
    .slice(0, paletteRowLimit);
}

export interface PaletteProps {
  registry: CommandRegistry;
  initialQuery?: string | undefined;
  onDismiss: () => void;
}

export function Palette(props: PaletteProps) {
  const [query, setQuery] = createSignal(props.initialQuery ?? "");
  const [index, setIndex] = createSignal(0);
  let input: HTMLInputElement | undefined;
  const entries = createMemo(() => paletteEntries(props.registry, query()));
  const mode = () => paletteModeOf(query());
  const retype = (next: string): void => {
    setQuery(next);
    setIndex(0);
  };
  const run = (row: number): void => {
    const chosen = entries()[row];
    props.onDismiss();
    chosen?.run();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onDismiss();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((at) => Math.min(at + 1, Math.max(0, entries().length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((at) => Math.max(at - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(index());
    }
  };
  onMount(() => input?.focus());
  return (
    <div class="kw-overlay">
      <button
        type="button"
        class="kw-overlay-backdrop"
        aria-label="close"
        onClick={() => props.onDismiss()}
      />
      <div
        class="kw-palette"
        role="dialog"
        aria-label={mode() === "commands" ? "commands" : "go to"}
      >
        <div class="kw-palette-ask">
          <span class="kw-palette-mode" aria-hidden="true">
            {mode() === "commands" ? "run" : "go"}
          </span>
          <input
            ref={input}
            class="kw-palette-input"
            aria-label="palette"
            value={query()}
            placeholder="type to jump · / for commands"
            onInput={(event) => retype(event.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <Show
          when={entries().length > 0}
          fallback={<p class="kw-palette-empty">nothing matches · esc closes</p>}
        >
          <div
            class="kw-palette-rows"
            role="listbox"
            data-searching={searchTextOf(query()).trim() === "" ? undefined : ""}
          >
            <For each={entries()}>
              {(entry, at) => (
                <div
                  class="kw-palette-row"
                  role="option"
                  tabIndex={-1}
                  aria-selected={at() === index()}
                  data-selected={at() === index() ? "" : undefined}
                  onMouseEnter={() => setIndex(at())}
                  onClick={() => run(at())}
                  onKeyDown={onKeyDown}
                >
                  <span class="kw-palette-name">
                    <MatchedName text={entry.label ?? entry.name} query={searchTextOf(query())} />
                  </span>
                  <span class="kw-palette-description">{entry.description}</span>
                  <kbd class="kw-palette-shortcut">{entry.shortcut ?? ""}</kbd>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

export interface HelpRow {
  readonly keys: string;
  readonly help: string;
}

export const composerKeys: readonly HelpRow[] = [
  { keys: "enter", help: "send · queues behind a running turn" },
  { keys: "alt+enter", help: "steer the running turn" },
  { keys: "shift+enter", help: "newline in the prompt" },
  { keys: "esc", help: "interrupt the running turn" },
];

export function helpRows(keymap: Keymap, help: Record<string, string>): HelpRow[] {
  const bound = keymap.actions().map((action) => ({
    keys: keymap.describeAll(action).join(" · "),
    help: help[action] ?? action,
  }));
  return [...bound, ...composerKeys];
}

export interface HelpOverlayProps {
  rows: readonly HelpRow[];
  onDismiss: () => void;
}

export function HelpOverlay(props: HelpOverlayProps) {
  let panel: HTMLDivElement | undefined;
  onMount(() => panel?.focus());
  return (
    <div class="kw-overlay">
      <button
        type="button"
        class="kw-overlay-backdrop"
        aria-label="close"
        onClick={() => props.onDismiss()}
      />
      <div
        ref={panel}
        class="kw-help"
        role="dialog"
        aria-label="keys"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "F1") {
            event.preventDefault();
            props.onDismiss();
          }
        }}
      >
        <p class="kw-help-title">keys · esc closes</p>
        <dl class="kw-help-rows">
          <For each={props.rows}>
            {(row) => (
              <>
                <dt class="kw-help-keys">{row.keys}</dt>
                <dd class="kw-help-text">{row.help}</dd>
              </>
            )}
          </For>
        </dl>
      </div>
    </div>
  );
}

function MatchedName(props: { text: string; query: string }) {
  return (
    <For each={matchRuns(props.text, props.query)}>
      {(run) => (
        <span class="kw-palette-run" data-match={run.matched ? "" : undefined}>
          {run.text}
        </span>
      )}
    </For>
  );
}
