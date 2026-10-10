import {
  type ArcCloseOutcome,
  type ArcSummary,
  isSurfaceRefusal,
  type SessionSummary,
} from "@keywork-app/protocol";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { z } from "zod";
import { hueStop } from "../../chrome/pane-frame.tsx";
import { relativeAge, sessionName } from "../../chrome/telemetry.ts";
import { EmptyState } from "../empty-state.tsx";
import {
  ConfirmLine,
  createCursor,
  DraftLine,
  NoticeLine,
  OverviewRow,
} from "../overview/rows.tsx";
import { definePane, type KeyHints, type PaneProps, type ShellSeams } from "../registry.ts";

const arcsSpec = z.object({ kind: z.literal("arcs") });

export type ArcsSpec = z.output<typeof arcsSpec>;

export const unboundGroup = "unbound";

export const arcsPane = definePane<ArcsSpec>({
  kind: "arcs",
  spec: arcsSpec,
  home: "left",
  title: () => "arcs",
  emptyState: (keys) => `no arcs yet · n opens one · ${keys.chord("arcs.summon")} is this pane`,
  component: ArcsList,
  summon: {
    action: "arcs.summon",
    chords: "leader a",
    help: "arcs pane",
    command: { name: "arcs", description: "open the arcs pane" },
    spec: () => ({ kind: "arcs" }),
  },
  localActions: {
    "arcs.down": {
      chords: ["j", "down"],
      help: "next row",
      command: { name: "arcs-next", description: "move to the next arc or session" },
    },
    "arcs.up": {
      chords: ["k", "up"],
      help: "previous row",
      command: { name: "arcs-previous", description: "move to the previous arc or session" },
    },
    "arcs.open": {
      chords: "enter",
      help: "show the arc's sessions · open a session",
      command: {
        name: "arcs-open",
        description: "unfold this arc's sessions, or open this session",
      },
    },
    "arcs.new": {
      chords: "n",
      help: "open a new arc",
      command: { name: "arc-new", description: "open a new arc" },
    },
    "arcs.close": {
      chords: "c",
      help: "close the arc through the airlock",
      command: { name: "arc-close", description: "close this arc through the airlock" },
    },
    "arcs.abandon": {
      chords: "shift+a",
      help: "abandon the arc (confirm)",
      command: { name: "arc-abandon", description: "archive this arc without distilling" },
    },
    "arcs.bind": {
      chords: "b",
      help: "bind the current session to the arc",
      command: { name: "arc-bind", description: "bind the focused session to this arc" },
    },
    "arcs.release": {
      chords: "u",
      help: "release the current session from its arc",
      command: { name: "arc-release", description: "release the focused session from its arc" },
    },
  },
});

export type ArcRow =
  | { kind: "arc"; arc: ArcSummary; ordinal: number | undefined; open: boolean }
  | { kind: "group"; open: boolean; count: number }
  | { kind: "session"; summary: SessionSummary };

export function arcRows(
  arcs: readonly ArcSummary[],
  ordinals: Readonly<Record<string, number>>,
  summaries: readonly SessionSummary[],
  opened: ReadonlySet<string>,
): ArcRow[] {
  const under = (slug: string | undefined): ArcRow[] =>
    summaries
      .filter((summary) => summary.arc === slug)
      .map((summary): ArcRow => ({ kind: "session", summary }));
  const rows = arcs.flatMap((arc): ArcRow[] => {
    const open = opened.has(arc.slug);
    return [
      { kind: "arc", arc, ordinal: ordinals[arc.slug], open },
      ...(open ? under(arc.slug) : []),
    ];
  });
  const unbound = under(undefined);
  if (unbound.length === 0) return rows;
  const open = opened.has(unboundGroup);
  return [...rows, { kind: "group", open, count: unbound.length }, ...(open ? unbound : [])];
}

export function closeOutcomeLine(slug: string, outcome: ArcCloseOutcome, keys: KeyHints): string {
  const notice = outcome.notice === undefined ? "" : ` · ${outcome.notice}`;
  if (outcome.kind === "closed") {
    return `${slug} closed · ${outcome.delivered} delivered · ${outcome.released} released${notice}`;
  }
  const waiting = [
    `${outcome.candidates} ${outcome.candidates === 1 ? "candidate" : "candidates"}`,
    `${outcome.questions} ${outcome.questions === 1 ? "question" : "questions"}`,
    ...(outcome.wedged > 0 ? [`${outcome.wedged} wedged`] : []),
  ].join(", ");
  return `${slug} pending · ${waiting} wait for review · ${keys.chord("memory.summon")} opens the memory pane${notice}`;
}

export function arcHueStyle(ordinal: number | undefined): Record<string, string> {
  return ordinal === undefined ? {} : { "--kw-arc-hue": `var(--kw-ramp-${hueStop(ordinal)})` };
}

type Prompt = { kind: "name" } | { kind: "abandon"; slug: string };

function ArcsList(props: PaneProps<ArcsSpec>) {
  const surfaces = () => props.shell.store.surfaces;
  const [opened, setOpened] = createSignal<ReadonlySet<string>>(new Set());
  const [prompt, setPrompt] = createSignal<Prompt>();
  const [notice, setNotice] = createSignal<string>();
  const rows = createMemo(() =>
    arcRows(
      surfaces().state.arcs,
      surfaces().state.ordinals,
      props.shell.store.state.summaries,
      opened(),
    ),
  );
  const cursor = createCursor(() => rows().length);
  const atCursor = (): ArcRow | undefined => rows()[cursor.index()];
  const arcAtCursor = (): ArcSummary | undefined => {
    const row = atCursor();
    return row?.kind === "arc" ? row.arc : undefined;
  };

  const naming = (): boolean => prompt()?.kind === "name";
  const abandoning = (): string | undefined => {
    const pending = prompt();
    return pending?.kind === "abandon" ? pending.slug : undefined;
  };

  const toggle = (key: string): void => {
    setOpened((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const open = (row: ArcRow | undefined): void => {
    if (row === undefined) return;
    if (row.kind === "session") props.shell.sessions.openSession(row.summary.id);
    else toggle(row.kind === "arc" ? row.arc.slug : unboundGroup);
  };

  const create = async (slug: string): Promise<void> => {
    setPrompt(undefined);
    const created = await surfaces().verbs.createArc(slug === "" ? undefined : slug);
    setNotice(isSurfaceRefusal(created) ? created.detail : `${created.slug} opened`);
    await surfaces().refetch("arcs");
  };

  const close = async (arc: ArcSummary): Promise<void> => {
    const outcome = await surfaces().verbs.closeArc(arc.slug);
    setNotice(
      isSurfaceRefusal(outcome)
        ? outcome.detail
        : closeOutcomeLine(arc.slug, outcome, props.shell.keys),
    );
    await surfaces().refetch("arcs");
  };

  const abandon = async (slug: string): Promise<void> => {
    setPrompt(undefined);
    const outcome = await surfaces().verbs.abandonArc(slug);
    setNotice(isSurfaceRefusal(outcome) ? outcome.detail : `${slug} abandoned`);
    await surfaces().refetch("arcs");
  };

  const bind = async (slug: string | null): Promise<void> => {
    const sessionId = props.shell.currentSession();
    if (sessionId === undefined) {
      setNotice("no session is focused · focus a conversation pane first");
      return;
    }
    const outcome = await surfaces().verbs.bindSessionArc(sessionId, slug);
    setNotice(
      isSurfaceRefusal(outcome)
        ? outcome.detail
        : slug === null
          ? "session released from its arc"
          : `session bound to ${slug}`,
    );
    await props.shell.store.refresh();
    await surfaces().refetch("arcs");
  };

  props.onAction((action) => {
    if (prompt() !== undefined) {
      setPrompt(undefined);
      return;
    }
    const arc = arcAtCursor();
    switch (action) {
      case "arcs.down":
        return cursor.move(1);
      case "arcs.up":
        return cursor.move(-1);
      case "arcs.open":
        return open(atCursor());
      case "arcs.new":
        return setPrompt({ kind: "name" });
      case "arcs.close":
        if (arc !== undefined) void close(arc);
        return;
      case "arcs.abandon":
        if (arc !== undefined) setPrompt({ kind: "abandon", slug: arc.slug });
        return;
      case "arcs.bind":
        if (arc !== undefined) void bind(arc.slug);
        return;
      case "arcs.release":
        return void bind(null);
    }
  });

  return (
    <section class="kw-ov kw-arcs" aria-label="arcs">
      <div class="kw-ov-head">
        <button type="button" class="kw-ov-new" onClick={() => setPrompt({ kind: "name" })}>
          + new arc
        </button>
        <span class="kw-ov-head-detail">{activeCount(surfaces().state.arcs)}</span>
      </div>
      <Switch>
        <Match when={surfaces().state.notices.arcs}>{(text) => <EmptyState line={text()} />}</Match>
        <Match when={rows().length === 0}>
          <EmptyState line={arcsPane.emptyState(props.shell.keys)} />
        </Match>
        <Match when={rows().length > 0}>
          <ol class="kw-ov-list">
            <For each={rows()}>
              {(row, index) => (
                <ArcRowView
                  row={row}
                  cursor={index() === cursor.index()}
                  shell={props.shell}
                  onClick={() => {
                    cursor.set(index());
                    open(row);
                  }}
                />
              )}
            </For>
          </ol>
        </Match>
      </Switch>
      <Show when={naming()}>
        <DraftLine
          label="arc slug"
          placeholder="blank lets the server pick arc-<n>"
          onSubmit={(slug) => void create(slug)}
          onCancel={() => setPrompt(undefined)}
        />
      </Show>
      <Show when={abandoning()}>
        {(slug) => (
          <ConfirmLine
            question={`abandon ${slug()} without distilling?`}
            onConfirm={() => void abandon(slug())}
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <NoticeLine text={notice()} />
    </section>
  );
}

interface ArcRowViewProps {
  row: ArcRow;
  cursor: boolean;
  shell: ShellSeams;
  onClick(): void;
}

function ArcRowView(props: ArcRowViewProps) {
  return (
    <Switch>
      <Match when={props.row.kind === "arc" ? props.row : undefined}>
        {(row) => (
          <OverviewRow
            cursor={props.cursor}
            muted={row().arc.status === "archived"}
            mark={row().open ? "▾" : "▸"}
            density="light"
            aside={arcAside(row().arc)}
            onClick={() => props.onClick()}
          >
            <span class="kw-ov-chip" aria-hidden="true" style={arcHueStyle(row().ordinal)} />
            {row().arc.slug}
          </OverviewRow>
        )}
      </Match>
      <Match when={props.row.kind === "group" ? props.row : undefined}>
        {(row) => (
          <OverviewRow
            cursor={props.cursor}
            muted
            mark={row().open ? "▾" : "▸"}
            density="light"
            aside={`${row().count} ${row().count === 1 ? "session" : "sessions"}`}
            onClick={() => props.onClick()}
          >
            {unboundGroup}
          </OverviewRow>
        )}
      </Match>
      <Match when={props.row.kind === "session" ? props.row : undefined}>
        {(row) => (
          <OverviewRow
            cursor={props.cursor}
            indent
            mark={props.shell.store.projection(row().summary.id).turn === undefined ? "░" : "▓"}
            aside={relativeAge(row().summary.lastActivityAt)}
            onClick={() => props.onClick()}
          >
            {sessionName(row().summary, props.shell.store.projection(row().summary.id))}
          </OverviewRow>
        )}
      </Match>
    </Switch>
  );
}

function arcAside(arc: ArcSummary): string {
  const sessions = `${arc.sessions} ${arc.sessions === 1 ? "session" : "sessions"}`;
  return arc.status === "archived"
    ? `archived · ${sessions}`
    : `${sessions} · ${relativeAge(arc.created)}`;
}

function activeCount(arcs: readonly ArcSummary[]): string {
  const active = arcs.filter((arc) => arc.status === "active").length;
  return `${active} active · b binds · c closes`;
}
