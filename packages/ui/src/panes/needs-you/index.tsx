import { createEffect, createMemo, createSignal, Index, Show } from "solid-js";
import { z } from "zod";
import { createTileFillStep } from "../../chrome/stamp.ts";
import type { BindingSpec } from "../../keys/keymap.ts";
import type { AskPick } from "../../page/ask-card.tsx";
import { answerHeldAsk, type HeldAsk } from "../../shell/answer-ask.ts";
import type { NeedsYouItem } from "../../shell/needs-you.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { createCursor } from "../overview/rows.tsx";
import {
  definePane,
  type KeyHints,
  type PaneLocalAction,
  type PaneProps,
  type ShellSeams,
} from "../registry.ts";
import {
  type DeskGroup,
  type DeskKeys,
  type DeskRow,
  type DeskSources,
  deskDismissNotice,
  deskGroups,
  deskHead,
  deskHint,
  deskRows,
  deskTitle,
  nextWaiting,
} from "./desk.ts";
import { DeskRowView } from "./desk-row.tsx";
import "../overview/overview.css";
import "./desk.css";

const needsYouSpec = z.object({ kind: z.literal("needs-you") });

export type NeedsYouSpec = z.output<typeof needsYouSpec>;

export const needsYouPane = definePane<NeedsYouSpec>({
  kind: "needs-you",
  spec: needsYouSpec,
  home: "main",
  attire: "house",
  title: (_spec, shell) => deskTitle(waitingIn(shell).length),
  emptyState: (keys) => `the desk is clear · ${keys.chord("tree.summon")} lists every session`,
  component: Desk,
  summon: {
    action: "needs-you.summon",
    chords: "leader q",
    help: "the desk: every session by what it wants",
    command: {
      name: "desk",
      description: "every session by what it wants from you, everything waiting on you first",
      aliases: ["needs-you", "waiting"],
    },
    spec: () => ({ kind: "needs-you" }),
  },
  localActions: {
    "needs-you.down": deskAction(["j", "down"], "next row", "desk-down", "move to the next row"),
    "needs-you.up": deskAction(["k", "up"], "previous row", "desk-up", "move to the previous row"),
    "needs-you.open": deskAction(
      "enter",
      "go where it is answered",
      "desk-open",
      "jump to the pane that answers this row, or to the session",
    ),
    "needs-you.waiting": deskAction(
      "tab",
      "next waiting row",
      "desk-next-waiting",
      "move to the next row waiting on you",
    ),
    "needs-you.dismiss": deskAction(
      "d",
      "dismiss it · never an ask",
      "desk-dismiss",
      "take this row off the desk; an ask is answered, never dismissed",
    ),
    "needs-you.approve": deskAction(
      "y",
      "approve the row's ask · for the session when quiet",
      "desk-approve",
      "approve the row's ask: once, or for the session when it is quiet",
    ),
    "needs-you.once": deskAction(
      "o",
      "approve the row's ask once",
      "desk-approve-once",
      "approve the row's ask this one time, even in a quiet session",
    ),
    "needs-you.session": deskAction(
      "s",
      "approve the row's ask for its session",
      "desk-approve-session",
      "approve the row's ask and its rules for the session",
    ),
    "needs-you.workspace": deskAction(
      "w",
      "approve the row's ask for this workspace",
      "desk-approve-workspace",
      "approve the row's ask and its rules for this workspace",
    ),
    "needs-you.deny": deskAction("n", "deny the row's ask", "desk-deny", "deny the row's ask"),
  },
  lifecycle: (_view, shell) => (waitingIn(shell).length > 0 ? "needs-you" : "idle"),
});

export function deskKeys(keys: KeyHints): DeskKeys {
  return {
    down: keys.chord("needs-you.down"),
    up: keys.chord("needs-you.up"),
    open: keys.chord("needs-you.open"),
    dismiss: keys.chord("needs-you.dismiss"),
    waiting: keys.chord("needs-you.waiting"),
    approve: keys.chord("needs-you.approve"),
    once: keys.chord("needs-you.once"),
    session: keys.chord("needs-you.session"),
    workspace: keys.chord("needs-you.workspace"),
    deny: keys.chord("needs-you.deny"),
  };
}

export function deskSources(shell: ShellSeams): DeskSources {
  return {
    waiting: waitingIn(shell),
    sessions: shell.store.state.summaries,
    working: (sessionId) => shell.store.state.projections[sessionId]?.turn !== undefined,
    unread: (summary) => shell.needsYou?.reads.unread(summary) === true,
    quiet: (sessionId) => shell.quiet?.has(sessionId) === true,
  };
}

const answerPicks: Readonly<Record<string, AskPick>> = {
  "needs-you.approve": "approve",
  "needs-you.once": "once",
  "needs-you.session": "session",
  "needs-you.workspace": "workspace",
  "needs-you.deny": "deny",
};

function Desk(props: PaneProps<NeedsYouSpec>) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  openAskingSessions(props.shell);
  const sources = () => deskSources(props.shell);
  const groups = createMemo(() => deskGroups(sources()));
  const rows = createMemo(() => deskRows(groups()));
  const cursor = createCursor(() => rows().length);
  const keys = createMemo(() => deskKeys(props.shell.keys));
  const step = createTileFillStep(() => rows().some(isWorking));
  const [notice, setNotice] = createSignal<string>();
  const current = (): DeskRow | undefined => rows()[cursor.index()];

  const move = (delta: number): void => {
    setNotice(undefined);
    cursor.move(delta);
  };
  const go = (row: DeskRow | undefined): void => {
    if (row === undefined) return;
    setNotice(undefined);
    if (row.kind === "waiting") props.shell.needsYou?.jump(row.item);
    else props.shell.needsYou?.visit(row.summary.id);
  };
  const dismiss = (row: DeskRow | undefined): void => {
    if (row === undefined) return;
    if (row.kind === "waiting") props.shell.needsYou?.queue.dismiss(row.item);
    else if (row.state === "finished-unseen") props.shell.needsYou?.reads.read(row.summary);
    setNotice(deskDismissNotice(row, keys()));
  };
  const toNextWaiting = (): void => {
    const next = nextWaiting(rows(), cursor.index());
    setNotice(next === undefined ? "nothing needs you" : undefined);
    if (next !== undefined) cursor.set(next);
  };
  const answer = (pick: AskPick): void => {
    const held = heldAsk(current());
    if (held === undefined) {
      setNotice(`no ask on this row · ${keys().waiting} goes to the next waiting`);
      return;
    }
    const answering = {
      store: props.shell.store,
      quiet: props.shell.quiet,
      approveKey: keys().approve,
    };
    void answerHeldAsk(answering, held, pick).then((line) => setNotice(line));
  };

  props.onAction((action) => {
    const pick = answerPicks[action];
    if (pick !== undefined) return answer(pick);
    switch (action) {
      case "needs-you.down":
        return move(1);
      case "needs-you.up":
        return move(-1);
      case "needs-you.waiting":
        return toNextWaiting();
      case "needs-you.open":
        return go(current());
      case "needs-you.dismiss":
        return dismiss(current());
    }
  });

  return (
    <section class="kw-ov kw-desk" aria-label="desk" tabIndex={-1} ref={root}>
      <div class="kw-ov-head">
        <span class="kw-ov-head-lead">{deskHead(sources())}</span>
      </div>
      <Show
        when={rows().length > 0}
        fallback={<EmptyState line={needsYouPane.emptyState(props.shell.keys)} />}
      >
        <div class="kw-desk-groups">
          <Index each={groups()}>
            {(group) => (
              <DeskSection
                group={group()}
                shell={props.shell}
                cursor={props.focused ? cursor.index() : undefined}
                step={step()}
                keys={keys()}
                onPick={(index) => {
                  cursor.set(index);
                  go(rows()[index]);
                }}
                onAnswer={(index, pick) => {
                  cursor.set(index);
                  answer(pick);
                }}
              />
            )}
          </Index>
        </div>
      </Show>
      <Show when={notice() ?? (rows().length > 0 ? deskHint(keys()) : undefined)}>
        {(line) => <p class="kw-ov-line">{line()}</p>}
      </Show>
    </section>
  );
}

interface DeskSectionProps {
  group: DeskGroup;
  shell: ShellSeams;
  cursor: number | undefined;
  step: number;
  keys: DeskKeys;
  onPick(index: number): void;
  onAnswer(index: number, pick: AskPick): void;
}

function DeskSection(props: DeskSectionProps) {
  return (
    <section class="kw-desk-group" data-group={props.group.name} aria-label={props.group.name}>
      <h3 class="kw-desk-group-name">{props.group.name}</h3>
      <ol class="kw-desk-rows">
        <Index each={props.group.rows}>
          {(row, at) => (
            <DeskRowView
              row={row()}
              shell={props.shell}
              cursor={props.cursor === props.group.first + at}
              step={props.step}
              keys={props.keys}
              onPick={() => props.onPick(props.group.first + at)}
              onAnswer={(pick) => props.onAnswer(props.group.first + at, pick)}
            />
          )}
        </Index>
      </ol>
    </section>
  );
}

function openAskingSessions(shell: ShellSeams): void {
  createEffect(() => {
    for (const item of waitingIn(shell)) {
      if (item.kind === "ask" && item.workspace === shell.workspace) {
        void shell.store.open(item.sessionId);
      }
    }
  });
}

function heldAsk(row: DeskRow | undefined): HeldAsk | undefined {
  if (row?.kind !== "waiting" || row.item.kind !== "ask") return undefined;
  return { sessionId: row.item.sessionId, callId: row.item.callId };
}

function isWorking(row: DeskRow): boolean {
  return row.kind === "session" && row.state === "working";
}

function deskAction(
  chords: BindingSpec,
  help: string,
  name: string,
  description: string,
): PaneLocalAction {
  return { chords, help, command: { name, description } };
}

function waitingIn(shell: ShellSeams): readonly NeedsYouItem[] {
  return shell.needsYou?.queue.items() ?? [];
}
