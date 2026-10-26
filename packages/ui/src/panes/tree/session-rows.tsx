import type { ChildLineage } from "@keywork-app/client";
import { Show } from "solid-js";
import { stampGlyph } from "../../chrome/stamp.ts";
import { relativeAge } from "../../chrome/telemetry.ts";
import { keepInView } from "../overview/rows.tsx";
import {
  type ChangesFacts,
  foldedLine,
  type Liveness,
  parentLine,
  type SessionRow,
} from "./rows.ts";

export const livenessMarks: Readonly<Record<Liveness, string>> = {
  waiting: stampGlyph("needs-you"),
  working: "▓",
  idle: "░",
};

export interface SessionRowProps {
  row: SessionRow;
  name: string;
  liveness: Liveness;
  changes: ChangesFacts | undefined;
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
      ref={(row) => keepInView(row, () => props.cursor)}
      class="kw-tree-session"
      data-current={props.current ? "" : undefined}
      data-cursor={props.cursor ? "" : undefined}
    >
      <button type="button" class="kw-tree-row" onClick={() => props.onOpen()}>
        <span class="kw-tree-mark" aria-hidden="true" data-liveness={props.liveness}>
          {livenessMarks[props.liveness]}
        </span>
        <span class="kw-tree-title">
          <span class="kw-tree-name">{props.name}</span>
          <Show when={props.changes}>
            {(changes) => (
              <span class="kw-tree-changes">
                <span class="kw-tree-files">{changes().files} · </span>
                {changes().counts}
              </span>
            )}
          </Show>
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
      ref={(row) => keepInView(row, () => props.cursor)}
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
