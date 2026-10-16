import type { ContextReport } from "@keywork-app/protocol";
import { createEffect, createSignal, Index, on, Show } from "solid-js";
import { z } from "zod";
import { sessionName } from "../../chrome/telemetry.ts";
import { sessionContextLevel } from "../../instruments/context.ts";
import {
  basisLine,
  fenceRows,
  type LegendRow,
  legendRows,
  type MapCell,
  mapCells,
  mapColumns,
  mapHead,
  mapReadout,
  mapRows,
  pastWindowLine,
} from "../../instruments/context-map.ts";
import { formatTokens } from "../../instruments/format.ts";
import {
  compactingNotice,
  compactNotice,
  isSettled,
  refusalNotice,
} from "../conversation/controls.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { NoticeLine } from "../overview/rows.tsx";
import { definePane, type PaneProps } from "../registry.ts";
import "../overview/overview.css";
import "./context.css";

const contextSpec = z.object({
  kind: z.literal("context"),
  sessionId: z.string().optional(),
});

export type ContextSpec = z.output<typeof contextSpec>;

export const contextHints = "c compacts now · f says when memory flushes · esc closes";

export const unreadLine = "no reading of this window yet";

export const noSessionNotice = "no session here · focus a conversation first";

export const contextPane = definePane<ContextSpec>({
  kind: "context",
  spec: contextSpec,
  home: "right",
  attire: "work",
  title: () => "context",
  emptyState: (keys) =>
    `no session to map · focus a session, or ${keys.chord("tree.summon")} picks one`,
  component: ContextSlot,
  summon: {
    action: "context.summon",
    chords: "leader shift+g",
    help: "context map",
    command: {
      name: "context",
      description: "map what fills the focused session's context window",
      aliases: ["context-map"],
    },
    spec: (shell) => ({ kind: "context", sessionId: shell.currentSession() }),
  },
  localActions: {
    "context.compact": {
      chords: "c",
      help: "compact now",
      command: { name: "context-compact", description: "compact the mapped session now" },
    },
    "context.flush": {
      chords: "f",
      help: "when memory flushes",
      command: {
        name: "context-flush",
        description: "say where keywork flushes the mapped session's memory",
      },
    },
    "context.close": {
      chords: "escape",
      help: "close the context map",
      command: { name: "context-close", description: "close the context map" },
    },
  },
  adornments: (spec, shell) => ({
    context: sessionContextLevel(
      shell.store.controls.readings(spec.sessionId).context,
      shell.store.projection(spec.sessionId).usage,
    ),
  }),
  onRestore: (spec, shell) => {
    if (spec.sessionId !== undefined) void shell.store.controls.watchReadings(spec.sessionId);
  },
});

export function flushNotice(report: ContextReport | undefined): string {
  const line = report === undefined ? "the flush line" : formatTokens(report.thresholds.flushAt);
  return `memory flushes when a turn settles past ${line} · keywork has no route to flush now`;
}

export interface ContextMapProps {
  report: ContextReport;
  session: string;
}

export function ContextMap(props: ContextMapProps) {
  return (
    <>
      <header class="kw-ov-head">
        <span class="kw-ov-head-lead">{props.session}</span>
        <span class="kw-context-map-total">{mapHead(props.report)}</span>
      </header>
      <div class="kw-context-map-body">
        <div
          class="kw-context-map-grid"
          role="img"
          aria-label={mapReadout(props.report)}
          style={{
            "--kw-map-columns": String(mapColumns(props.report.window)),
            "--kw-map-rows": String(mapRows),
          }}
        >
          <Index each={mapCells(props.report)}>{(cell) => <Ink cell={cell()} />}</Index>
        </div>
        <ol class="kw-context-map-legend">
          <Index each={[...legendRows(props.report), ...fenceRows(props.report)]}>
            {(row) => <Legend row={row()} />}
          </Index>
        </ol>
      </div>
      <p class="kw-context-map-basis">{basisLine(props.report)}</p>
      <Show when={pastWindowLine(props.report)}>
        {(line) => <p class="kw-context-map-finding">{line()}</p>}
      </Show>
    </>
  );
}

type Say = (line: string | undefined) => void;

function ContextSlot(props: PaneProps<ContextSpec>) {
  const [notice, setNotice] = createSignal<string>();
  const report = (): ContextReport | undefined =>
    props.shell.store.controls.readings(props.spec.sessionId).context;
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  followTheFocusedConversation(props);
  createEffect(
    on(
      () => props.spec.sessionId,
      (id) => {
        setNotice(undefined);
        if (id !== undefined) void props.shell.store.controls.watchReadings(id);
      },
    ),
  );
  const keys = contextKeys(props, report, setNotice);
  props.onAction((action) => keys[action]?.());

  return (
    <section class="kw-ov kw-context-map" aria-label="context map" tabIndex={-1} ref={root}>
      <Show
        when={props.spec.sessionId}
        fallback={<EmptyState line={contextPane.emptyState(props.shell.keys)} />}
      >
        {(id) => (
          <Show when={report()} fallback={<EmptyState line={unreadLine} />}>
            {(reading) => (
              <ContextMap
                report={reading()}
                session={sessionName(
                  props.shell.store.summary(id()),
                  props.shell.store.projection(id()),
                )}
              />
            )}
          </Show>
        )}
      </Show>
      <NoticeLine text={notice()} />
      <p class="kw-ov-line">{contextHints}</p>
    </section>
  );
}

function followTheFocusedConversation(props: PaneProps<ContextSpec>): void {
  createEffect(() => {
    const focused = props.shell.currentSession();
    if (focused === undefined || focused === props.spec.sessionId) return;
    props.shell.rebind(props.id, { kind: "context", sessionId: focused });
  });
}

function contextKeys(
  props: PaneProps<ContextSpec>,
  report: () => ContextReport | undefined,
  say: Say,
): Record<string, () => void> {
  const verbs = props.shell.store.controls;
  const withSession = (run: (id: string) => Promise<void>) => (): void => {
    const id = props.spec.sessionId;
    if (id === undefined) say(noSessionNotice);
    else void run(id);
  };
  return {
    "context.compact": withSession(async (id) => {
      say(compactingNotice);
      const reading = await verbs.compact(id);
      if (!isSettled(reading)) return say(refusalNotice(reading));
      say(compactNotice(reading));
      await verbs.watchReadings(id);
    }),
    "context.flush": () => say(flushNotice(report())),
    "context.close": () => props.shell.closePane?.(props.id),
  };
}

function Ink(props: { cell: MapCell }) {
  return <span class="kw-context-map-ink" data-cell={props.cell} aria-hidden="true" />;
}

function Legend(props: { row: LegendRow }) {
  return (
    <li class="kw-context-map-row" data-cell={props.row.cell}>
      <Ink cell={props.row.cell} />
      <span class="kw-context-map-label">{props.row.label}</span>
      <span class="kw-context-map-tokens">{props.row.tokens}</span>
      <span class="kw-context-map-share">{props.row.share}</span>
    </li>
  );
}
