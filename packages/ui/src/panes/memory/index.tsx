import type { DailyEntry, MemoryAnswer, MemoryNote } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  Match,
  on,
  Show,
  Switch,
} from "solid-js";
import { z } from "zod";
import type { LifecycleState } from "../../chrome/pane-frame.tsx";
import type { MemoryStore } from "../../shell/memory-store.ts";
import { inboxNeedsYouAt } from "../../shell/needs-you.ts";
import { EmptyState } from "../empty-state.tsx";
import { definePane, type KeyHints, type PaneProps } from "../registry.ts";
import { Garden } from "./garden.tsx";
import { DailyLens, LedgerLens } from "./ledger.tsx";
import { NoteLens } from "./note.tsx";
import {
  entriesTouching,
  flatRows,
  gardenSections,
  type MemoryRow,
  newestFirst,
  noteNameOf,
} from "./rows.ts";
import "./memory.css";

const memorySpec = z.object({ kind: z.literal("memory") });

export type MemorySpec = z.output<typeof memorySpec>;

export type MemoryLens =
  | { kind: "garden" }
  | { kind: "note"; name: string; layer: string }
  | { kind: "ledger" }
  | { kind: "daily"; date: string };

export const memoryPane = definePane<MemorySpec>({
  kind: "memory",
  spec: memorySpec,
  home: "right",
  title: (_spec, shell) => titleOf(shell.store.memory.state.inbox.count),
  emptyState: (keys) =>
    `nothing in the garden yet · notes land as sessions run · ${keys.chord("pane.split")} starts one`,
  component: MemorySlot,
  summon: {
    action: "memory.summon",
    chords: "leader shift+m",
    help: "memory pane",
    command: { name: "memory", description: "open the memory garden", aliases: ["garden"] },
    spec: () => ({ kind: "memory" }),
  },
  localActions: {
    "memory.ask": {
      chords: "?",
      help: "ask the garden",
      command: { name: "ask", description: "search the memory garden" },
    },
    "memory.approve": {
      chords: "a",
      help: "approve the focused item",
      command: { name: "approve", description: "approve the focused inbox item" },
    },
    "memory.discard": {
      chords: "d",
      help: "discard the focused item",
      command: { name: "discard", description: "discard the focused inbox item" },
    },
    "memory.revert": {
      chords: "u",
      help: "revert the focused write",
      command: { name: "revert", description: "revert the focused ledger entry" },
    },
    "memory.carry": {
      chords: "c",
      help: "carry the focused question to the next arc",
      command: { name: "carry", description: "carry the focused airlock question forward" },
    },
    "memory.force": {
      chords: "f",
      help: "force-close the focused airlock",
      command: { name: "force-close", description: "close the focused arc past wedged sessions" },
    },
    "memory.inbox": {
      chords: "i",
      help: "jump to the inbox",
      command: { name: "inbox", description: "jump to the memory review inbox" },
    },
    "memory.ledger": {
      chords: "l",
      help: "the write ledger",
      command: { name: "ledger", description: "show this run's memory writes" },
    },
    "memory.open": {
      chords: "enter",
      help: "open the focused row",
      command: { name: "open-note", description: "open the focused note or day" },
    },
    "memory.back": {
      chords: "escape",
      help: "back to the garden",
      command: { name: "garden", description: "back to the memory garden" },
    },
    "memory.next": {
      chords: ["j", "down"],
      help: "next row",
      command: { name: "memory-next", description: "move to the next memory row" },
    },
    "memory.prev": {
      chords: ["k", "up"],
      help: "previous row",
      command: { name: "memory-prev", description: "move to the previous memory row" },
    },
  },
  lifecycle: (_view, shell) => lifecycleOf(shell.store.memory.state.inbox.count),
  onRestore: (_spec, shell) => void shell.store.memory.refresh(),
});

export function inertLine(keys: KeyHints): string {
  return `memory is inert: this workspace is untrusted · run keywork trust in a terminal · ${keys.chord("terminal.summon")} opens one`;
}

export function titleOf(inboxCount: number): string {
  return inboxCount === 0 ? "memory" : `memory · ${inboxCount} waiting`;
}

export function lifecycleOf(inboxCount: number): LifecycleState {
  return inboxCount >= inboxNeedsYouAt ? "needs-you" : "idle";
}

function MemorySlot(props: PaneProps<MemorySpec>) {
  const memory = (): MemoryStore => props.shell.store.memory;
  const state = () => memory().state;
  const [lens, setLens] = createSignal<MemoryLens>({ kind: "garden" });
  const [cursor, setCursor] = createSignal<string>();
  const [asking, setAsking] = createSignal(false);
  const [query, setQuery] = createSignal("");
  const [answer, setAnswer] = createSignal<MemoryAnswer>();
  const [notice, setNotice] = createSignal<string>();
  const [reverted, setReverted] = createSignal<Record<string, "reverted" | "needs-rebase">>({});
  let askInput: HTMLInputElement | undefined;

  const revision = () => (state().loaded ? state().revision : undefined);
  const [notes] = createResource(revision, () =>
    state().garden.trusted ? memory().notes() : Promise.resolve([]),
  );
  const [dates] = createResource(revision, () =>
    state().garden.trusted ? memory().dailyDates() : Promise.resolve([]),
  );
  const noteKey = () => {
    const current = lens();
    return current.kind === "note" ? { ...current, revision: revision() } : undefined;
  };
  const [openedNote] = createResource(noteKey, (key) => memory().note(key.name, key.layer));
  const dailyKey = () => {
    const current = lens();
    return current.kind === "daily" ? { date: current.date, revision: revision() } : undefined;
  };
  const [daily] = createResource(dailyKey, (key) => memory().daily(key.date));

  const sections = createMemo(() =>
    gardenSections({
      garden: state().garden,
      notes: notes() ?? [],
      dates: dates() ?? [],
      hits: answer()?.hits,
    }),
  );
  const rows = createMemo(() => flatRows(sections()));
  const ledgerEntries = createMemo(() => newestFirst(state().garden.ledger));
  const focusedRow = (): MemoryRow | undefined =>
    rows().find((row) => row.id === cursor()) ?? rows()[0];
  const focusedLedgerId = (): string | undefined =>
    ledgerEntries().find((entry) => entry.id === cursor())?.id ?? ledgerEntries()[0]?.id;
  const gardenEmpty = () => state().garden.layers.every((layer) => layer.notes === 0);
  const inert = () => state().loaded && !state().garden.trusted;

  if (!state().loaded) void memory().refresh();

  const say = (text: string): void => {
    setNotice(text);
  };
  createEffect(
    on(lens, () => {
      setNotice(undefined);
      setCursor(undefined);
    }),
  );

  const move = (delta: number): void => {
    const ids =
      lens().kind === "ledger"
        ? ledgerEntries().map((entry) => entry.id)
        : rows().map((row) => row.id);
    const current = lens().kind === "ledger" ? focusedLedgerId() : focusedRow()?.id;
    const at = ids.indexOf(current ?? "");
    const next = ids[Math.min(ids.length - 1, Math.max(0, at + delta))];
    if (next !== undefined) setCursor(next);
  };

  const open = (row: MemoryRow | undefined): void => {
    const next = lensFor(row);
    if (next !== undefined) setLens(next);
  };

  const approve = (row: MemoryRow | undefined): void => {
    if (row?.kind === "inbox") void memory().approve(row.item.id).then(report("approved"));
    else if (row?.kind === "candidate")
      void memory()
        .airlock.triageCandidate(row.arc, row.candidate.note, "deliver")
        .then(report("deliver"));
    else if (row?.kind === "question")
      void memory()
        .airlock.triageQuestion(row.arc, row.question.title, "resolve")
        .then(report("resolved"));
    else if (row?.kind === "finish")
      void memory().airlock.deliver(row.arc).then(report("delivered"));
    else say("nothing here to approve");
  };

  const discard = (row: MemoryRow | undefined): void => {
    if (row?.kind === "inbox") void memory().discard(row.item.id).then(report("discarded"));
    else if (row?.kind === "candidate")
      void memory()
        .airlock.triageCandidate(row.arc, row.candidate.note, "leave")
        .then(report("left"));
    else if (row?.kind === "question")
      void memory()
        .airlock.triageQuestion(row.arc, row.question.title, "drop")
        .then(report("dropped"));
    else say("nothing here to discard");
  };

  const carry = (row: MemoryRow | undefined): void => {
    if (row?.kind !== "question") {
      say("select an open question to carry it");
      return;
    }
    void memory()
      .airlock.triageQuestion(row.arc, row.question.title, "carry")
      .then(report("carried"));
  };

  const forceClose = (row: MemoryRow | undefined): void => {
    const arc =
      row?.kind === "finish" || row?.kind === "candidate" || row?.kind === "question"
        ? row.arc
        : undefined;
    if (arc === undefined) {
      say("select an airlock to close it");
      return;
    }
    void memory()
      .airlock.finish(arc, true)
      .then((outcome) => say(describeFinish(outcome)));
  };

  const revert = (): void => {
    const current = lens();
    const entry =
      current.kind === "ledger"
        ? ledgerEntries().find((item) => item.id === focusedLedgerId())
        : lastEntryFor(current, openedNote(), focusedRow(), state().garden.ledger);
    if (entry === undefined) {
      say("no change to revert here this run");
      return;
    }
    void memory()
      .revert(entry.id)
      .then((reply) => {
        if (typeof reply === "string") return say(describeRefusal(reply));
        setReverted((known) => ({ ...known, [entry.id]: reply.kind }));
        say(
          reply.kind === "reverted"
            ? `reverted ${entry.op}`
            : "needs rebase · the file moved on, nothing touched",
        );
      });
  };

  const jumpToInbox = (): void => {
    const first = rows().find((row) => row.kind === "inbox");
    if (first === undefined) {
      say("the inbox is empty");
      return;
    }
    setLens({ kind: "garden" });
    setCursor(first.id);
  };

  const ask = (): void => {
    setLens({ kind: "garden" });
    setAsking(true);
    queueMicrotask(() => askInput?.focus());
  };

  const submitAsk = (): void => {
    const text = query().trim();
    if (text === "") return;
    void memory()
      .ask(text)
      .then((reply) => {
        setAnswer(reply);
        setCursor(undefined);
      });
  };

  const closeAsk = (): void => {
    setAsking(false);
    setAnswer(undefined);
    setQuery("");
  };

  const back = (): void => {
    if (asking()) {
      closeAsk();
      return;
    }
    setLens({ kind: "garden" });
  };

  const report =
    (word: string) =>
    (outcome: unknown): void => {
      if (typeof outcome === "string") say(describeRefusal(outcome));
      else if (isRefusal(outcome)) say(outcome.detail);
      else say(word);
    };

  props.onAction((action) => {
    switch (action) {
      case "memory.ask":
        return ask();
      case "memory.approve":
        return approve(focusedRow());
      case "memory.discard":
        return discard(focusedRow());
      case "memory.revert":
        return revert();
      case "memory.carry":
        return carry(focusedRow());
      case "memory.force":
        return forceClose(focusedRow());
      case "memory.inbox":
        return jumpToInbox();
      case "memory.ledger":
        return setLens({ kind: "ledger" });
      case "memory.open":
        return lens().kind === "garden" ? open(focusedRow()) : undefined;
      case "memory.back":
        return back();
      case "memory.next":
        return move(1);
      case "memory.prev":
        return move(-1);
      default:
        return;
    }
  });

  return (
    <div class="kw-memory" data-lens={lens().kind}>
      <Show when={asking()}>
        <div class="kw-memory-ask">
          <span class="kw-memory-ask-mark">?</span>
          <input
            ref={askInput}
            class="kw-memory-ask-input"
            type="text"
            placeholder="ask the garden"
            aria-label="ask the garden"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitAsk();
              if (event.key === "Escape") closeAsk();
            }}
          />
          <Show when={answer()}>
            {(reply) => <span class="kw-memory-ask-source">{reply().source}</span>}
          </Show>
        </div>
      </Show>
      <Switch>
        <Match when={!state().loaded}>
          <p class="kw-memory-line">░ reading the garden…</p>
        </Match>
        <Match when={inert()}>
          <EmptyState line={inertLine(props.shell.keys)} />
        </Match>
        <Match when={lens().kind === "ledger"}>
          <LedgerLens
            entries={ledgerEntries()}
            cursor={focusedLedgerId()}
            reverted={reverted()}
            onSelect={setCursor}
          />
        </Match>
        <Match when={lensAs(lens(), "note")}>
          <NoteLens
            note={openedNote()}
            loading={openedNote.loading}
            history={historyOf(openedNote(), state().garden.ledger)}
          />
        </Match>
        <Match when={lensAs(lens(), "daily")}>
          {(current) => (
            <DailyLens date={current().date} entries={daily() as DailyEntry[] | undefined} />
          )}
        </Match>
        <Match when={gardenEmpty() && state().garden.inbox.length === 0 && answer() === undefined}>
          <EmptyState line={memoryPane.emptyState(props.shell.keys)} />
        </Match>
        <Match when={true}>
          <Garden
            sections={sections()}
            cursor={focusedRow()?.id}
            gardener={state().garden.gardener}
            onSelect={(row) => setCursor(row.id)}
            onOpen={open}
          />
        </Match>
      </Switch>
      <Show when={notice()}>{(text) => <p class="kw-memory-notice">{text()}</p>}</Show>
    </div>
  );
}

function lensFor(row: MemoryRow | undefined): MemoryLens | undefined {
  switch (row?.kind) {
    case "note":
      return { kind: "note", name: row.note.name, layer: row.note.layer };
    case "hit":
      return { kind: "note", name: row.hit.note, layer: row.hit.layer };
    case "date":
      return { kind: "daily", date: row.date };
    case "inbox":
      return row.view.note === undefined
        ? undefined
        : { kind: "note", name: row.view.note, layer: "workspace" };
    case "candidate":
      return { kind: "note", name: row.candidate.note, layer: `arc:${row.arc}` };
    default:
      return undefined;
  }
}

function lensAs<K extends MemoryLens["kind"]>(
  lens: MemoryLens,
  kind: K,
): Extract<MemoryLens, { kind: K }> | undefined {
  return lens.kind === kind ? (lens as Extract<MemoryLens, { kind: K }>) : undefined;
}

function historyOf(note: MemoryNote | undefined, ledger: MemoryStore["state"]["garden"]["ledger"]) {
  return note === undefined ? [] : newestFirst(entriesTouching(ledger, note.path));
}

function lastEntryFor(
  lens: MemoryLens,
  opened: MemoryNote | undefined,
  focused: MemoryRow | undefined,
  ledger: MemoryStore["state"]["garden"]["ledger"],
) {
  if (lens.kind === "note") return historyOf(opened, ledger)[0];
  if (focused?.kind === "note") return historyOf(focused.note, ledger)[0];
  if (focused?.kind === "inbox" && focused.view.note !== undefined) {
    const name = focused.view.note;
    return newestFirst(ledger).find((entry) =>
      entry.deltas.some((delta) => noteNameOf(delta.path) === name),
    );
  }
  return undefined;
}

function isRefusal(outcome: unknown): outcome is { detail: string } {
  return typeof outcome === "object" && outcome !== null && "detail" in outcome;
}

function describeRefusal(refusal: string): string {
  return refusal === "inert" ? "memory is inert: this workspace is untrusted" : "that item is gone";
}

function describeFinish(
  finish:
    | {
        kind: string;
        outcome?: { kind: string; items?: string[]; sessions?: string[]; delivered?: number };
      }
    | string,
): string {
  if (typeof finish === "string") return describeRefusal(finish);
  const outcome = finish.outcome;
  if (outcome === undefined) return finish.kind;
  switch (outcome.kind) {
    case "closed":
      return `closed · ${outcome.delivered ?? 0} delivered`;
    case "undecided":
      return `undecided · ${(outcome.items ?? []).join(", ")}`;
    case "wedged":
      return `wedged · ${(outcome.sessions ?? []).join(", ")}`;
    default:
      return outcome.kind;
  }
}
