import "../overview/overview.css";
import "./creature.css";
import { type CreatureReading, creatureReading, type Thread } from "@keywork-app/habitat";
import type { BusEnvelope, ForgetSourcePlan } from "@keywork-app/protocol";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { z } from "zod";
import type { LifecycleState } from "../../chrome/pane-frame.tsx";
import { relativeAge } from "../../chrome/telemetry.ts";
import { hostFetch } from "../../host/transport.ts";
import type { BindingSpec } from "../../keys/keymap.ts";
import { onboardingActionId } from "../../onboarding/index.tsx";
import { useKeyboardScope } from "../../shell/keyboard-claim.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import {
  forgetCard,
  forgetClient,
  refusedLine as forgetRefusedLine,
  forgotLine,
} from "../memory/forget.ts";
import { ForgetCard } from "../memory/forget-card.tsx";
import { ChoiceLine, createCursor, DraftLine, NoticeLine, OverviewRow } from "../overview/rows.tsx";
import { definePane, type PaneLocalAction, type PaneProps, type ShellSeams } from "../registry.ts";
import { timeWord, whatAreYouDoing } from "../stead/copy.ts";
import { creatureHomeShell, InCreatureHome } from "../stead/creature-home.tsx";
import { createHabitatState, houseOffsetMinutes } from "../stead/habitat.ts";
import { skinIds } from "../stead/habitat-render.ts";
import { coatOf } from "../stead/herd.ts";
import {
  badModelReference,
  badName,
  bodyLine,
  calibrationLine,
  childrenWord,
  choresLine,
  classChoices,
  classOfChoice,
  classQuestion,
  costWord,
  creatureWord,
  decidedForYouLine,
  emptyStateLine,
  goneLine,
  groupWords,
  handleLine,
  hostWorkshopLine,
  keyHints,
  memoryLine,
  modelLabel,
  modelPlaceholder,
  noAsksAnswered,
  noChoresToPause,
  noReportRoute,
  noSlugChosen,
  nothingEnforced,
  nothingRemembered,
  noVerbYetLine,
  noWorkshopToOpen,
  opensLine,
  pausedLine,
  policyChangedLine,
  refusedLine,
  renamedLine,
  renameLabel,
  renamePlaceholder,
  resumedLine,
  sectionWords,
  shadowClassLine,
  skinChangedLine,
  skinQuestion,
  threadStateWords,
  unpricedWord,
  usageHeadings,
  usagePeriods,
  workshopLine,
} from "./copy.ts";
import {
  type CraftRow,
  CraftSection,
  craftHint,
  craftRows,
  craftSource,
  noCraftToEdit,
  noCraftToForget,
} from "./craft.tsx";
import { DeleteCard } from "./delete-card.tsx";
import { PortraitView } from "./portrait.tsx";
import {
  choresOf,
  creatureFilePath,
  dayWord,
  nextChore,
  parseModelReference,
  pausePlan,
  plainName,
  policyRows,
  rememberedRows,
  shadowRows,
  type ThreadGroup,
  type ThreadRow,
  threadRows,
  usageRows,
} from "./profile.ts";
import {
  type CreatureChange,
  type CreatureDetail,
  type CreatureRemoval,
  creatureClient,
  type KeeperReport,
  type ModelChoice,
  type ModelClass,
  type Reading,
  type RoutineRow,
  type ThreadState,
  type WorkshopHealthReport,
} from "./wire.ts";

const creatureSpec = z.object({
  kind: z.literal("creature"),
  slug: z.string().optional(),
});

export type CreatureSpec = z.output<typeof creatureSpec>;

export const creaturePane = definePane<CreatureSpec>({
  kind: "creature",
  heading: "in a creature's profile",
  spec: creatureSpec,
  home: "main",
  attire: "house",
  title: (spec, shell) =>
    spec.slug === undefined ? creatureWord : (shell.creatureNames?.nameOf(spec.slug) ?? spec.slug),
  emptyState: (keys) => emptyStateLine(keys.chord(onboardingActionId)),
  component: (props) => (
    <InCreatureHome shell={props.shell} class="kw-ov kw-creature">
      {(home) => <CreatureProfile {...props} shell={home} />}
    </InCreatureHome>
  ),
  summon: {
    action: "creature.summon",
    chords: "leader shift+i",
    help: "a creature's profile: body, workshop, models, threads, usage, firsts",
    command: {
      name: "creature",
      description: "open a creature's profile, the one place that owns who it is",
      aliases: ["profile"],
      argument: {
        hint: "[slug]",
        choices: (shell) => {
          const home = creatureHomeShell(shell) ?? shell;
          return home.store.surfaces.state.bots.map((bot) => ({
            value: bot.name,
            description: shell.creatureNames?.nameOf(bot.name),
          }));
        },
      },
    },
    spec: (shell, argument) => ({
      kind: "creature",
      ...slugFor(creatureHomeShell(shell) ?? shell, argument),
    }),
  },
  localActions: {
    "creature.down": action(
      ["j", "down"],
      "next thread",
      "creature-next",
      "move to the next thread",
    ),
    "creature.up": action(
      ["k", "up"],
      "previous thread",
      "creature-previous",
      "move to the previous thread",
    ),
    "creature.open": action(
      "enter",
      "open the thread under the cursor",
      "creature-open",
      "open the thread under the cursor",
    ),
    "creature.conversation": action(
      "c",
      "open its conversation",
      "creature-conversation",
      "open the creature's conversation",
    ),
    "creature.rename": action("r", "rename it", "rename-creature", "give the creature a new name", {
      hint: "[name]",
    }),
    "creature.skin": action("b", "change its body", "creature-body", "pick the creature's skin", {
      hint: "[skin]",
    }),
    "creature.policy": action(
      "m",
      "change a model class",
      "creature-models",
      "set which model answers one class of the creature's work",
    ),
    "creature.pause": action(
      "p",
      "pause or resume its chores",
      "pause-creature",
      "pause every chore so nothing fires until you resume, or resume them",
    ),
    "creature.workshop": action(
      "w",
      "open its workshop",
      "creature-workshop",
      "open the creature's workshop pane",
    ),
    "creature.chores": action("t", "open its chores", "creature-chores", "open the chore board"),
    "creature.memory": action("n", "open its notes", "creature-memory", "open the memory pane"),
    "creature.craft": action(
      "l",
      "next craft lesson",
      "creature-craft",
      "move to the next thing it learned about doing its work",
    ),
    "creature.craft-edit": action(
      "o",
      "edit the craft lesson",
      "craft-edit",
      "open the focused craft note in your editor",
    ),
    "creature.craft-forget": action(
      "x",
      "forget the craft lesson, after a dry run",
      "craft-forget",
      "show what forgetting the focused craft note removes, then confirm",
    ),
    "creature.file": action(
      "e",
      "edit creature.json",
      "creature-file",
      "open the creature's file in your editor",
    ),
    "creature.delete": action(
      "d",
      "delete it, after the card",
      "delete-creature",
      "delete the creature after a card says what goes and what stays",
    ),
  },
  adornments: (spec, shell) => {
    const bot = spec.slug === undefined ? undefined : shell.store.surfaces.bot(spec.slug);
    return bot === undefined ? {} : { bot: { sigil: bot.sigil, name: bot.name } };
  },
  lifecycle: (view, shell) => lifecycleOf(shell, view.spec.slug),
});

export const minuteMs = 60_000;
export const botLayerPrefix = "bot:";
export const noRouteStatuses: ReadonlySet<number> = new Set([404, 405, 501]);

export function slugFor(shell: ShellSeams, argument: string | undefined): { slug?: string } {
  const typed = argument?.trim();
  if (typed !== undefined && typed !== "") return { slug: typed };
  const current = shell.store.summary(shell.currentSession())?.bot;
  if (current !== undefined) return { slug: current };
  const floating = shell.companion?.floating();
  if (floating !== undefined) return { slug: floating };
  const first = shell.store.surfaces.state.bots[0]?.name;
  return first === undefined ? {} : { slug: first };
}

export function lifecycleOf(shell: ShellSeams, slug: string | undefined): LifecycleState {
  if (slug === undefined) return "idle";
  const rows = shell.store.state.summaries.filter((row) => row.bot === slug);
  if (rows.some((row) => (row.waiting?.asks ?? 0) > 0)) return "needs-you";
  return rows.some((row) => row.working === true) ? "working" : "idle";
}

export function concernsCreature(envelope: BusEnvelope, slug: string): boolean {
  const type: string = envelope.type;
  if (type === "creature.changed") return slugOfPayload(envelope.payload) === slug;
  return (
    type.startsWith("routine.") ||
    type === "workshop.changed" ||
    type === "session.removed" ||
    type === "surface.changed"
  );
}

type Prompt =
  | { kind: "rename" }
  | { kind: "skin" }
  | { kind: "class" }
  | { kind: "model"; modelClass: ModelClass };

interface Card {
  readonly removal: CreatureRemoval;
  readonly keep: boolean;
}

function CreatureProfile(props: PaneProps<CreatureSpec>) {
  const keyboard = useKeyboardScope();
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const shell = props.shell;
  const client = creatureClient({
    fetch: hostFetch(shell.host, shell.workspace),
    ranch: shell.client,
  });
  const slug = (): string | undefined => props.spec.slug ?? slugFor(shell, undefined).slug;
  const offsetMinutes = houseOffsetMinutes();
  const [now, setNow] = createSignal(Date.now());
  const ticking = setInterval(() => setNow(Date.now()), minuteMs);
  onCleanup(() => clearInterval(ticking));
  const world = createHabitatState({
    rows: () => shell.store.state.summaries,
    bots: () => shell.store.surfaces.state.bots,
    currentSession: () => shell.currentSession(),
    creatures: () => shell.client.creatures(),
    feed: shell.feed,
    now: Date.now,
    offsetMinutes,
  });

  const [detail, { refetch: refetchDetail }] = createResource(slug, (slug) => client.read(slug));
  const [routines, { refetch: refetchRoutines }] = createResource(slug, (slug) =>
    client.routines(slug),
  );
  const creature = (): CreatureDetail | undefined => readValue(detail());
  const workshopId = (): string | undefined => {
    const held = creature();
    return held === undefined || held.workshop === "host" ? undefined : held.workshop;
  };
  const [health, { refetch: refetchHealth }] = createResource(workshopId, (id) =>
    client.workshopHealth(id),
  );
  const [notes, { refetch: refetchNotes }] = createResource(slug, (slug) =>
    shell.client.memoryNotes(`${botLayerPrefix}${slug}`),
  );
  const craft = createMemo(() => craftRows(notes()));
  const [craftAt, setCraftAt] = createSignal(0);
  const [forgetting, setForgetting] = createSignal<ForgetSourcePlan>();
  const forgetter = forgetClient(hostFetch(shell.host, shell.workspace));
  const [report, { refetch: refetchReport }] = createResource(slug, (slug) => client.report(slug));
  const [prompt, setPrompt] = createSignal<Prompt>();
  const [card, setCard] = createSignal<Card>();
  const [notice, setNotice] = createSignal<string>();

  const chores = createMemo(() => choresOf(readValue(routines()) ?? []));
  const rows = createMemo((): ThreadRow[] => {
    const held = creature();
    if (held === undefined) return [];
    return threadRows(held, {
      rows: shell.store.state.summaries,
      childrenOf: (parent) => shell.store.children(parent),
      liveThread: (id) => world().threads[id],
    });
  });
  const cursor = createCursor(() => rows().length);
  const hue = (): number => {
    const seated = Object.keys(world().creatures).sort();
    const held = slug() ?? "";
    return coatOf(world().creatures[held], Math.max(0, seated.indexOf(held)));
  };
  const reading = createMemo((): CreatureReading | undefined => {
    const held = slug();
    return held === undefined ? undefined : creatureReading(world(), held, now());
  });
  const telling = (): string | undefined => {
    const read = reading();
    if (read === undefined) return undefined;
    const carried = read.carrier?.thread;
    const thread: Thread | undefined = carried === undefined ? undefined : world().threads[carried];
    return whatAreYouDoing({
      reading: read,
      thread,
      chores: chores(),
      parcelFogged: undefined,
      now: now(),
      offsetMinutes,
      asOf: world().asOf ?? creature()?.created,
      lastEvent: undefined,
    });
  };
  const keys = () => ({
    rename: shell.keys.chord("creature.rename"),
    skin: shell.keys.chord("creature.skin"),
    policy: shell.keys.chord("creature.policy"),
    conversation: shell.keys.chord("creature.conversation"),
    pause: shell.keys.chord("creature.pause"),
    remove: shell.keys.chord("creature.delete"),
  });

  const refetchAll = (): void => {
    void refetchDetail();
    void refetchRoutines();
    void refetchHealth();
    void refetchReport();
  };
  onCleanup(
    shell.feed.subscribe((batch) => {
      const held = slug();
      if (held !== undefined && batch.some((envelope) => concernsCreature(envelope, held)))
        refetchAll();
    }),
  );
  createEffect(() => {
    const held = creature();
    if (held !== undefined) props.shell.creatureNames?.remember(held.slug, held.name);
  });
  createEffect(on(slug, () => setNotice(undefined), { defer: true }));

  const openThread = (id: string | undefined): void => {
    if (id !== undefined) shell.sessions.openSession(id);
  };
  const openWorkshop = (): void => {
    const held = slug();
    if (workshopId() === undefined || held === undefined) {
      setNotice(noWorkshopToOpen);
      return;
    }
    shell.openPane({ kind: "workshop", creature: held });
  };
  const openFile = (): void => {
    const held = slug();
    if (held === undefined) return;
    void shell.openInEditor?.(`${shell.workspace}/${creatureFilePath(held)}`);
  };

  const write = async (thing: string, change: CreatureChange, said: string): Promise<void> => {
    const held = slug();
    if (held === undefined) return;
    const outcome = await client.change(held, change);
    if (outcome.ok) {
      setNotice(said);
      await refetchDetail();
      await shell.store.surfaces.refetch("bots");
      return;
    }
    setNotice(
      noRouteStatuses.has(outcome.status)
        ? noVerbYetLine(thing, creatureFilePath(held), shell.keys.chord("creature.file"))
        : refusedLine(thing, outcome.detail),
    );
  };
  const rename = (text: string): void => {
    setPrompt(undefined);
    const name = plainName(text);
    if (name === undefined) {
      setNotice(badName);
      return;
    }
    void write("name", { name }, renamedLine(name));
  };
  const dress = (skin: string): void => {
    setPrompt(undefined);
    void write("body", { body: { skin } }, skinChangedLine(skin));
  };
  const setModel = (modelClass: ModelClass, text: string): void => {
    setPrompt(undefined);
    const choice: ModelChoice | undefined = parseModelReference(text);
    if (choice === undefined) {
      setNotice(badModelReference);
      return;
    }
    void write(
      "models",
      { models: { [modelClass]: choice } },
      policyChangedLine(modelClass, choice),
    );
  };
  const pause = async (): Promise<void> => {
    const held = slug();
    if (held === undefined) return;
    const pausing = creature()?.paused == null;
    if (pausing && pausePlan(readValue(routines()) ?? []).kind === "none") {
      setNotice(noChoresToPause);
      return;
    }
    const outcome = await client.pause(held, pausing);
    setNotice(
      !outcome.ok
        ? refusedLine(pausing ? "pausing" : "resuming", outcome.detail)
        : pausing
          ? pausedLine(outcome.value.chores.length, shell.keys.chord("creature.pause"))
          : resumedLine(outcome.value.chores.length),
    );
    await Promise.all([refetchDetail(), refetchRoutines()]);
  };
  const askDelete = async (keep: boolean): Promise<void> => {
    const held = slug();
    if (held === undefined) return;
    const outcome = await client.removal(held, keep);
    if (!outcome.ok) {
      setNotice(refusedLine("delete", outcome.detail));
      return;
    }
    setCard({ removal: outcome.value, keep });
  };
  const confirmDelete = async (): Promise<void> => {
    const held = slug();
    const asked = card();
    setCard(undefined);
    keyboard?.returnHome();
    if (held === undefined || asked === undefined) return;
    const name = creature()?.name ?? held;
    const outcome = await client.remove(held, asked.keep);
    if (!outcome.ok) {
      setNotice(refusedLine("delete", outcome.detail));
      return;
    }
    const removal = outcome.value;
    setNotice(
      goneLine({
        name,
        threads: removal.goes.threads.length + (removal.goes.conversation === null ? 0 : 1),
        notes: removal.goes.notes,
        chores: removal.goes.routines,
        workshopKept: removal.stays.workshop ?? undefined,
        workshopGone: removal.goes.workshop ?? undefined,
      }),
    );
    await refetchDetail();
    await shell.store.surfaces.refetch("bots");
    await shell.store.refresh();
  };
  const cancelCard = (): void => {
    setCard(undefined);
    keyboard?.returnHome();
  };
  const focusedCraft = (): CraftRow | undefined => {
    const rows = craft();
    return rows[Math.min(craftAt(), rows.length - 1)];
  };
  const nextCraft = (): void => {
    const count = craft().length;
    if (count > 0) setCraftAt((at) => (at + 1) % count);
  };
  const editCraft = (): void => {
    const lesson = focusedCraft();
    if (lesson === undefined) setNotice(noCraftToEdit);
    else void shell.openInEditor?.(lesson.file).catch(() => undefined);
  };
  const previewCraftForget = async (): Promise<void> => {
    const held = slug();
    const lesson = focusedCraft();
    if (held === undefined || lesson === undefined) {
      setNotice(noCraftToForget);
      return;
    }
    const reading = await forgetter.preview(craftSource(held, lesson.name));
    if (reading.ok) setForgetting(reading.value);
    else setNotice(forgetRefusedLine(reading));
  };
  const applyCraftForget = async (plan: ForgetSourcePlan): Promise<void> => {
    setForgetting(undefined);
    keyboard?.returnHome();
    const reading = await forgetter.apply(plan.source, plan.digest);
    setNotice(reading.ok ? forgotLine(reading.value) : forgetRefusedLine(reading));
    if (reading.ok) await refetchNotes();
  };
  const keepCraft = (): void => {
    setForgetting(undefined);
    setNotice("kept everything");
    keyboard?.returnHome();
  };

  props.onAction((action, argument) => {
    if (prompt() !== undefined || card() !== undefined || forgetting() !== undefined) {
      setPrompt(undefined);
      setCard(undefined);
      setForgetting(undefined);
      return;
    }
    const held = creature();
    switch (action) {
      case "creature.down":
        return cursor.move(1);
      case "creature.up":
        return cursor.move(-1);
      case "creature.open":
        return openThread(rows()[cursor.index()]?.id);
      case "creature.conversation":
        return openThread(held?.conversation);
      case "creature.rename":
        if (held === undefined) return;
        return argument === undefined ? setPrompt({ kind: "rename" }) : rename(argument);
      case "creature.skin":
        if (held === undefined) return;
        return argument === undefined || !skinIds().includes(argument)
          ? setPrompt({ kind: "skin" })
          : dress(argument);
      case "creature.policy":
        if (held !== undefined) setPrompt({ kind: "class" });
        return;
      case "creature.pause":
        return void pause();
      case "creature.workshop":
        return openWorkshop();
      case "creature.chores":
        if (held !== undefined) shell.openPane({ kind: "chores", creature: held.slug });
        return;
      case "creature.memory":
        return shell.openPane({ kind: "memory" });
      case "creature.craft":
        return nextCraft();
      case "creature.craft-edit":
        return editCraft();
      case "creature.craft-forget":
        return void previewCraftForget();
      case "creature.file":
        return openFile();
      case "creature.delete":
        if (held !== undefined) void askDelete(false);
        return;
    }
  });

  const skinChoices = (): Readonly<Record<string, string>> =>
    Object.fromEntries(skinIds().map((id, index) => [String(index + 1), id]));
  const asking = <Kind extends Prompt["kind"]>(kind: Kind) => {
    const pending = prompt();
    return pending?.kind === kind ? (pending as Extract<Prompt, { kind: Kind }>) : undefined;
  };
  const inbox = (): number => shell.store.memory.state.inbox.count;
  const noteCount = (): number | undefined => {
    const held = notes();
    return held === undefined || !held.trusted ? undefined : held.notes.length;
  };

  return (
    <section class="kw-ov kw-creature" aria-label={creatureWord} tabIndex={-1} ref={root}>
      <Show when={slug()} fallback={<EmptyState line={creaturePane.emptyState(shell.keys)} />}>
        <Show when={creature()} fallback={<NoticeLine text={problemOf(detail())} tone="error" />}>
          {(held) => (
            <>
              <header class="kw-creature-head">
                <PortraitView skin={held().skin} hueStop={hue()} name={held().name} />
                <div class="kw-creature-identity">
                  <p class="kw-creature-title">
                    <span class="kw-creature-name">{held().name}</span>
                    <span class="kw-creature-handle">{handleLine(held().slug)}</span>
                  </p>
                  <p class="kw-creature-telling">{telling()}</p>
                  <p class="kw-creature-hints">{keyHints(keys())}</p>
                </div>
              </header>
              <dl class="kw-creature-facts" aria-label="identity">
                <dt>{sectionWords.body}</dt>
                <dd data-fact="body">
                  <span>{bodyLine(held().skin, held().seed)}</span>
                </dd>
                <dt>{sectionWords.workshop}</dt>
                <dd data-fact="workshop" data-health={readValue(health())?.health}>
                  <span>{workshopText(held(), health())}</span>
                  <Show when={workshopId()}>
                    <span class="kw-creature-opens">
                      {opensLine(shell.keys.chord("creature.workshop"), "it")}
                    </span>
                  </Show>
                </dd>
                <For each={policyRows(held().models)}>
                  {(row) => (
                    <>
                      <dt>{row.modelClass}</dt>
                      <dd
                        data-fact={row.modelClass}
                        data-inherit={row.choice === "inherit" ? "" : undefined}
                      >
                        <span>{row.line}</span>
                      </dd>
                    </>
                  )}
                </For>
              </dl>
              <h3 class="kw-creature-heading">{sectionWords.threads}</h3>
              <ol class="kw-creature-rows kw-ov-list" aria-label={sectionWords.threads}>
                <For each={groupedRows(rows())}>
                  {(entry) =>
                    entry.kind === "group" ? (
                      <li class="kw-creature-group">{groupWords[entry.group]}</li>
                    ) : (
                      <OverviewRow
                        cursor={props.focused && cursor.index() === entry.index}
                        indent={entry.row.group === "children"}
                        mark={markOf(entry.row.state)}
                        aside={asideOf(entry.row, now())}
                        onClick={() => {
                          cursor.set(entry.index);
                          openThread(entry.row.id);
                        }}
                      >
                        {entry.row.title}{" "}
                        <span class="kw-creature-state" data-state={entry.row.state}>
                          {stateWordOf(entry.row.state)}
                        </span>
                      </OverviewRow>
                    )
                  }
                </For>
              </ol>
              <h3 class="kw-creature-heading">{sectionWords.usage}</h3>
              <table class="kw-creature-usage">
                <thead>
                  <tr>
                    <For each={usageHeadings}>{(heading) => <th>{heading}</th>}</For>
                  </tr>
                </thead>
                <tbody>
                  <For each={usageRows(held(), shell.store.state.summaries, now())}>
                    {(row) => (
                      <tr data-period={row.period}>
                        <td>{usagePeriods[row.period]}</td>
                        <td>{row.sessions}</td>
                        <td>
                          {costWord(row.costNanos)}
                          {row.unpriced > 0 ? ` (${row.unpriced} ${unpricedWord})` : ""}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <dl class="kw-creature-facts" aria-label="keeping">
                <dt>{sectionWords.chores}</dt>
                <dd data-fact="chores">
                  <span>{choresText(chores(), readValue(routines()), now(), offsetMinutes)}</span>
                  <span class="kw-creature-opens">
                    {opensLine(shell.keys.chord("creature.chores"), "the chore board")}
                  </span>
                </dd>
                <dt>{sectionWords.memory}</dt>
                <dd data-fact="memory">
                  <span>{memoryLine(noteCount(), inbox())}</span>
                  <span class="kw-creature-opens">
                    {opensLine(shell.keys.chord("creature.memory"), "the memory pane")}
                  </span>
                </dd>
              </dl>
              <h3 class="kw-creature-heading">{sectionWords.remembered}</h3>
              <Show
                when={rememberedRows(world().landmarks, held().slug).length > 0}
                fallback={<p class="kw-creature-shadow-opening">{nothingRemembered}</p>}
              >
                <ul class="kw-creature-remembered" aria-label={sectionWords.remembered}>
                  <For each={rememberedRows(world().landmarks, held().slug)}>
                    {(row) => (
                      <li data-landmark={row.kind}>
                        <time dateTime={row.at}>{dayWord(row.at)}</time>
                        <span>{row.line}</span>
                        <span class="kw-creature-landmark">{row.kind}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <CraftSection
                rows={craft()}
                focused={craftAt()}
                hint={craftHint({
                  next: shell.keys.chord("creature.craft"),
                  edit: shell.keys.chord("creature.craft-edit"),
                  forget: shell.keys.chord("creature.craft-forget"),
                })}
              />
              <h3 class="kw-creature-heading">{sectionWords.shadow}</h3>
              <p class="kw-creature-shadow-opening">{nothingEnforced}</p>
              <ShadowSummary report={report()} />
            </>
          )}
        </Show>
      </Show>
      <Show when={asking("rename")}>
        <DraftLine
          label={renameLabel}
          initial={creature()?.name}
          placeholder={renamePlaceholder}
          onSubmit={rename}
          onCancel={() => setPrompt(undefined)}
        />
      </Show>
      <Show when={asking("skin")}>
        <ChoiceLine
          question={skinQuestion(creature()?.name ?? "")}
          choices={skinChoices()}
          onChoose={(key) => dress(skinChoices()[key] ?? "")}
          onCancel={() => setPrompt(undefined)}
        />
      </Show>
      <Show when={asking("class")}>
        <ChoiceLine
          question={classQuestion(creature()?.name ?? "")}
          choices={classChoices}
          onChoose={(key) =>
            setPrompt({ kind: "model", modelClass: classOfChoice[key] ?? "strong" })
          }
          onCancel={() => setPrompt(undefined)}
        />
      </Show>
      <Show when={asking("model")} keyed>
        {(asked) => (
          <DraftLine
            label={`${asked.modelClass} ${modelLabel}`}
            initial={modelText(creature()?.models[asked.modelClass])}
            placeholder={modelPlaceholder}
            onSubmit={(text) => setModel(asked.modelClass, text)}
            onCancel={() => setPrompt(undefined)}
          />
        )}
      </Show>
      <Show when={card()} keyed>
        {(asked) => (
          <DeleteCard
            name={creature()?.name ?? slug() ?? ""}
            removal={asked.removal}
            keep={asked.keep}
            onKeep={(keep) => void askDelete(keep)}
            onDelete={() => void confirmDelete()}
            onCancel={cancelCard}
          />
        )}
      </Show>
      <Show when={forgetting()} keyed>
        {(plan) => (
          <ForgetCard
            view={forgetCard(plan)}
            onForget={() => void applyCraftForget(plan)}
            onKeep={keepCraft}
          />
        )}
      </Show>
      <NoticeLine text={notice()} />
    </section>
  );
}

interface ShadowSummaryProps {
  report: Reading<KeeperReport> | undefined;
}

function ShadowSummary(props: ShadowSummaryProps) {
  const served = () => readValue(props.report);
  const refused = () => props.report !== undefined && !props.report.ok;
  return (
    <Show
      when={served()}
      fallback={
        <Show when={refused()}>
          <p class="kw-creature-shadow-opening">{noReportRoute}</p>
        </Show>
      }
    >
      {(report) => (
        <Show
          when={report().rows > 0}
          fallback={<p class="kw-creature-shadow-opening">{noAsksAnswered}</p>}
        >
          <>
            <Show when={report().enforced}>
              <p class="kw-creature-shadow-opening">
                {decidedForYouLine(report().promotions ?? [])}
              </p>
            </Show>
            <ul class="kw-creature-shadow" aria-label={sectionWords.shadow}>
              <For each={shadowRows(report())}>
                {(row) => (
                  <li data-class={row.ruleClass}>
                    <span class="kw-creature-class">{row.ruleClass}</span>
                    <span>{shadowClassLine(row)}</span>
                  </li>
                )}
              </For>
            </ul>
            <Show when={(report().calibration ?? []).length > 0}>
              <ul class="kw-creature-shadow" aria-label={sectionWords.calibration}>
                <For each={report().calibration ?? []}>
                  {(entry) => (
                    <li data-class={entry.ruleClass} data-model={entry.model}>
                      <span class="kw-creature-class">{entry.ruleClass}</span>
                      <span>{calibrationLine(entry)}</span>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </>
        </Show>
      )}
    </Show>
  );
}

type GroupedEntry =
  | { kind: "group"; group: ThreadGroup }
  | { kind: "row"; row: ThreadRow; index: number };

export function groupedRows(rows: readonly ThreadRow[]): GroupedEntry[] {
  const entries: GroupedEntry[] = [];
  let group: ThreadGroup | undefined;
  rows.forEach((row, index) => {
    if (row.group !== group) {
      group = row.group;
      entries.push({ kind: "group", group });
    }
    entries.push({ kind: "row", row, index });
  });
  return entries;
}

export function asideOf(row: ThreadRow, now: number): string {
  const parts = [
    row.kind === "conversation" || row.kind === "child" ? undefined : row.kind,
    row.children > 0 ? childrenWord(row.children) : undefined,
    row.costNanos === undefined ? undefined : `$${costWord(row.costNanos)}`,
    row.lastActivityAt === undefined ? undefined : relativeAge(row.lastActivityAt, now),
  ];
  return parts.filter((part): part is string => part !== undefined).join(" · ");
}

export function markOf(state: string): string {
  return state === "working" || state === "waiting" || state === "running" ? "▓" : "░";
}

function stateWordOf(state: string): string {
  return state in threadStateWords ? threadStateWords[state as ThreadState] : state;
}

function workshopText(
  creature: CreatureDetail,
  health: Reading<WorkshopHealthReport> | undefined,
): string {
  if (creature.workshop === "host") return hostWorkshopLine;
  const read = readValue(health);
  return workshopLine(creature.workshop, read?.substrate, read?.health, read?.limitations ?? []);
}

function choresText(
  chores: ReturnType<typeof choresOf>,
  routines: readonly RoutineRow[] | undefined,
  now: number,
  offsetMinutes: number,
): string {
  const next = nextChore(chores);
  return choresLine({
    total: routines?.length ?? 0,
    off: (routines ?? []).filter((row) => row.routine !== null && !row.schedule.enabled).length,
    next:
      next === undefined
        ? undefined
        : { title: next.title, at: timeWord(next.nextAt, now, offsetMinutes) },
  });
}

function modelText(choice: ModelChoice | undefined): string {
  return choice === undefined || choice === "inherit" ? "" : `${choice.provider}/${choice.model}`;
}

function problemOf(reading: Reading<CreatureDetail> | undefined): string | undefined {
  if (reading === undefined) return undefined;
  return reading.ok ? undefined : reading.detail === "" ? noSlugChosen : reading.detail;
}

function readValue<T>(reading: Reading<T> | undefined): T | undefined {
  return reading?.ok ? reading.value : undefined;
}

function slugOfPayload(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("slug" in payload)) return undefined;
  const slug = (payload as { slug: unknown }).slug;
  return typeof slug === "string" ? slug : undefined;
}

function action(
  chords: BindingSpec,
  help: string,
  name: string,
  description: string,
  argument?: { hint: string },
): PaneLocalAction {
  return {
    chords,
    help,
    command: { name, description, ...(argument !== undefined && { argument }) },
  };
}
