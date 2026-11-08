import { yardIds } from "@keywork-app/habitat";
import type { KeeperShowOutcome, Rung } from "@keywork-app/protocol";
import { createEffect, createSignal, For, type JSX, on, Show } from "solid-js";
import type { Rect } from "../layout/index.ts";
import { pinAnswer } from "./answers.ts";
import {
  decisionsHead,
  emptyRail,
  foldedLine,
  heldBackLine,
  noDecisions,
  railHint,
  railLabel,
} from "./copy.ts";
import "./yard.css";

export interface RailEntry {
  readonly id: string;
  readonly title: string;
  readonly by: string;
  readonly why: string;
  readonly shown: Rung;
  readonly pinned: boolean;
  readonly withdrawn?: boolean | undefined;
  readonly grouped?: number | undefined;
}

export interface RailCardSpot {
  readonly id: string;
  readonly rect: Rect;
}

export interface YardCardView {
  readonly line: string;
  readonly decisions: readonly string[];
}

export interface RailProps {
  entries: readonly RailEntry[];
  cards: readonly RailCardSpot[];
  head: Rect;
  fold: Rect | undefined;
  folded: number;
  heldBack: number;
  card?: YardCardView | undefined;
  log?: Rect | undefined;
  active: boolean;
  cursor: string | undefined;
  onCursor(id: string): void;
  onEnter(entry: RailEntry): void;
  onAnswer(entry: RailEntry, outcome: KeeperShowOutcome): void;
  onReturn(): void;
}

export function Rail(props: RailProps) {
  let list: HTMLDivElement | undefined;
  const [logOpen, setLogOpen] = createSignal(false);
  const onHead = (): boolean => props.card !== undefined && props.cursor === yardIds.card;
  const current = (): RailEntry | undefined =>
    onHead()
      ? undefined
      : (props.entries.find((entry) => entry.id === props.cursor) ?? props.entries[0]);
  const entryOf = (id: string): RailEntry | undefined =>
    props.entries.find((entry) => entry.id === id);
  const order = (): string[] => [
    ...(props.card === undefined ? [] : [yardIds.card]),
    ...props.entries.map((entry) => entry.id),
  ];
  const step = (delta: number): void => {
    const ids = order();
    const at = ids.indexOf((onHead() ? yardIds.card : current()?.id) ?? "");
    const next = ids[Math.min(Math.max(0, at + delta), ids.length - 1)];
    if (next !== undefined) props.onCursor(next);
  };
  const enter = (): void => {
    if (onHead()) return void setLogOpen((open) => !open);
    const entry = current();
    if (entry !== undefined) props.onEnter(entry);
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
    Enter: enter,
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
        if (!active) setLogOpen(false);
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
        props.active && (onHead() || current() !== undefined)
          ? railEntryId(onHead() ? yardIds.card : current()?.id)
          : undefined
      }
      data-active={props.active ? "" : undefined}
      data-keys-owned
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        tabIndex={-1}
        id={railEntryId(yardIds.card)}
        class="kw-yard-rail-head"
        role="option"
        aria-selected={props.active && onHead()}
        data-cursor={props.active && onHead() ? "" : undefined}
        data-open={logOpen() ? "" : undefined}
        style={rectStyle(props.head)}
        onClick={() => {
          if (props.card === undefined) return;
          props.onCursor(yardIds.card);
          setLogOpen((open) => !open);
        }}
      >
        {headLine(props, onHead(), logOpen())}
      </button>
      <Show when={logOpen() && props.card}>
        {(card) => (
          <ol class="kw-yard-decisions" aria-label={decisionsHead} style={rectStyle(props.log)}>
            <For each={card().decisions} fallback={<li>{noDecisions}</li>}>
              {(line) => <li>{line}</li>}
            </For>
          </ol>
        )}
      </Show>
      <For each={logOpen() ? [] : props.cards}>
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

function headLine(props: RailProps, onHead: boolean, logOpen: boolean): string {
  if (logOpen) return decisionsHead;
  if (props.active && !onHead) return railHint;
  if (props.heldBack > 0) return heldBackLine(props.heldBack);
  if (props.card !== undefined) return props.card.line;
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
      data-withdrawn={props.entry.withdrawn ? "" : undefined}
      data-group={props.entry.grouped}
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
