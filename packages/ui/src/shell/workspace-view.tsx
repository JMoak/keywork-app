import { emptyProjection, type SessionProjection } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import { createSignal, For, Show } from "solid-js";
import { relativeAge, sessionName, telemetry } from "../chrome/telemetry.ts";
import { Composer } from "../composer/composer.tsx";
import { ConversationPane } from "../page/pane.tsx";
import type { SessionStore } from "./session-store.ts";

export interface WorkspaceViewProps {
  workspace: string;
  serverLabel: string;
  store: SessionStore;
  current: string | undefined;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function WorkspaceView(props: WorkspaceViewProps) {
  const projection = (): SessionProjection =>
    props.current === undefined
      ? emptyProjection
      : (props.store.state.projections[props.current] ?? emptyProjection);
  const summary = (): SessionSummary | undefined =>
    props.store.state.summaries.find((item) => item.id === props.current);
  const live = () => projection().turn !== undefined;
  const send = (text: string): void => {
    if (props.current !== undefined) void props.store.prompt(props.current, text);
  };
  const interrupt = (): void => {
    if (props.current !== undefined) void props.store.abort(props.current);
  };
  return (
    <div class="kw-shell">
      <aside class="kw-sessions" aria-label="sessions">
        <div class="kw-sessions-head">
          <span class="kw-sessions-title">sessions</span>
          <button type="button" class="kw-sessions-new" onClick={() => props.onCreate()}>
            new
          </button>
        </div>
        <Show
          when={props.store.state.summaries.length > 0}
          fallback={<p class="kw-empty">no sessions yet · new starts one</p>}
        >
          <ol class="kw-session-list">
            <For each={props.store.state.summaries}>
              {(item) => (
                <SessionRow
                  summary={item}
                  projection={props.store.state.projections[item.id]}
                  current={item.id === props.current}
                  onSelect={() => props.onSelect(item.id)}
                />
              )}
            </For>
          </ol>
        </Show>
      </aside>
      <section class="kw-main">
        <div class="kw-title">
          <span class="kw-title-stamp" data-live={live() ? "" : undefined} aria-hidden="true">
            {live() ? "▌" : " "}
          </span>
          <span class="kw-title-name">{sessionName(summary(), projection())}</span>
          <span class="kw-title-telemetry">{telemetry(projection())}</span>
        </div>
        <div class="kw-page">
          <Show
            when={props.current !== undefined}
            fallback={<p class="kw-empty">pick a session on the left, or start a new one</p>}
          >
            <ConversationPane projection={projection()} />
          </Show>
        </div>
        <Composer
          queue={projection().queue}
          busy={live()}
          onSteer={send}
          onQueue={send}
          onInterrupt={interrupt}
        />
        <StatusLine
          serverLabel={props.serverLabel}
          projection={projection()}
          gap={props.store.state.gap}
          lost={props.store.state.lost}
        />
      </section>
    </div>
  );
}

interface SessionRowProps {
  summary: SessionSummary;
  projection: SessionProjection | undefined;
  current: boolean;
  onSelect: () => void;
}

function SessionRow(props: SessionRowProps) {
  const mark = () => (props.projection?.turn !== undefined ? "▓" : "░");
  return (
    <li class="kw-session-row" data-current={props.current ? "" : undefined}>
      <button type="button" class="kw-session-button" onClick={() => props.onSelect()}>
        <span class="kw-session-mark" aria-hidden="true">
          {mark()}
        </span>
        <span class="kw-session-name">{sessionName(props.summary, props.projection)}</span>
        <span class="kw-session-age">{relativeAge(props.summary.lastActivityAt)}</span>
      </button>
    </li>
  );
}

interface StatusLineProps {
  serverLabel: string;
  projection: SessionProjection;
  gap: { from: number; to: number } | undefined;
  lost: string | undefined;
}

function StatusLine(props: StatusLineProps) {
  const [dismissed, setDismissed] = createSignal(false);
  const items = () =>
    [
      "keywork",
      props.serverLabel,
      props.projection.preset,
      props.projection.mode,
      telemetry(props.projection),
    ].filter((item): item is string => item !== undefined && item !== "");
  return (
    <footer class="kw-status" data-lost={props.lost !== undefined ? "" : undefined}>
      <span class="kw-status-items">{items().join(" · ")}</span>
      <Show when={props.lost}>{(reason) => <span class="kw-status-lost">{reason()}</span>}</Show>
      <Show when={props.gap !== undefined && !dismissed()}>
        <button type="button" class="kw-status-gap" onClick={() => setDismissed(true)}>
          events {props.gap?.from} to {props.gap?.to} were missed while disconnected
        </button>
      </Show>
    </footer>
  );
}
