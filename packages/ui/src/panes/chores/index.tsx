import "../overview/overview.css";
import "./chores.css";
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { z } from "zod";
import { hostFetch } from "../../host/transport.ts";
import { onboardingActionId } from "../../onboarding/index.tsx";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { ConfirmLine, createFleetingNotice, NoticeLine } from "../overview/rows.tsx";
import {
  definePane,
  type KeyHints,
  type PaneDefinition,
  type PaneLocalAction,
  type PaneProps,
  type ShellSeams,
} from "../registry.ts";
import {
  acceptedLine,
  alreadyAcceptedLine,
  choresTitle,
  headLine,
  hookMintedLine,
  hookOnlyForWebhooks,
  newChoreButton,
  nextWords,
  noChoreHere,
  noChoresLine,
  noCreatureLine,
  noRunsLine,
  noThreadLine,
  readOnlyLine,
  removedLine,
  removeQuestion,
  runAnswerLine,
  savedAwaitingLine,
  savedLine,
  stopRequestedLine,
  switchedLine,
  unreadableChore,
  wakeupCancelledLine,
} from "./copy.ts";
import { blankDraft, type ChoreDraft, draftOf } from "./draft.ts";
import { ChoreForm } from "./form.tsx";
import { type ChoresNavigation, createChoresNavigation } from "./navigation.ts";
import { type ChoresPort, choresOverFetch } from "./port.ts";
import { titleOf } from "./rows.ts";
import { type ChoresStore, createChoresStore } from "./store.ts";
import { AcceptCard, ChoreDetail, type ChoreHints, ListRowView, SettingsFooter } from "./views.tsx";
import {
  awaitsAcceptance,
  type ChoreFile,
  type ChoreRow,
  type CreatureRow,
  isOn,
  runsKey,
  waitingWakeup,
  wakesOnce,
} from "./wire.ts";

const choresSpec = z.object({
  kind: z.literal("chores"),
  creature: z.string().optional(),
});

export type ChoresSpec = z.output<typeof choresSpec>;

export interface ChoresClock {
  now(): number;
  zone(): string;
}

export interface ChoresSeams {
  port(shell: ShellSeams): ChoresPort;
  readonly clock: ChoresClock;
}

export const makeCreatureAction = onboardingActionId;

export const liveChoresSeams: ChoresSeams = {
  port: (shell) => choresOverFetch(hostFetch(shell.host, shell.workspace)),
  clock: { now: () => Date.now(), zone: () => Intl.DateTimeFormat().resolvedOptions().timeZone },
};

const choresActions: Readonly<Record<string, PaneLocalAction>> = {
  "chores.down": {
    chords: ["j", "down"],
    help: "next row",
    command: { name: "chores-next", description: "move to the next chore or run" },
  },
  "chores.up": {
    chords: ["k", "up"],
    help: "previous row",
    command: { name: "chores-previous", description: "move to the previous chore or run" },
  },
  "chores.open": {
    chords: "enter",
    help: "show the chore's runs · open the run's thread · fold a creature",
    command: {
      name: "chores-open",
      description: "show this chore's runs, open this run's thread, or fold this creature",
    },
  },
  "chores.back": {
    chords: ["escape", "h"],
    help: "back to the chores",
    command: { name: "chores-back", description: "leave the runs for the list of chores" },
  },
  "chores.new": {
    chords: "n",
    help: "add a chore",
    command: { name: "chores-new", description: "add a chore for the creature at the cursor" },
  },
  "chores.edit": {
    chords: "e",
    help: "edit the chore",
    command: { name: "chores-edit", description: "edit this chore's file through the form" },
  },
  "chores.run": {
    chords: "r",
    help: "run it now",
    command: { name: "chores-run", description: "run this chore now, by hand" },
  },
  "chores.cancel": {
    chords: "c",
    help: "stop the run in progress, or cancel a wakeup",
    command: {
      name: "chores-cancel",
      description: "stop this chore's run in progress, or cancel a creature's waiting wakeup",
    },
  },
  "chores.toggle": {
    chords: "t",
    help: "turn the schedule on or off",
    command: { name: "chores-toggle", description: "turn this chore's schedule on or off" },
  },
  "chores.accept": {
    chords: "a",
    help: "read and accept its grants",
    command: {
      name: "chores-accept",
      description: "read a write or act chore's grants, then accept exactly those",
    },
  },
  "chores.thread": {
    chords: "o",
    help: "open the run's thread",
    command: { name: "chores-thread", description: "open the thread of this run or the last" },
  },
  "chores.remove": {
    chords: "shift+x",
    help: "remove the chore (confirm)",
    command: { name: "chores-remove", description: "remove this chore's file and schedule" },
  },
  "chores.hook": {
    chords: "w",
    help: "mint the webhook token",
    command: {
      name: "chores-hook",
      description: "mint (or replace) the token a webhook chore answers to; shown once",
    },
  },
  "chores.refresh": {
    chords: "shift+r",
    help: "read the chores again",
    command: { name: "chores-refresh", description: "read the chores and runs again" },
  },
};

export function choresPaneWith(seams: ChoresSeams): PaneDefinition<ChoresSpec> {
  return definePane<ChoresSpec>({
    kind: "chores",
    heading: "on the chore board",
    spec: choresSpec,
    home: "main",
    attire: "house",
    title: (spec) => choresTitle(spec.creature),
    emptyState: (keys) => noChoresLine(keys.chord("chores.new")),
    component: (props) => <Chores pane={props} seams={seams} />,
    summon: {
      action: "chores.summon",
      chords: "leader shift+b",
      help: "chores: every creature's scheduled and triggered work",
      command: {
        name: "chores",
        description: "open the chores pane, optionally for one creature",
        argument: { hint: "creature" },
      },
      spec: (_shell, creature) => ({
        kind: "chores",
        ...(creature !== undefined && creature !== "" && { creature }),
      }),
    },
    localActions: choresActions,
  });
}

export const choresPane = choresPaneWith(liveChoresSeams);

type Prompt =
  | { readonly kind: "form"; creature: CreatureRow; initial: ChoreDraft; editing: boolean }
  | { readonly kind: "accept"; row: ChoreRow }
  | { readonly kind: "remove"; row: ChoreRow };

interface ChoresProps {
  readonly pane: PaneProps<ChoresSpec>;
  readonly seams: ChoresSeams;
}

function Chores(props: ChoresProps) {
  const shell = props.pane.shell;
  const keys = shell.keys;
  const port = props.seams.port(shell);
  const store = createChoresStore(port, shell.feed);
  onMount(() => void store.load());
  onCleanup(() => store.dispose());
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.pane.focused,
  );

  const [prompt, setPrompt] = createSignal<Prompt>();
  const [formProblem, setFormProblem] = createSignal<string>();
  const drafting = (): boolean => prompt()?.kind === "form";
  const notice = createFleetingNotice();
  const zone = (): string => props.seams.clock.zone();
  const needsYou = (row: ChoreRow): boolean => store.needs(row.creature, row.id).length > 0;
  const nextOf = (row: ChoreRow): string =>
    nextWords(row, props.seams.clock.now(), zone(), needsYou(row));
  const hints: ChoreHints = {
    needs: (row) => store.needs(row.creature, row.id),
    get accept() {
      return keys.chord("chores.accept");
    },
    get toggle() {
      return keys.chord("chores.toggle");
    },
    get run() {
      return keys.chord("chores.run");
    },
  };

  const openThread = (): void => {
    const run = nav.opened() === undefined ? nav.current()?.lastRun : nav.runAtCursor();
    if (run?.sessionId === null || run?.sessionId === undefined) notice.say(noThreadLine);
    else shell.sessions.openSession(run.sessionId);
  };

  const nav = createChoresNavigation(store, {
    floating: () => shell.companion?.floating(),
    only: () => props.pane.spec.creature,
    openThread,
  });

  const refreshChore = async (row: ChoreRow): Promise<void> => {
    await store.reloadChores(row.creature);
    if (nav.showing(row)) await store.loadRuns(row.creature, row.id);
  };

  const runNow = async (row: ChoreRow): Promise<void> => {
    const answer = await port.run(row.creature, row.id);
    notice.say(answer.ok ? runAnswerLine(titleOf(row), answer.value) : answer.error);
    await refreshChore(row);
  };

  const mintHook = async (row: ChoreRow, routine: ChoreFile): Promise<void> => {
    if (routine.trigger.kind !== "webhook") return notice.say(hookOnlyForWebhooks);
    const answer = await port.mintHook(row.creature, row.id);
    notice.say(answer.ok ? hookMintedLine(answer.value.path, answer.value.token) : answer.error);
  };

  const cancel = async (row: ChoreRow): Promise<void> => {
    const wakeup = waitingWakeup(row);
    if (wakeup !== undefined) return cancelWakeup(row, wakeup);
    const answer = await port.cancel(row.creature, row.id);
    notice.say(answer.ok ? stopRequestedLine(titleOf(row)) : answer.error);
    await refreshChore(row);
  };

  const cancelWakeup = async (row: ChoreRow, wakeup: ChoreFile): Promise<void> => {
    const once = wakesOnce(wakeup);
    const answer = once
      ? await port.remove(row.creature, row.id)
      : await port.put(row.creature, { ...wakeup, enabled: false });
    notice.say(
      answer.ok
        ? wakeupCancelledLine(titleOf(row), once, keys.chord("chores.toggle"))
        : answer.error,
    );
    if (answer.ok && once && nav.showing(row)) nav.back();
    await refreshChore(row);
  };

  const toggle = async (row: ChoreRow, routine: ChoreFile): Promise<void> => {
    const on = !isOn(row);
    const answer = await port.put(row.creature, { ...routine, enabled: on });
    notice.say(
      answer.ok ? switchedLine(titleOf(row), on, keys.chord("chores.cancel")) : answer.error,
    );
    await refreshChore(row);
  };

  const askToAccept = (row: ChoreRow): void => {
    const grants = row.grants;
    if (grants === null) notice.say(unreadableChore);
    else if (!grants.needsAcceptance) notice.say(readOnlyLine(titleOf(row)));
    else if (grants.accepted)
      notice.say(alreadyAcceptedLine(titleOf(row), grants.acceptedAt, zone()));
    else setPrompt({ kind: "accept", row });
  };

  const accept = async (read: ChoreRow): Promise<void> => {
    setPrompt(undefined);
    if (read.grants === null) return;
    const answer = await port.accept(read.creature, read.id, read.grants.digest);
    const count = read.routine?.grants.length ?? 0;
    notice.say(answer.ok ? acceptedLine(titleOf(read), count) : answer.error);
    await refreshChore(read);
  };

  const startNew = (): void => {
    const creature = nav.currentCreature();
    if (creature === undefined) {
      notice.say(noCreatureLine(keys.chord(makeCreatureAction)));
      return;
    }
    setFormProblem(undefined);
    setPrompt({ kind: "form", creature, initial: blankDraft(zone()), editing: false });
  };

  const startEdit = (row: ChoreRow, routine: ChoreFile): void => {
    const creature = nav.creatures().find((candidate) => candidate.slug === row.creature);
    if (creature === undefined) return;
    setFormProblem(undefined);
    setPrompt({ kind: "form", creature, initial: draftOf(routine, zone()), editing: true });
  };

  const save = async (creature: CreatureRow, file: ChoreFile): Promise<void> => {
    setFormProblem(undefined);
    const answer = await port.put(creature.slug, file);
    if (!answer.ok) {
      setFormProblem(answer.error);
      return;
    }
    setPrompt(undefined);
    const { row, created } = answer.value;
    notice.say(
      awaitsAcceptance(row)
        ? savedAwaitingLine(file.title, file.tools, keys.chord("chores.accept"))
        : savedLine(file.title, created),
    );
    await refreshChore(row);
  };

  const remove = async (row: ChoreRow): Promise<void> => {
    setPrompt(undefined);
    const answer = await port.remove(row.creature, row.id);
    notice.say(answer.ok ? removedLine(titleOf(row)) : answer.error);
    if (answer.ok && nav.showing(row)) nav.back();
    await store.reloadChores(row.creature);
  };

  const reread = async (): Promise<void> => {
    await store.load();
    const row = nav.opened();
    if (row !== undefined) await store.loadRuns(row.creature, row.id);
  };

  const withChore = (act: (row: ChoreRow) => void): void => {
    const row = nav.current();
    if (row === undefined) notice.say(noChoreHere);
    else act(row);
  };

  const withRoutine = (act: (row: ChoreRow, routine: ChoreFile) => void): void =>
    withChore((row) => {
      if (row.routine === null) notice.say(unreadableChore);
      else act(row, row.routine);
    });

  props.pane.onAction((action) => {
    const pending = prompt();
    if (pending?.kind === "form") return;
    if (pending !== undefined) {
      setPrompt(undefined);
      return;
    }
    switch (action) {
      case "chores.down":
        return nav.cursor().move(1);
      case "chores.up":
        return nav.cursor().move(-1);
      case "chores.open":
        return nav.open();
      case "chores.back":
        return nav.back();
      case "chores.new":
        return startNew();
      case "chores.edit":
        return withRoutine(startEdit);
      case "chores.run":
        return withChore((row) => void runNow(row));
      case "chores.cancel":
        return withChore((row) => void cancel(row));
      case "chores.toggle":
        return withRoutine((row, routine) => void toggle(row, routine));
      case "chores.accept":
        return withChore(askToAccept);
      case "chores.thread":
        return openThread();
      case "chores.remove":
        return withChore((row) => setPrompt({ kind: "remove", row }));
      case "chores.hook":
        return withRoutine((row, routine) => void mintHook(row, routine));
      case "chores.refresh":
        return void reread();
    }
  });

  return (
    <section
      class="kw-ov kw-chores"
      aria-label="chores"
      tabIndex={-1}
      ref={root}
      data-drafting={drafting() ? "" : undefined}
    >
      <Show
        when={nav.opened()}
        fallback={
          <ChoresList
            nav={nav}
            store={store}
            keys={keys}
            hints={hints}
            next={nextOf}
            onNew={startNew}
          />
        }
      >
        {(row) => (
          <>
            <div class="kw-ov-head">
              <button type="button" class="kw-ov-new" onClick={() => nav.back()}>
                ‹ {nav.currentCreature()?.name ?? row().creature}
              </button>
              <span class="kw-ov-head-lead">{titleOf(row())}</span>
              <span class="kw-ov-head-detail">{nextOf(row())}</span>
            </div>
            <ChoreDetail
              row={row()}
              runs={nav.runs()}
              runsRefusal={store.state.runRefusals[runsKey(row().creature, row().id)]}
              cursor={nav.runCursor.index()}
              zone={zone()}
              next={nextOf(row())}
              hints={hints}
              noRuns={noRunsLine(hints.run)}
              onPickRun={(index) => {
                nav.runCursor.set(index);
                openThread();
              }}
            />
          </>
        )}
      </Show>
      <Show when={prompt()}>
        {(pending) => (
          <Switch>
            <Match when={rowOf(pending(), "accept")}>
              {(row) => (
                <AcceptCard
                  row={row()}
                  onConfirm={() => void accept(row())}
                  onCancel={() => setPrompt(undefined)}
                />
              )}
            </Match>
            <Match when={rowOf(pending(), "remove")}>
              {(row) => (
                <ConfirmLine
                  question={removeQuestion(titleOf(row()))}
                  onConfirm={() => void remove(row())}
                  onCancel={() => setPrompt(undefined)}
                />
              )}
            </Match>
            <Match when={formOf(pending())}>
              {(form) => (
                <ChoreForm
                  creature={form().creature.name}
                  initial={form().initial}
                  editing={form().editing}
                  problem={formProblem()}
                  acceptChord={hints.accept}
                  onSave={(file) => void save(form().creature, file)}
                  onCancel={() => setPrompt(undefined)}
                />
              )}
            </Match>
          </Switch>
        )}
      </Show>
      <NoticeLine text={notice.text()} />
    </section>
  );
}

interface ChoresListProps {
  readonly nav: ChoresNavigation;
  readonly store: ChoresStore;
  readonly keys: KeyHints;
  readonly hints: ChoreHints;
  readonly next: (row: ChoreRow) => string;
  onNew(): void;
}

function ChoresList(props: ChoresListProps) {
  const loaded = (): boolean => props.store.state.loaded;
  const noChores = (): boolean =>
    loaded() && props.nav.allChores().length === 0 && props.nav.refusals().length === 0;
  return (
    <>
      <div class="kw-ov-head">
        <button type="button" class="kw-ov-new" onClick={() => props.onNew()}>
          {newChoreButton}
        </button>
        <span class="kw-ov-head-detail">
          {headLine(props.nav.allChores(), (row) => props.hints.needs(row).length > 0)}
        </span>
      </div>
      <Switch>
        <Match when={props.store.state.refusal}>{(text) => <EmptyState line={text()} />}</Match>
        <Match when={loaded() && props.nav.creatures().length === 0}>
          <EmptyState line={noCreatureLine(props.keys.chord(makeCreatureAction))} />
        </Match>
        <Match when={noChores()}>
          <EmptyState line={noChoresLine(props.keys.chord("chores.new"))} />
        </Match>
        <Match when={props.nav.listRows().length > 0}>
          <ol class="kw-ov-list">
            <For each={props.nav.listRows()}>
              {(row, index) => (
                <ListRowView
                  row={row}
                  cursor={index() === props.nav.listCursor.index()}
                  next={props.next}
                  hints={props.hints}
                  onClick={() => {
                    props.nav.listCursor.set(index());
                    props.nav.open();
                  }}
                />
              )}
            </For>
          </ol>
        </Match>
      </Switch>
      <SettingsFooter settings={props.store.state.settings} />
    </>
  );
}

function formOf(prompt: Prompt): Extract<Prompt, { kind: "form" }> | undefined {
  return prompt.kind === "form" ? prompt : undefined;
}

function rowOf(prompt: Prompt, kind: "accept" | "remove"): ChoreRow | undefined {
  if (prompt.kind === "form" || prompt.kind !== kind) return undefined;
  return prompt.row;
}
