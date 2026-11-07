import { paletteHeading } from "./copy.ts";
import "../overview/overview.css";
import "./workshop.css";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { createStore } from "solid-js/store";
import { z } from "zod";
import type { ArgumentChoice } from "../../palette/commands.ts";
import { useKeyboardScope } from "../../shell/keyboard-claim.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import { ChoiceLine, DraftLine, NoticeLine } from "../overview/rows.tsx";
import { definePane, type KeyHints, type PaneProps } from "../registry.ts";
import { houseOffsetMinutes } from "../stead/habitat.ts";
import {
  displayDarkLine,
  elsewhereHeading,
  emptyStateLine,
  filesRefusedLine,
  frameAlt,
  noDisplayLine,
  noThreadToMirror,
  noWorkshopFor,
  paneName,
  placeLine,
  raisedLine,
  raisePlaceholder,
  raisePrompt,
  readingLine,
  refusalLine,
  removeChoices,
  removedLine,
  removeQuestion,
  sealStep,
  stateWords,
  substrateMarks,
  substrateWords,
  typePlaceholder,
  typePrompt,
  workshopTitle,
} from "./copy.ts";
import {
  type CreatureHome,
  type DisplayFrame,
  isWorkshopRefusal,
  servesSnapshots,
  type WorkshopDetailRecord,
  type WorkshopHealth,
  type WorkshopRecord,
  type WorkshopRefusal,
  workshopChangeOf,
  workshopPortOf,
} from "./port.ts";
import {
  closedWindow,
  elsewhereLines,
  folderUrlOf,
  frameUrl,
  headOf,
  limitsOf,
  type NodeYard,
  neighbourOf,
  newestThread,
  pickWorkshop,
  type Room,
  roomsOf,
  shownWorkshop,
  type TypedRun,
  threadsOf,
  type Watching,
  type WorkshopFacts,
  type WorkshopKeys,
  yardOf,
} from "./rooms.ts";

const workshopSpec = z.object({
  kind: z.literal("workshop"),
  creature: z.string().min(1).optional(),
});

export type WorkshopSpec = z.output<typeof workshopSpec>;

export const healthEveryMs = 10_000;

export const clockEveryMs = 30_000;

export const workshopPane = definePane<WorkshopSpec>({
  kind: "workshop",
  heading: paletteHeading,
  spec: workshopSpec,
  home: "main",
  attire: "work",
  title: (spec) => workshopTitle(spec.creature),
  emptyState: (keys) => emptyStateLine(keys.chord("workshop.raise")),
  component: WorkshopPane,
  summon: {
    action: "workshop.summon",
    chords: "leader shift+o",
    help: "a creature's workshop",
    command: {
      name: "workshop",
      description:
        "look into a creature's workshop: substrate and health, display, terminal, files, egress, brokers",
      argument: { hint: "[creature]", choices: () => creatureChoices() },
    },
    spec: (_shell, creature) => specFor(creature),
  },
  localActions: {
    "workshop.start": {
      chords: "s",
      help: "start the workshop",
      command: { name: "workshop-start", description: "start this creature's workshop" },
    },
    "workshop.stop": {
      chords: "shift+s",
      help: "stop it, disk kept",
      command: { name: "workshop-stop", description: "stop this workshop with its disk kept" },
    },
    "workshop.display": {
      chords: "d",
      help: "open or close the window on its display",
      command: {
        name: "workshop-display",
        description: "watch this workshop's display, view only",
      },
    },
    "workshop.files": {
      chords: "f",
      help: "open its files",
      command: { name: "workshop-files", description: "open this workshop's working directory" },
    },
    "workshop.terminal": {
      chords: "t",
      help: "mirror the engine's bash in it",
      command: {
        name: "workshop-terminal",
        description: "open a terminal mirroring the newest thread in this workshop",
      },
    },
    "workshop.raise": {
      chords: "r",
      help: "raise a workshop",
      command: {
        name: "workshop-raise",
        description: "raise a workshop for a creature: sealed when the node can, bare otherwise",
      },
    },
    "workshop.remove": {
      chords: "x",
      help: "remove the workshop",
      command: {
        name: "workshop-remove",
        description: "remove this workshop, keeping or wiping its disk",
      },
    },
    "workshop.health": {
      chords: "h",
      help: "read its health again",
      command: {
        name: "workshop-health",
        description: "read this workshop's health from the node",
      },
    },
    "workshop.next": {
      chords: "]",
      help: "the next workshop on this node",
      command: { name: "workshop-next", description: "show the next workshop on this node" },
    },
    "workshop.previous": {
      chords: "[",
      help: "the previous workshop on this node",
      command: {
        name: "workshop-previous",
        description: "show the previous workshop on this node",
      },
    },
  },
  adornments: (spec) => ({ modeWord: modeWordOf(spec.creature) }),
});

const [knownWorkshops, setKnownWorkshops] = createSignal<readonly WorkshopRecord[]>([]);

export { knownWorkshops };

export function rememberWorkshops(records: readonly WorkshopRecord[]): void {
  setKnownWorkshops(records);
}

export function specFor(creature: string | undefined): WorkshopSpec {
  return creature === undefined || creature === ""
    ? { kind: "workshop" }
    : { kind: "workshop", creature };
}

export function keysOf(keys: KeyHints): WorkshopKeys {
  return {
    start: keys.chord("workshop.start"),
    stop: keys.chord("workshop.stop"),
    display: keys.chord("workshop.display"),
    files: keys.chord("workshop.files"),
    terminal: keys.chord("workshop.terminal"),
    next: keys.chord("workshop.next"),
    previous: keys.chord("workshop.previous"),
  };
}

type Yard =
  | { readonly kind: "reading" }
  | {
      readonly kind: "read";
      readonly records: readonly WorkshopRecord[];
      readonly homes: readonly CreatureHome[] | undefined;
    }
  | { readonly kind: "refused"; readonly refusal: WorkshopRefusal };

interface Notice {
  readonly text: string;
  readonly tone?: "error" | undefined;
}

type Asking = "raise" | "remove" | "type";

function WorkshopPane(props: PaneProps<WorkshopSpec>) {
  const keyboard = useKeyboardScope();
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const port = workshopPortOf(props.shell.host, props.shell.workspace);
  const offsetMinutes = houseOffsetMinutes();
  const [yard, setYard] = createSignal<Yard>({ kind: "reading" });
  const [healths, setHealths] = createStore<Record<string, WorkshopHealth>>({});
  const [details, setDetails] = createStore<Record<string, WorkshopDetailRecord>>({});
  const [typed, setTyped] = createSignal<TypedRun>();
  const [watching, setWatching] = createSignal<Watching>(closedWindow);
  const [notice, setNotice] = createSignal<Notice>();
  const [asking, setAsking] = createSignal<Asking>();
  const [served, setServed] = createSignal<ReadonlySet<string>>(new Set());
  const snapshotsServed = () => servesSnapshots(served());
  const detailServed = () => served().has("readWorkshop");
  const [now, setNow] = createSignal(Date.now());
  let watcher: AbortController | undefined;

  const nodeYard = createMemo((): NodeYard => {
    const held = yard();
    return held.kind === "read" ? yardOf(held.records, held.homes) : { ours: [], elsewhere: [] };
  });
  const ours = (): readonly WorkshopRecord[] => nodeYard().ours;
  const current = createMemo(() =>
    shownWorkshop(nodeYard(), props.spec.creature, props.shell.companion?.floating()),
  );
  const elsewhere = createMemo(() => elsewhereLines(nodeYard(), current(), offsetMinutes));
  const threads = createMemo(() => {
    const workshop = current();
    return workshop === undefined
      ? []
      : threadsOf(props.shell.store.state.summaries, workshop.creature);
  });
  const keys = createMemo(() => keysOf(props.shell.keys));
  const facts = (workshop: WorkshopRecord): WorkshopFacts => ({
    workshop,
    health: healths[workshop.id],
    detail: details[workshop.id],
    typed: typed(),
    watching: watching(),
    threads: threads(),
    snapshotsServed: snapshotsServed(),
    keys: keys(),
    now: now(),
    offsetMinutes,
  });
  const place = (workshop: WorkshopRecord): string => {
    const index = ours().findIndex((record) => record.id === workshop.id);
    return index === -1 ? "" : placeLine(index, ours().length, keys());
  };
  const emptyLine = (): string =>
    props.spec.creature === undefined
      ? workshopPane.emptyState(props.shell.keys)
      : noWorkshopFor(props.spec.creature, props.shell.keys.chord("workshop.raise"));

  const say = (text: string, tone?: "error"): void => {
    setNotice({ text, tone });
  };
  const stopAsking = (): void => {
    setAsking(undefined);
    keyboard?.returnHome();
  };
  const refuse = (verb: string, refusal: WorkshopRefusal): void =>
    say(refusalLine(verb, refusal), "error");
  const upsert = (record: WorkshopRecord): void => {
    setYard((held) => yardWith(held, record));
  };
  const drop = (id: string): void => {
    setYard((held) => yardWithout(held, id));
  };

  const readYard = async (): Promise<void> => {
    const [listed, homes] = await Promise.all([port.list(), port.homes()]);
    setYard(
      isWorkshopRefusal(listed)
        ? { kind: "refused", refusal: listed }
        : { kind: "read", records: listed, homes: isWorkshopRefusal(homes) ? undefined : homes },
    );
  };
  const readHomes = async (): Promise<void> => {
    const homes = await port.homes();
    if (!isWorkshopRefusal(homes)) setYard((held) => yardHoming(held, homes));
  };
  const readHealth = async (id: string): Promise<void> => {
    const report = await port.health(id);
    if (isWorkshopRefusal(report)) return refuse("read its health", report);
    setHealths(id, report.health);
  };
  const readDetail = async (id: string): Promise<void> => {
    const read = await port.detail(id);
    if (!isWorkshopRefusal(read)) setDetails(id, read);
  };
  const start = async (workshop: WorkshopRecord): Promise<void> => {
    const started = await port.start(workshop.id);
    if (isWorkshopRefusal(started)) return refuse("start it", started);
    setNotice(undefined);
    upsert(started);
  };
  const stop = async (workshop: WorkshopRecord): Promise<void> => {
    const stopped = await port.stop(workshop.id);
    if (isWorkshopRefusal(stopped)) return refuse("stop it", stopped);
    setNotice(undefined);
    closeWindow();
    upsert(stopped);
  };
  const closeWindow = (): void => {
    watcher?.abort();
    watcher = undefined;
    setWatching(closedWindow);
  };
  const openWindow = (workshop: WorkshopRecord): void => {
    const controller = new AbortController();
    watcher = controller;
    setWatching({ phase: "opening" });
    port.watch(
      workshop.id,
      {
        onFrame: (frame: DisplayFrame) => setWatching({ phase: "watching", frame }),
        onEnd: (end) => {
          watcher = undefined;
          setWatching(
            end.kind === "ended"
              ? { phase: "ended", detail: end.detail }
              : { phase: "refused", error: end.refusal.error },
          );
        },
      },
      controller.signal,
    );
  };
  const toggleWindow = (workshop: WorkshopRecord): void => {
    if (watcher !== undefined) closeWindow();
    else if (!workshop.display) say(noDisplayLine(workshop.substrate));
    else if (workshop.state !== "running") say(displayDarkLine(keys().start));
    else {
      setNotice(undefined);
      openWindow(workshop);
    }
  };
  const openFiles = (workshop: WorkshopRecord): void => {
    if (workshop.substrate !== "host") {
      say(filesRefusedLine(workshop.substrate));
      return;
    }
    props.shell.host
      .openExternal(folderUrlOf(workshop.workdir))
      .catch((cause: unknown) =>
        refuse("open its files", { refused: "failed", error: messageOf(cause) }),
      );
  };
  const openTerminal = (workshop: WorkshopRecord): void => {
    const terminal = details[workshop.id]?.terminal;
    if (terminal === undefined) mirrorTerminal(workshop);
    else if (!terminal.allowed) {
      refuse("type into it", { refused: "forbidden", error: terminal.reason });
    } else setAsking("type");
  };
  const mirrorTerminal = (workshop: WorkshopRecord): void => {
    const thread = newestThread(threads());
    if (thread === undefined) say(noThreadToMirror(workshop.creature));
    else props.shell.openPane({ kind: "terminal", mode: "mirror", sessionId: thread.id });
  };
  const type = async (workshop: WorkshopRecord, command: string): Promise<void> => {
    const ran = await port.exec(workshop.id, command);
    if (isWorkshopRefusal(ran)) return refuse("run it in the workshop", ran);
    setNotice(undefined);
    setTyped({ command, run: ran });
    void readDetail(workshop.id);
  };
  const raise = async (creature: string): Promise<void> => {
    const raised = await port.raise(creature);
    if (isWorkshopRefusal(raised)) return refuse(`raise a workshop for ${creature}`, raised);
    upsert(raised);
    say(raisedLine(raised));
    props.shell.rebind(props.id, specFor(raised.creature));
  };
  const remove = async (workshop: WorkshopRecord, keepDisk: boolean): Promise<void> => {
    const removed = await port.remove(workshop.id, keepDisk);
    if (isWorkshopRefusal(removed)) return refuse("remove it", removed);
    closeWindow();
    drop(workshop.id);
    say(removedLine(removed));
  };
  const stepTo = (workshop: WorkshopRecord, step: 1 | -1): void => {
    const next = neighbourOf(ours(), workshop, step);
    if (next !== undefined) props.shell.rebind(props.id, specFor(next.creature));
  };

  onMount(() => {
    void readYard();
    void port.served().then(setServed);
    const clock = setInterval(() => setNow(Date.now()), clockEveryMs);
    onCleanup(() => clearInterval(clock));
    onCleanup(
      props.shell.feed.subscribe((batch) => {
        if (batch.some(changesHomes)) void readHomes();
        for (const envelope of batch) {
          const change = workshopChangeOf(envelope);
          if (change === undefined) continue;
          if (change.change === "removed") drop(change.workshop.id);
          else upsert(change.workshop);
        }
      }),
    );
  });
  onCleanup(() => watcher?.abort());

  createEffect(() => rememberWorkshops([...nodeYard().ours, ...nodeYard().elsewhere]));

  createEffect(() => {
    const first = current();
    if (props.spec.creature === undefined && first !== undefined) {
      props.shell.rebind(props.id, specFor(first.creature));
    }
  });

  createEffect(
    on(
      () => [current(), detailServed()] as const,
      ([workshop, detailed], previous) => {
        if (workshop?.id !== previous?.[0]?.id) {
          closeWindow();
          setTyped(undefined);
        }
        if (workshop === undefined) return;
        const read = (): void => {
          void readHealth(workshop.id);
          if (detailed) void readDetail(workshop.id);
        };
        read();
        const timer = setInterval(read, healthEveryMs);
        onCleanup(() => clearInterval(timer));
      },
    ),
  );

  props.onAction((action) => {
    const workshop = current();
    switch (action) {
      case "workshop.raise":
        return props.spec.creature === undefined
          ? setAsking("raise")
          : void raise(props.spec.creature);
      case "workshop.health":
        return workshop === undefined ? undefined : void readHealth(workshop.id);
      case "workshop.next":
        return workshop === undefined ? undefined : stepTo(workshop, 1);
      case "workshop.previous":
        return workshop === undefined ? undefined : stepTo(workshop, -1);
    }
    if (workshop === undefined) return;
    switch (action) {
      case "workshop.start":
        return void start(workshop);
      case "workshop.stop":
        return void stop(workshop);
      case "workshop.display":
        return toggleWindow(workshop);
      case "workshop.files":
        return openFiles(workshop);
      case "workshop.terminal":
        return openTerminal(workshop);
      case "workshop.remove":
        return setAsking("remove");
    }
  });

  return (
    <section
      class="kw-workshop"
      aria-label={paneName}
      tabIndex={-1}
      ref={root}
      data-substrate={current()?.substrate}
      data-state={current()?.state}
      data-health={healthOf(current(), healths)}
    >
      <Switch>
        <Match when={yard().kind === "reading"}>
          <p class="kw-workshop-note">{readingLine}</p>
        </Match>
        <Match when={refusedYard(yard())}>
          {(refusal) => (
            <p class="kw-workshop-note" data-tone="error">
              {refusalLine("read the workshops on this node", refusal())}
            </p>
          )}
        </Match>
        <Match when={current()}>
          {(workshop) => <WorkshopRooms facts={facts(workshop())} place={place(workshop())} />}
        </Match>
        <Match when={yard().kind === "read"}>
          <EmptyState line={emptyLine()} />
        </Match>
      </Switch>
      <Show when={asking() === "raise"}>
        <DraftLine
          label={raisePrompt}
          placeholder={raisePlaceholder}
          onSubmit={(slug) => {
            stopAsking();
            if (slug !== "") void raise(slug);
          }}
          onCancel={stopAsking}
        />
      </Show>
      <Show when={asking() === "type" ? current() : undefined}>
        {(workshop) => (
          <DraftLine
            label={typePrompt}
            placeholder={typePlaceholder}
            onSubmit={(command) => {
              const chosen = workshop();
              stopAsking();
              if (command !== "") void type(chosen, command);
            }}
            onCancel={stopAsking}
          />
        )}
      </Show>
      <Show when={asking() === "remove" ? current() : undefined}>
        {(workshop) => (
          <ChoiceLine
            question={removeQuestion(workshop().creature)}
            choices={removeChoices}
            onChoose={(key) => {
              const chosen = workshop();
              stopAsking();
              void remove(chosen, key === "k");
            }}
            onCancel={stopAsking}
          />
        )}
      </Show>
      <Show when={elsewhere().length > 0}>
        <section class="kw-workshop-elsewhere" data-room="elsewhere">
          <h3 class="kw-workshop-elsewhere-name">{elsewhereHeading}</h3>
          <ul class="kw-workshop-elsewhere-list">
            <For each={elsewhere()}>{(line) => <li class="kw-workshop-line">{line}</li>}</For>
          </ul>
        </section>
      </Show>
      <NoticeLine text={notice()?.text} tone={notice()?.tone} />
    </section>
  );
}

interface WorkshopRoomsProps {
  readonly facts: WorkshopFacts;
  readonly place: string;
}

function WorkshopRooms(props: WorkshopRoomsProps) {
  const limits = createMemo(() => limitsOf(props.facts));
  const rooms = createMemo(() => roomsOf(props.facts));
  return (
    <>
      <header class="kw-workshop-head">
        <span class="kw-workshop-lead">{headOf(props.facts)}</span>
        <Show when={props.place !== ""}>
          <span class="kw-workshop-place">{props.place}</span>
        </Show>
      </header>
      <Show when={limits().length > 0}>
        <ul class="kw-workshop-limits">
          <For each={limits()}>
            {(limit) => (
              <li class="kw-workshop-limit" data-step={limit === sealStep ? "" : undefined}>
                {limit}
              </li>
            )}
          </For>
        </ul>
      </Show>
      <For each={rooms()}>{(room) => <RoomView room={room} facts={props.facts} />}</For>
    </>
  );
}

interface RoomViewProps {
  readonly room: Room;
  readonly facts: WorkshopFacts;
}

function RoomView(props: RoomViewProps) {
  const frame = (): DisplayFrame | undefined =>
    props.room.name === "display" && props.facts.watching.phase === "watching"
      ? props.facts.watching.frame
      : undefined;
  return (
    <section class="kw-workshop-room" data-room={props.room.name}>
      <h3 class="kw-workshop-room-name">{props.room.name}</h3>
      <div class="kw-workshop-room-body">
        <Switch>
          <Match when={asLines(props.room)}>
            {(room) => (
              <>
                <Show when={frame()}>
                  {(held) => (
                    <img class="kw-workshop-frame" alt={frameAlt} src={frameUrl(held())} />
                  )}
                </Show>
                <For each={room().lines}>
                  {(line) => (
                    <p class="kw-workshop-line" data-tone={lineTone(room(), props.facts)}>
                      {line}
                    </p>
                  )}
                </For>
              </>
            )}
          </Match>
          <Match when={asThreads(props.room)}>
            {(room) => (
              <>
                <p class="kw-workshop-line">{room().lead}</p>
                <Show when={room().rows.length > 0}>
                  <ul class="kw-workshop-threads">
                    <For each={room().rows}>
                      {(row) => (
                        <li class="kw-workshop-thread" data-state={row.state}>
                          <span class="kw-workshop-thread-state">{row.state}</span>
                          <span class="kw-workshop-thread-title">{row.title}</span>
                          <span class="kw-workshop-thread-time">{row.time}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <p class="kw-workshop-line" data-tone="quiet">
                  {room().note}
                </p>
                <For each={room().log}>
                  {(line) => (
                    <p class="kw-workshop-line" data-tone="quiet">
                      {line}
                    </p>
                  )}
                </For>
                <Show when={room().output.length > 0}>
                  <pre class="kw-workshop-output">{room().output.join("\n")}</pre>
                </Show>
              </>
            )}
          </Match>
          <Match when={asTable(props.room)}>
            {(room) => (
              <dl class="kw-workshop-table">
                <For each={room().rows}>
                  {([label, value]) => (
                    <>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </>
                  )}
                </For>
              </dl>
            )}
          </Match>
        </Switch>
      </div>
    </section>
  );
}

function creatureChoices(): readonly ArgumentChoice[] {
  return knownWorkshops().map((record) => ({
    value: record.creature,
    description: `${substrateWords[record.substrate]} · ${stateWords[record.state]}`,
  }));
}

function modeWordOf(creature: string | undefined): string | undefined {
  const record = pickWorkshop(knownWorkshops(), creature);
  return record === undefined ? undefined : substrateMarks[record.substrate];
}

function yardWith(yard: Yard, record: WorkshopRecord): Yard {
  const records = yard.kind === "read" ? yard.records : [];
  const known = records.some((held) => held.id === record.id);
  return {
    kind: "read",
    homes: yard.kind === "read" ? yard.homes : undefined,
    records: known
      ? records.map((held) => (held.id === record.id ? record : held))
      : [...records, record],
  };
}

function yardWithout(yard: Yard, id: string): Yard {
  if (yard.kind !== "read") return yard;
  return { ...yard, records: yard.records.filter((held) => held.id !== id) };
}

function yardHoming(yard: Yard, homes: readonly CreatureHome[]): Yard {
  return yard.kind === "read" ? { ...yard, homes } : yard;
}

function changesHomes(envelope: { readonly type: string; readonly payload: unknown }): boolean {
  if (envelope.type === "creature.changed") return true;
  return workshopChangeOf(envelope)?.change === "created";
}

function refusedYard(yard: Yard): WorkshopRefusal | undefined {
  return yard.kind === "refused" ? yard.refusal : undefined;
}

function healthOf(
  workshop: WorkshopRecord | undefined,
  healths: Record<string, WorkshopHealth>,
): WorkshopHealth | undefined {
  return workshop === undefined ? undefined : healths[workshop.id];
}

function lineTone(room: Room, facts: WorkshopFacts): "live" | "error" | undefined {
  if (room.name !== "display") return undefined;
  switch (facts.watching.phase) {
    case "watching":
      return "live";
    case "refused":
      return "error";
    default:
      return undefined;
  }
}

function asLines(room: Room): Extract<Room, { kind: "lines" }> | undefined {
  return room.kind === "lines" ? room : undefined;
}

function asThreads(room: Room): Extract<Room, { kind: "threads" }> | undefined {
  return room.kind === "threads" ? room : undefined;
}

function asTable(room: Room): Extract<Room, { kind: "table" }> | undefined {
  return room.kind === "table" ? room : undefined;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
