import type { ChildLineage } from "@keywork-app/client";
import { Show } from "solid-js";
import { relativeAge } from "../../chrome/telemetry.ts";
import { foldedLine, parentLine, type SessionRow } from "./rows.ts";

export interface SessionRowProps {
  row: SessionRow;
  name: string;
  mark: string;
  wears: string | undefined;
  cost: string | undefined;
  current: boolean;
  cursor: boolean;
  onOpen: () => void;
  onDive: () => void;
}

export function SessionRowView(props: SessionRowProps) {
  return (
    <li
      class="kw-tree-session"
      data-current={props.current ? "" : undefined}
      data-cursor={props.cursor ? "" : undefined}
    >
      <button type="button" class="kw-tree-row" onClick={() => props.onOpen()}>
        <span class="kw-tree-mark" aria-hidden="true">
          {props.mark}
        </span>
        <span class="kw-tree-title">
          <span class="kw-tree-name">{props.name}</span>
          <Show when={props.row.folded}>
            <span class="kw-tree-folded">{foldedLine(props.row.children)}</span>
          </Show>
          <Show when={props.row.parent}>
            {(parent) => <span class="kw-tree-lineage">{parentLine(parent())}</span>}
          </Show>
          <Show when={props.wears}>
            {(wears) => <span class="kw-tree-wears">· {wears()}</span>}
          </Show>
        </span>
        <span class="kw-tree-cost">{props.cost}</span>
        <span class="kw-tree-age">{relativeAge(props.row.summary.lastActivityAt)}</span>
      </button>
      <button
        type="button"
        class="kw-tree-dive"
        aria-label={`tree of ${props.name}`}
        onClick={() => props.onDive()}
      >
        ›
      </button>
    </li>
  );
}

export interface ChildRowProps {
  child: ChildLineage;
  name: string;
  bot: string | undefined;
  current: boolean;
  cursor: boolean;
  onOpen: () => void;
  onDive: () => void;
}

export function ChildRowView(props: ChildRowProps) {
  return (
    <li
      class="kw-tree-session"
      data-child=""
      data-current={props.current ? "" : undefined}
      data-cursor={props.cursor ? "" : undefined}
    >
      <button type="button" class="kw-tree-row" onClick={() => props.onOpen()}>
        <span class="kw-tree-mark" aria-hidden="true">
          └
        </span>
        <span class="kw-tree-title">
          <span class="kw-tree-name">{props.name}</span>
        </span>
        <span class="kw-tree-state" data-state={props.child.state}>
          {props.child.state}
        </span>
        <span class="kw-tree-bot">{props.bot}</span>
      </button>
      <button
        type="button"
        class="kw-tree-dive"
        aria-label={`tree of ${props.name}`}
        onClick={() => props.onDive()}
      >
        ›
      </button>
    </li>
  );
}
