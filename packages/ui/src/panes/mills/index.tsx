import "../overview/overview.css";
import "./mills.css";
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { z } from "zod";
import { createTileFillStep, tileFill } from "../../chrome/stamp.ts";
import { EmptyState } from "../empty-state.tsx";
import { keepKeyboardHome } from "../keyboard-home.ts";
import {
  ConfirmLine,
  createCursor,
  createFleetingNotice,
  keepInView,
  NoticeLine,
} from "../overview/rows.tsx";
import { definePane, type KeyHints, type PaneProps } from "../registry.ts";
import {
  acknowledgementRecorded,
  acknowledgementRefused,
  acknowledgementUnserved,
  acknowledgeQuestion,
  alreadyAcknowledged,
  benchHeads,
  benchingLine,
  benchRefused,
  benchServerLine,
  benchTitle,
  benchUnserved,
  columnHeads,
  emptyStateLine,
  keyLegend,
  licenseUnknownLine,
  lookingLine,
  marketUnreported,
  millsTitle,
  modelRowFirst,
  noAcknowledgementNeeded,
  noCreatureLine,
  noCreaturesLine,
  noInventoryLine,
  noReportLine,
  notProbedLine,
  policyHead,
  probedLine,
  profilePointer,
  reportRefused,
  reportUnserved,
  vacantParcelLine,
} from "./copy.ts";
import { type MillsPort, millsPortOf } from "./port.ts";
import {
  benchRows,
  cellsOf,
  type DetailChords,
  type DetailLine,
  hasAnyMill,
  type MillLine,
  millLines,
  millsTally,
  modelDetails,
  needsAcknowledgement,
  placeName,
  policyRows,
  serverDetail,
  serversAt,
} from "./rows.ts";
import {
  type BenchReport,
  type CreaturePolicy,
  isMillsRefusal,
  type MillsRefusal,
  type ModelsReport,
  type ModelTarget,
  type ProbeReport,
} from "./wire.ts";

const millsSpec = z.object({
  kind: z.literal("mills"),
  node: z.string().min(1).optional(),
});

export type MillsSpec = z.output<typeof millsSpec>;

export const profilePaneKind = "creature";

export const millsActions = {
  down: "mills.down",
  up: "mills.up",
  probe: "mills.probe",
  acknowledge: "mills.acknowledge",
  bench: "mills.bench",
  report: "mills.report",
  creature: "mills.creature",
  profile: "mills.profile",
} as const;

export const millsPane = definePane<MillsSpec>({
  kind: "mills",
  heading: "in the mills",
  spec: millsSpec,
  home: "main",
  attire: "house",
  title: (spec) => (spec.node === undefined ? millsTitle : `${millsTitle} · ${spec.node}`),
  emptyState: (keys) => emptyStateLine(keys.chord(millsActions.probe)),
  component: MillsPane,
  summon: {
    action: "mills.summon",
    chords: "none",
    help: "mills pane",
    command: {
      name: "mills",
      description:
        "open the mills pane: every model server on the stead with its models, classes, licenses and cost",
      argument: { hint: "[parcel]" },
    },
    spec: (_shell, argument) => {
      const node = argument?.trim();
      return node === undefined || node === "" ? { kind: "mills" } : { kind: "mills", node };
    },
  },
  localActions: {
    [millsActions.down]: {
      chords: ["j", "down"],
      help: "next row",
      command: { name: "mills-next", description: "move to the next mill or model" },
    },
    [millsActions.up]: {
      chords: ["k", "up"],
      help: "previous row",
      command: { name: "mills-previous", description: "move to the previous mill or model" },
    },
    [millsActions.probe]: {
      chords: "p",
      help: "probe the parcel",
      command: {
        name: "mills-probe",
        description: "probe every mill on the parcel at the cursor and read the inventory again",
      },
    },
    [millsActions.acknowledge]: {
      chords: "a",
      help: "acknowledge the license",
      command: {
        name: "mills-acknowledge",
        description: "acknowledge the non-permissive license of the model at the cursor",
      },
    },
    [millsActions.bench]: {
      chords: "b",
      help: "bench the model",
      command: { name: "mills-bench", description: "run the bench on the model at the cursor" },
    },
    [millsActions.report]: {
      chords: "enter",
      help: "last bench report",
      command: {
        name: "mills-report",
        description: "show or hide the last bench report of the model at the cursor",
      },
    },
    [millsActions.creature]: {
      chords: "c",
      help: "next creature",
      command: {
        name: "mills-creature",
        description: "show the model policy of the next creature",
      },
    },
    [millsActions.profile]: {
      chords: "o",
      help: "open the creature profile",
      command: {
        name: "mills-profile",
        description: "open the profile of the creature whose policy is shown, to change it",
      },
    },
  },
});

type InventoryState = "reading" | ModelsReport | MillsRefusal;

type CreaturesState = "reading" | readonly CreaturePolicy[] | MillsRefusal;

type ModelLine = Extract<MillLine, { kind: "model" }>;

interface Asking {
  readonly line: ModelLine;
  readonly license: string;
}

function MillsPane(props: PaneProps<MillsSpec>) {
  let root: HTMLElement | undefined;
  keepKeyboardHome(
    () => root,
    () => props.focused,
  );
  const port: MillsPort = millsPortOf(props.shell);
  const keys = props.shell.keys;
  const chords: DetailChords = {
    probe: keys.chord(millsActions.probe),
    acknowledge: keys.chord(millsActions.acknowledge),
  };
  const [inventory, setInventory] = createSignal<InventoryState>("reading");
  const [creatures, setCreatures] = createSignal<CreaturesState>("reading");
  const [chosen, setChosen] = createSignal(0);
  const [busy, setBusy] = createSignal<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = createSignal<Asking>();
  const [reports, setReports] = createSignal<Readonly<Record<string, BenchReport>>>({});
  const notice = createFleetingNotice();

  const report = createMemo(() => reportOf(inventory()));
  const refusal = () => refusalOf(inventory());
  const empty = () => {
    const held = report();
    return held !== undefined && !hasAnyMill(held);
  };
  const lines = createMemo(() => {
    const held = report();
    return held === undefined ? [] : millLines(held);
  });
  const cursor = createCursor(() => lines().length);
  const atCursor = (): MillLine | undefined => lines()[cursor.index()];
  const step = createTileFillStep(() => busy().size > 0 || lines().some(isLoading));
  const roster = () => {
    const listed = creatures();
    return listed === "reading" || isMillsRefusal(listed) ? [] : listed;
  };
  const creature = (): CreaturePolicy | undefined => roster()[chosen() % roster().length];

  let placed = props.spec.node === undefined;
  const readInventory = async (): Promise<void> => {
    setInventory(await port.inventory());
    if (placed) return;
    placed = true;
    const home = lines().findIndex(
      (line) =>
        line.kind === "place" &&
        line.place.kind === "parcel" &&
        line.place.node === props.spec.node,
    );
    if (home >= 0) cursor.set(home);
  };
  const readCreatures = async (): Promise<void> => {
    setCreatures(await port.creatures());
  };

  onMount(() => {
    void readInventory();
    void readCreatures();
  });
  onCleanup(
    props.shell.feed.subscribe((batch) => {
      const names = new Set(batch.map(eventName));
      if (names.has("models.changed")) void readInventory();
      if (names.has("creature.changed")) void readCreatures();
    }),
  );

  const marking = async <T,>(marked: readonly string[], work: () => Promise<T>): Promise<T> => {
    setBusy((held) => new Set([...held, ...marked]));
    try {
      return await work();
    } finally {
      setBusy((held) => new Set([...held].filter((key) => !marked.includes(key))));
    }
  };

  const probe = async (line: MillLine | undefined): Promise<void> => {
    const held = report();
    if (line === undefined || held === undefined) return readInventory();
    const place = placeName(line.place);
    const servers = serversAt(held, line.place);
    const readings = await marking(
      lines()
        .filter((other) => other.kind === "server" && servers.includes(other.server))
        .map((other) => other.key),
      () => Promise.all(servers.map((server) => port.probe(server.root))),
    );
    const refused = readings.find(isMillsRefusal);
    notice.say(
      refused === undefined
        ? probedLine(place, readings.filter(isProbeReport))
        : notProbedLine(place, refused.detail),
    );
    await readInventory();
  };

  const acknowledge = (line: ModelLine): void => {
    const { model } = line;
    if (model.license === null) {
      notice.say(licenseUnknownLine(model.id, chords.probe));
    } else if (model.acknowledgedAt != null) {
      notice.say(alreadyAcknowledged(model.id, model.license, model.acknowledgedAt));
    } else if (!needsAcknowledgement(model)) {
      notice.say(noAcknowledgementNeeded(model.license, model.id));
    } else {
      setAsking({ line, license: model.license });
    }
  };

  const confirmAcknowledgement = async (asked: Asking): Promise<void> => {
    setAsking(undefined);
    const reading = await marking([asked.line.key], () =>
      port.acknowledge(targetOf(asked.line), asked.license),
    );
    if (isMillsRefusal(reading)) {
      notice.say(
        reading.refused === "unserved"
          ? acknowledgementUnserved
          : acknowledgementRefused(reading.detail),
      );
      return;
    }
    notice.say(acknowledgementRecorded(asked.license, asked.line.model.id));
    await readInventory();
  };

  const bench = async (line: ModelLine): Promise<void> => {
    notice.say(benchingLine(line.model.id, placeName(line.place)));
    const reading = await marking([line.key], () => port.bench(targetOf(line)));
    if (isMillsRefusal(reading)) {
      notice.say(
        reading.refused === "unserved"
          ? benchUnserved(line.model.id)
          : benchRefused(line.model.id, reading.detail),
      );
      return;
    }
    notice.say(undefined);
    setReports((held) => ({ ...held, [line.key]: reading }));
  };

  const toggleReport = async (line: ModelLine): Promise<void> => {
    if (reports()[line.key] !== undefined) {
      setReports((held) => withoutKey(held, line.key));
      return;
    }
    const reading = await marking([line.key], () => port.lastBench(targetOf(line)));
    if (isMillsRefusal(reading)) {
      notice.say(reading.refused === "unserved" ? reportUnserved : reportRefused(reading.detail));
    } else if (reading === null) {
      notice.say(noReportLine(line.model.id, keys.chord(millsActions.bench)));
    } else {
      setReports((held) => ({ ...held, [line.key]: reading }));
    }
  };

  const onModel = (act: (line: ModelLine) => unknown): void => {
    const line = atCursor();
    if (line?.kind === "model") void act(line);
    else notice.say(modelRowFirst);
  };

  props.onAction((action) => {
    switch (action) {
      case millsActions.down:
        return cursor.move(1);
      case millsActions.up:
        return cursor.move(-1);
      case millsActions.probe:
        return void probe(atCursor());
      case millsActions.acknowledge:
        return onModel(acknowledge);
      case millsActions.bench:
        return onModel(bench);
      case millsActions.report:
        return onModel(toggleReport);
      case millsActions.creature:
        return setChosen((at) => at + 1);
      case millsActions.profile: {
        const shown = creature();
        if (shown !== undefined) props.shell.openPane({ kind: profilePaneKind, slug: shown.slug });
        return;
      }
    }
  });

  return (
    <section class="kw-ov kw-mills" aria-label="mills" tabIndex={-1} ref={root}>
      <Switch>
        <Match when={inventory() === "reading"}>
          <p class="kw-ov-line">{lookingLine}</p>
        </Match>
        <Match when={refusal()}>
          {(refused) => <EmptyState line={noInventoryLine(refused().detail, chords.probe)} />}
        </Match>
        <Match when={empty()}>
          <EmptyState line={millsPane.emptyState(keys)} />
        </Match>
        <Match when={report()}>
          {(held) => (
            <>
              <div class="kw-ov-head">
                <span class="kw-ov-head-lead">{millsTally(held())}</span>
                <span class="kw-ov-head-detail">{keyLegend}</span>
              </div>
              <ColumnHeads />
              <ol class="kw-ov-list kw-mills-list">
                <For each={lines()}>
                  {(line, index) => (
                    <MillRow
                      line={line}
                      cursor={index() === cursor.index()}
                      busy={busy().has(line.key)}
                      step={step()}
                      chords={chords}
                      report={reports()[line.key]}
                      onClick={() => cursor.set(index())}
                    />
                  )}
                </For>
              </ol>
            </>
          )}
        </Match>
      </Switch>
      <Show when={asking()}>
        {(asked) => (
          <ConfirmLine
            question={acknowledgeQuestion(
              asked().license,
              asked().line.model.id,
              placeName(asked().line.place),
            )}
            onConfirm={() => void confirmAcknowledgement(asked())}
            onCancel={() => setAsking(undefined)}
          />
        )}
      </Show>
      <PolicySection creatures={creatures()} creature={creature()} report={report()} keys={keys} />
      <NoticeLine text={notice.text()} />
    </section>
  );
}

function ColumnHeads() {
  return (
    <div class="kw-mills-heads" aria-hidden="true">
      <span />
      <span data-cell="name">{columnHeads.name}</span>
      <span data-cell="health">{columnHeads.health}</span>
      <span data-cell="held">{columnHeads.held}</span>
      <span data-cell="classes">{columnHeads.classes}</span>
      <span data-cell="license">{columnHeads.license}</span>
      <span data-cell="cost">{columnHeads.cost}</span>
    </div>
  );
}

interface MillRowProps {
  readonly line: MillLine;
  readonly cursor: boolean;
  readonly busy: boolean;
  readonly step: number;
  readonly chords: DetailChords;
  readonly report: BenchReport | undefined;
  onClick(): void;
}

function MillRow(props: MillRowProps) {
  const cells = createMemo(() => cellsOf(props.line, props.step, Date.now()));
  const mark = () => (props.busy ? (tileFill[props.step % tileFill.length] ?? "▌") : cells().mark);
  const details = () => detailsOf(props.line, props.cursor, props.chords);
  return (
    <>
      <li
        ref={(row) => keepInView(row, () => props.cursor)}
        class="kw-ov-row kw-mills-row"
        data-kind={props.line.kind}
        data-cursor={props.cursor ? "" : undefined}
        data-tone={cells().tone}
      >
        <button type="button" class="kw-ov-button kw-mills-button" onClick={() => props.onClick()}>
          <span class="kw-ov-mark" aria-hidden="true" data-density={cells().density}>
            {mark()}
          </span>
          <span class="kw-ov-name" data-cell="name">
            {cells().name}
            <Show when={cells().tag}>
              {(tag) => (
                <>
                  {" "}
                  <span class="kw-mills-tag">{tag()}</span>
                </>
              )}
            </Show>
          </span>
          <span data-cell="health">{cells().health}</span>
          <span data-cell="held">{cells().held}</span>
          <span data-cell="classes">{cells().classes}</span>
          <span data-cell="license">{cells().license}</span>
          <span data-cell="cost">{cells().cost}</span>
        </button>
      </li>
      <For each={details()}>
        {(detail) => (
          <p class="kw-ov-sub kw-mills-sub" data-depth={props.line.kind} data-tone={detail.tone}>
            {detail.text}
          </p>
        )}
      </For>
      <Show when={props.report}>{(held) => <BenchTable report={held()} />}</Show>
    </>
  );
}

function BenchTable(props: { report: BenchReport }) {
  const size = () => (props.report.kind === "chat" ? props.report.turns : props.report.rows);
  return (
    <div class="kw-mills-bench">
      <p class="kw-mills-bench-line">
        {benchTitle({
          reference: props.report.reference,
          kind: props.report.kind,
          repeats: props.report.repeats,
          size: size(),
        })}
      </p>
      <p class="kw-mills-bench-line">
        {benchServerLine(
          props.report.fingerprint.kind,
          props.report.fingerprint.version,
          props.report.fingerprint.id,
        )}
      </p>
      <table class="kw-mills-bench-table">
        <thead>
          <tr>
            <th>{benchHeads.measure}</th>
            <th>{benchHeads.mean}</th>
            <th>{benchHeads.range}</th>
          </tr>
        </thead>
        <tbody>
          <For each={benchRows(props.report)}>
            {(row) => (
              <tr>
                <td>{row.measure}</td>
                <td>{row.mean}</td>
                <td>{row.range}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

interface PolicySectionProps {
  readonly creatures: CreaturesState;
  readonly creature: CreaturePolicy | undefined;
  readonly report: ModelsReport | undefined;
  readonly keys: KeyHints;
}

function PolicySection(props: PolicySectionProps) {
  const refused = () => refusalOf(props.creatures);
  const none = () => Array.isArray(props.creatures) && props.creatures.length === 0;
  return (
    <section class="kw-mills-policy" aria-label="model policy">
      <Switch>
        <Match when={refused()}>
          {(refusal) => <p class="kw-ov-line">{noCreaturesLine(refusal().detail)}</p>}
        </Match>
        <Match when={none()}>
          <p class="kw-ov-line">{noCreatureLine}</p>
        </Match>
        <Match when={props.creature}>
          {(shown) => (
            <>
              <div class="kw-ov-head">
                <span class="kw-ov-head-lead">
                  {policyHead(shown().name, props.keys.chord(millsActions.creature))}
                </span>
              </div>
              <ol class="kw-mills-policy-rows">
                <For each={policyRows(shown(), props.report)}>
                  {(row) => (
                    <li class="kw-mills-policy-row" data-inherited={row.inherited ? "" : undefined}>
                      <span data-cell="class">{row.modelClass}</span>
                      <span data-cell="choice">{row.choice}</span>
                      <span data-cell="where">{row.where}</span>
                    </li>
                  )}
                </For>
              </ol>
              <p class="kw-ov-line">
                {profilePointer(shown().name, props.keys.chord(millsActions.profile))}
              </p>
            </>
          )}
        </Match>
      </Switch>
    </section>
  );
}

function detailsOf(line: MillLine, cursor: boolean, chords: DetailChords): DetailLine[] {
  switch (line.kind) {
    case "place":
      if (line.servers.length > 0) return [];
      return [
        {
          text: line.place.kind === "parcel" ? vacantParcelLine : marketUnreported,
          tone: undefined,
        },
      ];
    case "server": {
      const detail = serverDetail(line.server, line.place);
      return detail === undefined ? [] : [detail];
    }
    case "model":
      return cursor ? modelDetails(line.model, chords) : [];
  }
}

function reportOf(state: InventoryState): ModelsReport | undefined {
  return state === "reading" || isMillsRefusal(state) ? undefined : state;
}

function refusalOf(state: InventoryState | CreaturesState): MillsRefusal | undefined {
  return isMillsRefusal(state) ? state : undefined;
}

function isLoading(line: MillLine): boolean {
  if (line.kind === "server") return line.server.health.state === "loading";
  return line.kind === "model" && line.model.health.state === "loading";
}

function isProbeReport(reading: ProbeReport | MillsRefusal): reading is ProbeReport {
  return !isMillsRefusal(reading);
}

function targetOf(line: ModelLine): ModelTarget {
  return { endpoint: line.server.root, model: line.model.id };
}

function eventName(envelope: { readonly type: string }): string {
  return envelope.type;
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record;
  return rest;
}
