import type { SessionProjection } from "@keywork-app/client";
import { For, Show } from "solid-js";
import "./status-line.css";

export interface StatusLineProps {
  serverLabel: string;
  projection: SessionProjection;
  usage: string;
  preset: string | undefined;
  trust: string | undefined;
  leader: string | undefined;
  notice: string | undefined;
  gap: { from: number; to: number } | undefined;
  lost: string | undefined;
}

export type StatusTone = "mark" | "where" | "warn" | "word" | "quiet";

export interface StatusItem {
  readonly tone: StatusTone;
  readonly text: string;
}

export function statusItems(props: StatusLineProps): StatusItem[] {
  const candidates: { tone: StatusTone; text: string | undefined }[] = [
    { tone: "mark", text: "keywork" },
    { tone: "where", text: props.serverLabel },
    { tone: "warn", text: props.trust },
    { tone: "word", text: props.preset },
    { tone: "word", text: props.projection.mode },
    { tone: "quiet", text: props.usage },
  ];
  return candidates.filter(
    (item): item is StatusItem => item.text !== undefined && item.text !== "",
  );
}

export function StatusLine(props: StatusLineProps) {
  return (
    <footer class="kw-status" data-lost={props.lost !== undefined ? "" : undefined}>
      <span class="kw-status-items">
        <For each={statusItems(props)}>
          {(item) => (
            <span class="kw-status-item" data-tone={item.tone}>
              {item.text}
            </span>
          )}
        </For>
      </span>
      <span class="kw-status-moment">
        <Show when={props.leader}>
          {(leader) => <kbd class="kw-status-leader">{leader()} …</kbd>}
        </Show>
        <Show when={props.notice}>{(text) => <span class="kw-status-notice">{text()}</span>}</Show>
        <Show when={props.lost}>{(reason) => <span class="kw-status-lost">{reason()}</span>}</Show>
        <Show when={props.gap}>
          {(gap) => (
            <span class="kw-status-gap">
              events {gap().from} to {gap().to} were missed while disconnected
            </span>
          )}
        </Show>
      </span>
    </footer>
  );
}
