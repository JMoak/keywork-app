import { type ChildLineage, type TreeRow, treeRows } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, For, Index, Match, Show, Switch } from "solid-js";
import { z } from "zod";
import { botNamed } from "../../chrome/identity.ts";
import { sessionName } from "../../chrome/session-name.ts";
import { relativeAge } from "../../chrome/telemetry.ts";
import { formatCost } from "../../instruments/format.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { ConfirmLine, createFleetingNotice, keepInView, NoticeLine } from "../overview/rows.tsx";
import { definePane, type PaneProps, type ShellSeams } from "../registry.ts";
import { arcWears } from "../themes/targets.ts";
import { alreadyTheLeafNotice, entriesFirstNotice, leafNotice } from "./leaf.ts";
import {
  type ChildRow,
  changesFacts,
  distinctNames,
  livenessOf,
  type SessionRow,
  type SessionsRow,
  sessionIdOf,
  sessionsRows,
} from "./rows.ts";
import { ChildRowView, SessionRowView } from "./session-rows.tsx";
import {
  alreadyEmptyNotice,
  discardNotice,
  emptyTrashLine,
  intentFor,
  type PendingTrash,
  purgeIntent,
  purgeNotice,
  removalNotice,
  restoreNotice,
  type TrashIntent,
  trashHeading,
  trashQuestion,
} from "./trash.ts";
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
  attire: "house",
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
    "tree.leaf": {
      chords: "c",
      help: "continue from this entry",
      command: {
        name: "continue-here",
        description: "move the session's leaf here so the next prompt continues from this entry",
      },
    },
    "tree.remove": {
      chords: "x",
      help: "move this session to the trash",
      command: { name: "remove-session", description: "move the selected session to the trash" },
    },
    "tree.trash": {
      chords: "shift+x",
      help: "show the trash · enter restores",
      command: { name: "trash", description: "show trashed sessions, where enter restores" },
    },
    "tree.discard": {
      chords: "d",
      help: "delete a trashed session for good",
      command: { name: "discard-session", description: "delete the selected trashed session" },
    },
    "tree.purge": {
      chords: "shift+d",
      help: "empty the trash for good",
      command: { name: "empty-trash", description: "delete every trashed session for good" },
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

export function sessionsNewestFirst<Summary extends SessionSummary>(
  summaries: readonly Summary[],
): Summary[] {
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
  const [showTrash, setShowTrash] = createSignal(false);
  const [folded, setFolded] = createSignal<ReadonlySet<string>>(new Set());
  const [pending, setPending] = createSignal<PendingTrash>();
  const notice = createFleetingNotice();
  const setNotice = notice.say;
  const store = props.shell.store;
  const keys = props.shell.keys;
  const sessions = createMemo(() => sessionsNewestFirst(store.state.summaries));
  const trash = () => store.state.trash;
  const toldName = (summary: SessionSummary): string =>
    sessionName(summary, store.state.projections[summary.id]);
  const listedNames = createMemo(() =>
    distinctNames(
      sessions().map((summary) => ({
        id: summary.id,
        name: toldName(summary),
        createdAt: summary.createdAt,
      })),
    ),
  );
  const nameOf = (summary: SessionSummary): string =>
    listedNames().get(summary.id) ?? toldName(summary);
  const knownName = (id: string): string | undefined => {
    const summary = trash().find((item) => item.id === id) ?? store.summary(id);
    return summary === undefined ? undefined : nameOf(summary);
  };
  const childName = (child: ChildLineage): string => knownName(child.sessionId) ?? child.title;
  const rowName = (row: SessionsRow): string =>
    row.kind === "child" ? childName(row.child) : nameOf(row.summary);
  const rows = createMemo(() =>
    sessionsRows({
      sessions: sessions(),
      trash: trash(),
      showTrash: showTrash(),
      folded: folded(),
      children: (parentId) => store.children(parentId),
      childOf: (id) => store.childOf(id),
      trashed: (id) => store.trashed(id),
      nameOf: knownName,
    }),
  );
  const liveRows = createMemo(() => rows().filter((row) => row.kind !== "trashed"));
  const at = (): number => Math.min(cursor(), Math.max(rows().length - 1, 0));
  const current = (): SessionsRow | undefined => rows()[at()];
  const dive = (id: string): void => props.shell.rebind(props.id, { kind: "tree", sessionId: id });
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused && pending() === undefined,
  );

  const ask = (intent: TrashIntent): void => {
    setNotice(undefined);
    setPending(intentFor(current(), intent, rowName));
  };
  const toggleTrash = (): void => {
    setShowTrash((shown) => !shown);
    if (showTrash()) void store.openTrash();
  };
  const toggleFold = (parentId: string): void => {
    setFolded((shut) => toggled(shut, parentId));
  };
  const open = (row: SessionsRow): void => {
    if (row.kind === "trashed") ask("restore");
    else props.shell.sessions.openSession(sessionIdOf(row));
  };
  const unfoldOrDive = (row: SessionsRow): void => {
    if (row.kind === "session" && row.folded) toggleFold(row.summary.id);
    else if (row.kind !== "trashed") dive(sessionIdOf(row));
  };
  const foldOrSurface = (row: SessionsRow): void => {
    if (row.kind === "session" && row.children > 0 && !row.folded) toggleFold(row.summary.id);
    if (row.kind === "child") setCursor(rows().findIndex((above) => isParentOf(above, row)));
  };
  const askPurge = async (): Promise<void> => {
    setNotice(undefined);
    setShowTrash(true);
    await store.openTrash();
    const asked = purgeIntent(trash());
    if (asked === undefined) setNotice(alreadyEmptyNotice);
    else setPending(asked);
  };
  const settledLine = async (asked: PendingTrash): Promise<string> => {
    switch (asked.intent) {
      case "remove":
        return removalNotice(
          await store.remove(asked.sessionId),
          asked.name,
          keys.chord("tree.trash"),
        );
      case "restore":
        return restoreNotice(await store.restore(asked.sessionId), asked.name);
      case "discard":
        return discardNotice(await store.discard(asked.sessionId), asked.name);
      case "purge":
        return purgeNotice(await store.purge());
    }
  };
  const settle = async (asked: PendingTrash): Promise<void> => {
    setPending(undefined);
    setNotice(await settledLine(asked));
  };

  props.onAction((action) => {
    const chosen = current();
    switch (action) {
      case "tree.down":
        setCursor(Math.min(at() + 1, Math.max(rows().length - 1, 0)));
        break;
      case "tree.up":
        setCursor(Math.max(at() - 1, 0));
        break;
      case "tree.open":
        if (chosen !== undefined) open(chosen);
        break;
      case "tree.dive":
        if (chosen !== undefined) unfoldOrDive(chosen);
        break;
      case "tree.surface":
        if (chosen !== undefined) foldOrSurface(chosen);
        break;
      case "tree.remove":
        ask("remove");
        break;
      case "tree.trash":
        toggleTrash();
        break;
      case "tree.discard":
        ask("discard");
        break;
      case "tree.purge":
        void askPurge();
        break;
      case "tree.refresh":
        void store.refresh();
        if (showTrash()) void store.openTrash();
        break;
      case "tree.leaf":
        setNotice(entriesFirstNotice(keys.chord("tree.dive"), keys.chord("tree.leaf")));
        break;
    }
  });

  return (
    <aside class="kw-tree" aria-label="sessions" tabIndex={-1} ref={root}>
      <div class="kw-tree-head">
        <button
          type="button"
          class="kw-tree-new"
          onClick={() => void props.shell.sessions.newSession()}
        >
          + new session
        </button>
      </div>
      <div class="kw-tree-body">
        <Show
          when={liveRows().length > 0}
          fallback={<EmptyState line={treePane.emptyState(props.shell.keys)} />}
        >
          <ol class="kw-tree-list">
            <Index each={liveRows()}>
              {(row, index) => {
                const chooseAndOpen = (): void => {
                  setCursor(index);
                  open(row());
                };
                const cursored = (): boolean => props.focused && index === at();
                const isCurrent = (): boolean =>
                  sessionIdOf(row()) === props.shell.currentSession();
                return (
                  <Switch>
                    <Match when={sessionRowOf(row())}>
                      {(session) => (
                        <SessionRowView
                          row={session()}
                          name={nameOf(session().summary)}
                          liveness={livenessOf(
                            props.shell.store.state.projections[session().summary.id],
                            session().summary,
                          )}
                          changes={changesFacts(session().summary.changes)}
                          wears={arcWears(props.shell.attire, session().summary.arc)}
                          cost={costOf(session().summary)}
                          current={isCurrent()}
                          cursor={cursored()}
                          onOpen={chooseAndOpen}
                          onDive={() => dive(session().summary.id)}
                        />
                      )}
                    </Match>
                    <Match when={childRowOf(row())}>
                      {(child) => (
                        <ChildRowView
                          child={child().child}
                          name={childName(child().child)}
                          bot={botLabelOf(child().child.bot, props.shell)}
                          current={isCurrent()}
                          cursor={cursored()}
                          onOpen={chooseAndOpen}
                          onDive={() => dive(child().child.sessionId)}
                        />
                      )}
                    </Match>
                  </Switch>
                );
              }}
            </Index>
          </ol>
        </Show>
        <section class="kw-tree-trash" aria-label="trash" data-shown={showTrash() ? "" : undefined}>
          <button type="button" class="kw-tree-trash-head" onClick={toggleTrash}>
            {trashHeading(showTrash(), trash().length, {
              show: keys.chord("tree.trash"),
              empty: keys.chord("tree.purge"),
            })}
          </button>
          <Show when={showTrash()}>
            <Show
              when={trash().length > 0}
              fallback={<p class="kw-tree-quiet">{emptyTrashLine(keys.chord("tree.remove"))}</p>}
            >
              <ol class="kw-tree-list">
                <For each={trash()}>
                  {(item, index) => (
                    <li
                      ref={(row) =>
                        keepInView(row, () => props.focused && liveRows().length + index() === at())
                      }
                      class="kw-tree-session"
                      data-trashed=""
                      data-cursor={
                        props.focused && liveRows().length + index() === at() ? "" : undefined
                      }
                    >
                      <button
                        type="button"
                        class="kw-tree-row"
                        onClick={() => setCursor(liveRows().length + index())}
                      >
                        <span class="kw-tree-mark" aria-hidden="true">
                          ·
                        </span>
                        <span class="kw-tree-name">{nameOf(item)}</span>
                        <span class="kw-tree-cost">{costOf(item)}</span>
                        <span class="kw-tree-age">{relativeAge(item.lastActivityAt)}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ol>
            </Show>
          </Show>
        </section>
      </div>
      <Show when={pending()}>
        {(asked) => (
          <ConfirmLine
            question={trashQuestion(asked())}
            onConfirm={() => void settle(asked())}
            onCancel={() => setPending(undefined)}
          />
        )}
      </Show>
      <NoticeLine text={notice.text()} />
    </aside>
  );
}

function EntriesLevel(props: PaneProps<TreeSpec> & { sessionId: string }) {
  const [cursor, setCursor] = createSignal<string>();
  const [folded, setFolded] = createSignal<ReadonlySet<string>>(new Set());
  const [labelDraft, setLabelDraft] = createSignal<string>();
  const [notice, setNotice] = createSignal<string>();
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
    if (next === undefined) return;
    setNotice(undefined);
    setCursor(next.id);
  };
  const toggleFold = (id: string): void => {
    setFolded((current) => toggled(current, id));
  };
  const fork = async (): Promise<void> => {
    const target = row();
    if (target === undefined) return;
    const forked = await props.shell.store.fork(props.sessionId, target.id);
    if (typeof forked !== "string") props.shell.sessions.openSession(forked.sessionId);
  };
  const continueHere = async (): Promise<void> => {
    const target = row();
    if (target === undefined) return;
    if (target.isLeaf) {
      setNotice(alreadyTheLeafNotice);
      return;
    }
    const moved = await props.shell.store.moveLeaf(props.sessionId, target.id);
    setNotice(leafNotice(moved, target, props.shell.keys.chord("tree.refresh")));
    if (typeof moved !== "string") void props.shell.store.reload(props.sessionId);
  };
  const commitLabel = (): void => {
    const target = row();
    const label = (labelDraft() ?? "").trim();
    setLabelDraft(undefined);
    if (target !== undefined) {
      void props.shell.store.label(props.sessionId, target.id, label === "" ? null : label);
    }
  };

  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused && labelDraft() === undefined,
  );

  createEffect(() => {
    void props.shell.store.openTree(props.sessionId);
  });
  createEffect(() => {
    if (cursor() !== undefined || tree().snapshot === undefined) return;
    const seat = rows().find((shown) => shown.isLeaf) ?? rows()[0];
    if (seat !== undefined) setCursor(seat.id);
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
      case "tree.leaf":
        void continueHere();
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
    <section class="kw-tree" aria-label="entry tree" tabIndex={-1} ref={root}>
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
      <NoticeLine text={notice()} />
    </section>
  );
}

function botLabelOf(bot: string | undefined, shell: ShellSeams): string | undefined {
  return bot === undefined ? undefined : botNamed(bot, shell.store.surfaces.state.bots);
}

function sessionRowOf(row: SessionsRow): SessionRow | undefined {
  return row.kind === "session" ? row : undefined;
}

function childRowOf(row: SessionsRow): ChildRow | undefined {
  return row.kind === "child" ? row : undefined;
}

function isParentOf(row: SessionsRow, child: ChildRow): boolean {
  return row.kind === "session" && row.summary.id === child.child.parentId;
}

function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}

function foldStamp(row: TreeRow): string {
  if (!row.hasChildren) return row.branchPoint ? "▸" : " ";
  return row.folded ? "▸" : row.branchPoint ? "▾" : "│";
}
