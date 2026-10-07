import { type TreeRow, treeRows } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { z } from "zod";
import { relativeAge, sessionName } from "../../chrome/telemetry.ts";
import { formatCost } from "../../instruments/format.ts";
import { EmptyState } from "../empty-state.tsx";
import { definePane, type PaneProps, type ShellSeams } from "../registry.ts";
import "./tree.css";

const treeSpec = z.preprocess(
  (value) =>
    typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "sessions"
      ? { ...value, kind: "tree" }
      : value,
  z.object({ kind: z.literal("tree"), sessionId: z.string().optional() }),
);

export type TreeSpec = z.output<typeof treeSpec>;

export const treePane = definePane<TreeSpec>({
  kind: "tree",
  spec: treeSpec,
  home: "left",
  title: (spec, shell) =>
    spec.sessionId === undefined
      ? "sessions"
      : `tree · ${sessionName(shell.store.summary(spec.sessionId), shell.store.projection(spec.sessionId))}`,
  emptyState: (keys) => `no sessions yet · ${keys.chord("pane.split")} starts one`,
  component: TreeSlot,
  summon: {
    action: "tree.summon",
    chords: "leader t",
    help: "sessions and their trees",
    command: { name: "tree", description: "open the sessions pane", aliases: ["sessions"] },
    spec: () => ({ kind: "tree" }),
  },
  localActions: {
    "tree.down": {
      chords: ["j", "down"],
      help: "next row",
      command: { name: "tree-next", description: "move to the next session or entry" },
    },
    "tree.up": {
      chords: ["k", "up"],
      help: "previous row",
      command: { name: "tree-previous", description: "move to the previous session or entry" },
    },
    "tree.open": {
      chords: "enter",
      help: "open the session · fold a branch",
      command: { name: "tree-open", description: "open this session, or fold this branch" },
    },
    "tree.dive": {
      chords: "l",
      help: "into the session's tree · unfold",
      command: { name: "tree-dive", description: "show this session's entry tree" },
    },
    "tree.surface": {
      chords: "h",
      help: "fold · up to the parent",
      command: { name: "tree-surface", description: "fold this branch or move to its parent" },
    },
    "tree.fork": {
      chords: "f",
      help: "fork at this entry",
      command: { name: "fork", description: "start a new session from this entry" },
    },
    "tree.label": {
      chords: "shift+l",
      help: "label this entry",
      command: { name: "label", description: "name this entry so the tree shows it" },
    },
    "tree.refresh": {
      chords: "r",
      help: "refresh",
      command: { name: "tree-refresh", description: "reread the sessions or the tree" },
    },
    "tree.back": {
      chords: "escape",
      help: "back to the sessions",
      command: { name: "tree-back", description: "leave the entry tree for the sessions list" },
    },
  },
  onRestore: (spec, shell) => {
    if (spec.sessionId !== undefined) void shell.store.openTree(spec.sessionId);
  },
});

export function sessionsNewestFirst(summaries: readonly SessionSummary[]): SessionSummary[] {
  return [...summaries].sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}

export function costOf(summary: SessionSummary): string | undefined {
  return summary.costNanos === undefined ? undefined : formatCost(summary.costNanos / 1e9);
}

function TreeSlot(props: PaneProps<TreeSpec>) {
  return (
    <Show keyed when={props.spec.sessionId} fallback={<SessionsLevel {...props} />}>
      {(sessionId) => <EntriesLevel {...props} sessionId={sessionId} />}
    </Show>
  );
}

function SessionsLevel(props: PaneProps<TreeSpec>) {
  const [cursor, setCursor] = createSignal(0);
  const sessions = createMemo(() => sessionsNewestFirst(props.shell.store.state.summaries));
  const current = (): SessionSummary | undefined => sessions()[cursor()];
  const dive = (id: string): void => props.shell.rebind(props.id, { kind: "tree", sessionId: id });

  props.onAction((action) => {
    const chosen = current();
    switch (action) {
      case "tree.down":
        setCursor((at) => Math.min(at + 1, Math.max(sessions().length - 1, 0)));
        break;
      case "tree.up":
        setCursor((at) => Math.max(at - 1, 0));
        break;
      case "tree.open":
        if (chosen !== undefined) props.shell.sessions.openSession(chosen.id);
        break;
      case "tree.dive":
        if (chosen !== undefined) dive(chosen.id);
        break;
      case "tree.refresh":
        void props.shell.store.refresh();
        break;
    }
  });

  return (
    <aside class="kw-tree" aria-label="sessions">
      <div class="kw-tree-head">
        <button
          type="button"
          class="kw-tree-new"
          onClick={() => void props.shell.sessions.newSession()}
        >
          + new session
        </button>
      </div>
      <Show
        when={sessions().length > 0}
        fallback={<EmptyState line={treePane.emptyState(props.shell.keys)} />}
      >
        <ol class="kw-tree-list">
          <For each={sessions()}>
            {(item, index) => (
              <li
                class="kw-tree-session"
                data-current={item.id === props.shell.currentSession() ? "" : undefined}
                data-cursor={props.focused && index() === cursor() ? "" : undefined}
              >
                <button
                  type="button"
                  class="kw-tree-row"
                  onClick={() => {
                    setCursor(index());
                    props.shell.sessions.openSession(item.id);
                  }}
                >
                  <span class="kw-tree-mark" aria-hidden="true">
                    {livenessMark(item.id, props.shell)}
                  </span>
                  <span class="kw-tree-name">
                    {sessionName(item, props.shell.store.state.projections[item.id])}
                  </span>
                  <span class="kw-tree-cost">{costOf(item)}</span>
                  <span class="kw-tree-age">{relativeAge(item.lastActivityAt)}</span>
                </button>
                <button
                  type="button"
                  class="kw-tree-dive"
                  aria-label={`tree of ${item.title}`}
                  onClick={() => dive(item.id)}
                >
                  ›
                </button>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </aside>
  );
}

function EntriesLevel(props: PaneProps<TreeSpec> & { sessionId: string }) {
  const [cursor, setCursor] = createSignal<string>();
  const [folded, setFolded] = createSignal<ReadonlySet<string>>(new Set());
  const [labelDraft, setLabelDraft] = createSignal<string>();
  const tree = () => props.shell.store.tree(props.sessionId);
  const rows = createMemo((): TreeRow[] => {
    const snapshot = tree().snapshot;
    return snapshot === undefined ? [] : treeRows(snapshot, folded());
  });
  const at = (): number => rows().findIndex((row) => row.id === cursor());
  const row = (): TreeRow | undefined => rows()[at()];
  const back = (): void => props.shell.rebind(props.id, { kind: "tree" });
  const move = (step: number): void => {
    const next = rows()[Math.min(Math.max(at() + step, 0), rows().length - 1)];
    if (next !== undefined) setCursor(next.id);
  };
  const toggleFold = (id: string): void => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const fork = async (): Promise<void> => {
    const target = row();
    if (target === undefined) return;
    const forked = await props.shell.store.fork(props.sessionId, target.id);
    if (typeof forked !== "string") props.shell.sessions.openSession(forked.id);
  };
  const commitLabel = (): void => {
    const target = row();
    const label = (labelDraft() ?? "").trim();
    setLabelDraft(undefined);
    if (target !== undefined) {
      void props.shell.store.label(props.sessionId, target.id, label === "" ? null : label);
    }
  };

  createEffect(() => {
    void props.shell.store.openTree(props.sessionId);
  });
  createEffect(() => {
    const leaf = tree().snapshot?.leafId;
    if (cursor() === undefined && leaf !== undefined) setCursor(leaf ?? rows()[0]?.id);
  });

  const surface = (): void => {
    const target = row();
    if (target === undefined) return;
    if (target.hasChildren && !target.folded) toggleFold(target.id);
    else if (target.parentId !== null) setCursor(target.parentId);
  };

  props.onAction((action) => {
    if (labelDraft() !== undefined) return;
    const target = row();
    switch (action) {
      case "tree.down":
        move(1);
        break;
      case "tree.up":
        move(-1);
        break;
      case "tree.open":
        if (target?.hasChildren) toggleFold(target.id);
        break;
      case "tree.dive":
        if (target?.folded) toggleFold(target.id);
        break;
      case "tree.surface":
        surface();
        break;
      case "tree.fork":
        void fork();
        break;
      case "tree.label":
        if (target !== undefined) setLabelDraft(target.label ?? "");
        break;
      case "tree.refresh":
        void props.shell.store.openTree(props.sessionId, { force: true });
        break;
      case "tree.back":
        back();
        break;
    }
  });

  return (
    <section class="kw-tree" aria-label="entry tree">
      <div class="kw-tree-head">
        <button type="button" class="kw-tree-back" onClick={back}>
          ‹ sessions
        </button>
        <span class="kw-tree-session-name">
          {sessionName(
            props.shell.store.summary(props.sessionId),
            props.shell.store.projection(props.sessionId),
          )}
        </span>
      </div>
      <Show
        when={rows().length > 0}
        fallback={
          <EmptyState
            line={
              tree().snapshot === undefined
                ? "reading the tree…"
                : `nothing here yet · ${props.shell.keys.chord("tree.back")} goes back`
            }
          />
        }
      >
        <ol class="kw-tree-list" data-stale={tree().stale ? "" : undefined}>
          <For each={rows()}>
            {(entry) => (
              <li
                class="kw-tree-entry"
                style={{ "--kw-tree-depth": String(entry.depth) }}
                data-active={entry.onActivePath ? "" : undefined}
                data-leaf={entry.isLeaf ? "" : undefined}
                data-cursor={props.focused && entry.id === cursor() ? "" : undefined}
              >
                <button
                  type="button"
                  class="kw-tree-row"
                  onClick={() => {
                    setCursor(entry.id);
                    if (entry.hasChildren) toggleFold(entry.id);
                  }}
                >
                  <span class="kw-tree-fold" aria-hidden="true">
                    {foldStamp(entry)}
                  </span>
                  <span class="kw-tree-text">{entry.text}</span>
                  <Show when={entry.label !== undefined && entry.id !== cursor()}>
                    <span class="kw-tree-label">{entry.label}</span>
                  </Show>
                  <Show when={entry.label !== undefined && entry.id === cursor()}>
                    <Show when={labelDraft() === undefined}>
                      <span class="kw-tree-label">{entry.label}</span>
                    </Show>
                  </Show>
                  <Show when={entry.isLeaf}>
                    <span class="kw-tree-leaf-mark">leaf</span>
                  </Show>
                </button>
                <Show when={entry.id === cursor() && labelDraft() !== undefined}>
                  <input
                    class="kw-tree-label-input"
                    aria-label="label"
                    value={labelDraft() ?? ""}
                    ref={(input) => queueMicrotask(() => input.focus())}
                    onInput={(event) => setLabelDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitLabel();
                      if (event.key === "Escape") setLabelDraft(undefined);
                    }}
                  />
                </Show>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  );
}

function livenessMark(sessionId: string, shell: ShellSeams): string {
  return shell.store.state.projections[sessionId]?.turn !== undefined ? "▓" : "░";
}

function foldStamp(row: TreeRow): string {
  if (!row.hasChildren) return row.branchPoint ? "▸" : " ";
  return row.folded ? "▸" : row.branchPoint ? "▾" : "│";
}
