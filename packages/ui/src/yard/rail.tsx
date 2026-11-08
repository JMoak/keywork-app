import type { KeeperShowOutcome, Rung } from "@keywork-app/protocol";
import { createEffect, For, type JSX, on, Show } from "solid-js";
import type { Rect } from "../layout/index.ts";
import { pinAnswer } from "./answers.ts";
import { emptyRail, foldedLine, heldBackLine, railHint, railLabel } from "./copy.ts";
import "./yard.css";

export interface RailEntry {
  readonly id: string;
  readonly title: string;
  readonly by: string;
  readonly why: string;
  readonly shown: Rung;
  readonly pinned: boolean;
}

export interface RailCardSpot {
  readonly id: string;
  readonly rect: Rect;
}

export interface RailProps {
  entries: readonly RailEntry[];
  cards: readonly RailCardSpot[];
  head: Rect;
  fold: Rect | undefined;
  folded: number;
  heldBack: number;
  active: boolean;
  cursor: string | undefined;
  onCursor(id: string): void;
  onEnter(entry: RailEntry): void;
  onAnswer(entry: RailEntry, outcome: KeeperShowOutcome): void;
  onReturn(): void;
}

export function Rail(props: RailProps) {
  let list: HTMLDivElement | undefined;
  const current = (): RailEntry | undefined =>
    props.entries.find((entry) => entry.id === props.cursor) ?? props.entries[0];
  const entryOf = (id: string): RailEntry | undefined =>
    props.entries.find((entry) => entry.id === id);
  const step = (delta: number): void => {
    const at = props.entries.findIndex((entry) => entry.id === current()?.id);
    const next = props.entries[Math.min(Math.max(0, at + delta), props.entries.length - 1)];
    if (next !== undefined) props.onCursor(next.id);
  };
  const withCurrent = (act: (entry: RailEntry) => void) => (): void => {
    const entry = current();
    if (entry !== undefined) act(entry);
  };
  const keyed: Readonly<Record<string, () => void>> = {
    j: () => step(1),
    ArrowDown: () => step(1),
    k: () => step(-1),
    ArrowUp: () => step(-1),
    Enter: withCurrent((entry) => props.onEnter(entry)),
    x: withCurrent((entry) => props.onAnswer(entry, "dismissed")),
    p: withCurrent((entry) => props.onAnswer(entry, pinAnswer(entry.pinned))),
    Escape: () => props.onReturn(),
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const act = keyed[event.key];
    if (act === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    act();
  };
  createEffect(
    on(
      () => props.active,
      (active) => {
        if (active && list !== undefined && !list.contains(document.activeElement)) {
          list.focus({ preventScroll: true });
        }
      },
    ),
  );

  return (
    <div
      ref={list}
      class="kw-yard-rail"
      role="listbox"
      tabIndex={-1}
      aria-label={railLabel}
      aria-activedescendant={
        props.active && current() !== undefined ? railEntryId(current()?.id) : undefined
      }
      data-active={props.active ? "" : undefined}
      data-keys-owned
      onKeyDown={onKeyDown}
    >
      <p class="kw-yard-rail-head" style={rectStyle(props.head)}>
        {headLine(props)}
      </p>
      <For each={props.cards}>
        {(spot) => (
          <Show when={entryOf(spot.id)}>
            {(entry) => (
              <RailCardView
                entry={entry()}
                rect={spot.rect}
                cursor={props.active && current()?.id === spot.id}
                onPick={() => {
                  props.onCursor(spot.id);
                  props.onEnter(entry());
                }}
              />
            )}
          </Show>
        )}
      </For>
      <Show when={props.fold !== undefined && props.folded > 0}>
        <p class="kw-yard-folded" style={rectStyle(props.fold)}>
          {foldedLine(props.folded)}
        </p>
      </Show>
    </div>
  );
}

function headLine(props: RailProps): string {
  if (props.active) return railHint;
  if (props.heldBack > 0) return heldBackLine(props.heldBack);
  return props.entries.length === 0 ? emptyRail : railLabel;
}

export function railEntryId(id: string | undefined): string {
  return `kw-yard-entry-${id ?? ""}`;
}

interface RailCardViewProps {
  entry: RailEntry;
  rect: Rect;
  cursor: boolean;
  onPick(): void;
}

function RailCardView(props: RailCardViewProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      id={railEntryId(props.entry.id)}
      class="kw-yard-card"
      role="option"
      aria-selected={props.cursor}
      data-rung={props.entry.shown}
      data-pinned={props.entry.pinned ? "" : undefined}
      data-cursor={props.cursor ? "" : undefined}
      style={rectStyle(props.rect)}
      onClick={() => props.onPick()}
    >
      <span class="kw-yard-card-title">{props.entry.title}</span>
      <span class="kw-yard-card-by">{props.entry.by}</span>
      <span class="kw-yard-card-why">{props.entry.why}</span>
    </button>
  );
}

export function rectStyle(rect: Rect | undefined): JSX.CSSProperties | undefined {
  if (rect === undefined) return undefined;
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}
