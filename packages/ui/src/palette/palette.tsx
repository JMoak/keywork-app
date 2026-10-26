import { createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import type { LiveKeys } from "../keys/live.ts";
import type { PaneKind } from "../panes/index.ts";
import { type CommandRegistry, fuzzyMatches } from "./commands.ts";
import {
  argumentOf,
  completionOf,
  descriptionOf,
  hintOf,
  invocationOf,
  resolveSlash,
  type Suggestion,
  slashSuggestions,
} from "./slash.ts";
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

export function paletteRows(
  registry: CommandRegistry,
  query: string,
  scope?: string | undefined,
): Suggestion[] {
  const text = searchTextOf(query);
  if (paletteModeOf(query) === "commands") return slashSuggestions({ registry, scope }, text);
  return registry
    .search(text, scope)
    .filter((command) => command.jump === true)
    .slice(0, paletteRowLimit)
    .map((command) => ({ kind: "command", command }));
}

export interface PaletteProps {
  registry: CommandRegistry;
  scope?: string | undefined;
  initialQuery?: string | undefined;
  onDismiss: () => void;
}

export function Palette(props: PaletteProps) {
  const [query, setQuery] = createSignal(props.initialQuery ?? "");
  const [index, setIndex] = createSignal(0);
  let input: HTMLInputElement | undefined;
  const rows = createMemo(() => paletteRows(props.registry, query(), props.scope));
  const mode = () => paletteModeOf(query());
  const typed = () => searchTextOf(query());
  const needle = () => (mode() === "commands" ? invocationOf(typed()).verb : typed());
  const retype = (next: string): void => {
    setQuery(next);
    setIndex(0);
  };
  const fill = (text: string): void => {
    retype(`${query().slice(0, 1)}${text}`);
    input?.focus();
  };
  const choose = (row: number): void => {
    const chosen = rows()[row];
    if (mode() === "go") {
      props.onDismiss();
      chosen?.command.run();
      return;
    }
    const context = { registry: props.registry, scope: props.scope };
    const resolution = resolveSlash(context, typed(), chosen);
    if (resolution.kind === "complete") fill(resolution.text);
    else if (resolution.kind === "run") {
      props.onDismiss();
      resolution.command.run(resolution.argument);
    }
  };
  const complete = (): void => {
    const chosen = rows()[index()];
    if (chosen !== undefined && mode() === "commands") fill(completionOf(chosen));
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onDismiss();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((at) => Math.min(at + 1, Math.max(0, rows().length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((at) => Math.max(at - 1, 0));
    } else if (event.key === "Tab") {
      event.preventDefault();
      complete();
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(index());
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
          when={rows().length > 0}
          fallback={<p class="kw-palette-empty">nothing matches · esc closes</p>}
        >
          <div
            class="kw-palette-rows"
            role="listbox"
            data-searching={typed().trim() === "" ? undefined : ""}
          >
            <For each={rows()}>
              {(row, at) => (
                <div
                  class="kw-palette-row"
                  role="option"
                  tabIndex={-1}
                  aria-selected={at() === index()}
                  data-selected={at() === index() ? "" : undefined}
                  onMouseEnter={() => setIndex(at())}
                  onClick={() => choose(at())}
                  onKeyDown={onKeyDown}
                >
                  <span class="kw-palette-name">
                    <RowName
                      row={row}
                      needle={needle()}
                      argument={argumentOf(invocationOf(typed()))}
                    />
                  </span>
                  <span class="kw-palette-description">{descriptionOf(row)}</span>
                  <kbd class="kw-palette-shortcut">{row.command.shortcut ?? ""}</kbd>
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

export interface HelpSection {
  readonly heading?: string | undefined;
  readonly rows: readonly HelpRow[];
}

export type HelpKeys = Pick<LiveKeys, "actions" | "describeAll">;

export const composerKeys: readonly HelpRow[] = [
  { keys: "enter", help: "send · queues behind a running turn" },
  { keys: "alt+enter", help: "steer the running turn" },
  { keys: "shift+enter", help: "newline in the prompt" },
  { keys: "/", help: "a command at the start of the prompt · tab completes it" },
  { keys: "esc", help: "interrupt the running turn" },
];

export function helpRows(keys: HelpKeys, help: Record<string, string>): HelpRow[] {
  return [...boundRows(keys, help, keys.actions()), ...composerKeys];
}

export function helpSections(
  keys: HelpKeys,
  help: Record<string, string>,
  scopes: Readonly<Record<string, string>>,
): HelpSection[] {
  const everywhere: string[] = [];
  const byPane = new Map<PaneKind, string[]>();
  for (const action of keys.actions()) {
    const scope = scopes[action];
    if (scope === undefined || !isPaneKind(scope)) everywhere.push(action);
    else byPane.set(scope, [...(byPane.get(scope) ?? []), action]);
  }
  return [
    { heading: "anywhere", rows: boundRows(keys, help, everywhere) },
    ...[...byPane].map(([kind, actions]) => ({
      heading: paneHeadings[kind],
      rows: boundRows(keys, help, actions),
    })),
    { heading: "in the prompt", rows: composerKeys },
  ].filter((section) => section.rows.length > 0);
}

export interface HelpOverlayProps {
  sections: readonly HelpSection[];
  footer?: readonly string[] | undefined;
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
        <div class="kw-help-sections">
          <For each={props.sections}>
            {(section) => (
              <section class="kw-help-section">
                <Show when={section.heading}>
                  {(heading) => <h3 class="kw-help-heading">{heading()}</h3>}
                </Show>
                <dl class="kw-help-rows">
                  <For each={section.rows}>
                    {(row) => (
                      <>
                        <dt class="kw-help-keys">{row.keys}</dt>
                        <dd class="kw-help-text">{row.help}</dd>
                      </>
                    )}
                  </For>
                </dl>
              </section>
            )}
          </For>
        </div>
        <For each={props.footer ?? []}>{(line) => <p class="kw-help-footer">{line}</p>}</For>
      </div>
    </div>
  );
}

function RowName(props: { row: Suggestion; needle: string; argument: string | undefined }) {
  return (
    <Switch>
      <Match when={props.row.kind === "value" ? props.row : undefined}>
        {(value) => (
          <>
            <span class="kw-palette-run">{value().command.name} </span>
            <MatchedName text={value().value} query={props.argument ?? ""} />
          </>
        )}
      </Match>
      <Match when={props.row.kind === "command"}>
        <MatchedName
          text={props.row.command.label ?? props.row.command.name}
          query={props.needle}
        />
        <Show when={hintOf(props.row.command)}>
          {(hint) => <span class="kw-palette-hint"> {hint()}</span>}
        </Show>
      </Match>
    </Switch>
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

interface BoundRow {
  readonly action: string;
  readonly chords: readonly string[];
  readonly help: string;
}

const paneHeadings: Readonly<Record<PaneKind, string>> = {
  conversation: "in a session pane",
  tree: "in sessions",
  "needs-you": "on the desk",
  diff: "in changes",
  context: "in the context map",
  memory: "in memory",
  terminal: "in a terminal",
  file: "in a file",
  browser: "in files",
  permissions: "in permissions",
  posture: "in trust setup",
  themes: "in themes",
  bots: "in bots",
  arcs: "in arcs",
  workspaces: "in workspaces",
  mcp: "in mcp",
};

const ordinalAction = /^focus\.pane\d$/;

function isPaneKind(scope: string): scope is PaneKind {
  return Object.hasOwn(paneHeadings, scope);
}

function boundRows(
  keys: HelpKeys,
  help: Record<string, string>,
  actions: readonly string[],
): HelpRow[] {
  const bound = actions
    .map((action) => ({ action, chords: keys.describeAll(action), help: help[action] ?? action }))
    .filter((row) => row.chords.length > 0);
  return mergedByHelp(withOrdinalsFolded(bound));
}

function withOrdinalsFolded(rows: readonly BoundRow[]): BoundRow[] {
  const ordinals = rows.filter((row) => ordinalAction.test(row.action));
  const first = ordinals[0];
  const prefix = first?.chords[0]?.slice(0, -1);
  const inStep = ordinals.every((row, at) => row.chords.join() === `${prefix}${at + 1}`);
  if (first === undefined || ordinals.length !== 9 || !inStep) return [...rows];
  const folded = { action: "focus.pane", chords: [`${prefix}1..9`], help: "focus pane 1 to 9" };
  return rows.flatMap((row) => (row === first ? [folded] : ordinals.includes(row) ? [] : [row]));
}

function mergedByHelp(rows: readonly BoundRow[]): HelpRow[] {
  const merged = new Map<string, string[]>();
  for (const row of rows) merged.set(row.help, [...(merged.get(row.help) ?? []), ...row.chords]);
  return [...merged].map(([help, chords]) => ({ keys: chords.join(" · "), help }));
}
