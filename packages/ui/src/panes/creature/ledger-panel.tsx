import type { CreatureLedgerEntry } from "@keywork-app/protocol";
import { createMemo, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import { observeSize } from "../../surfaces/runtime/realm.ts";
import { keepInView } from "../overview/rows.tsx";
import { loadSkin } from "../stead/habitat-render.ts";
import {
  emptyLedgerLine,
  formWord,
  ledgerLabel,
  noLedgerLine,
  readingLedgerLine,
  signGlyphs,
  spokenAge,
  spokenRow,
} from "./copy.ts";
import {
  conversationStandingOf,
  headCount,
  type LedgerSummary,
  metaOf,
  projectOf,
  signOf,
  spansProjects,
  summaryLines,
  unseen,
  waitsOnKeeper,
} from "./ledger.ts";
import type { LedgerReading } from "./ledger-book.ts";
import { PortraitView } from "./portrait.tsx";

export interface LedgerPanelProps {
  readonly name: string;
  readonly skin: string;
  readonly hue: number;
  readonly rows: readonly CreatureLedgerEntry[];
  readonly reading: LedgerReading;
  readonly summary: LedgerSummary;
  readonly cursor: number | undefined;
  readonly now: number;
  readonly hint: string | undefined;
  onPress(index: number): void;
  onPoint(index: number): void;
}

export const roomyPane = { width: 560, height: 600 } as const;

const largePortrait = 2;
const smallPortrait = 1;

export function LedgerPanel(props: LedgerPanelProps) {
  const empty = (): boolean => props.reading.kind === "read" && props.rows.length === 0;
  const [roomy, setRoomy] = createSignal(false);
  const measure = (panel: HTMLElement): void => {
    const pane = panel.parentElement ?? panel;
    const fit = (): void => {
      setRoomy(pane.clientWidth >= roomyPane.width && pane.clientHeight >= roomyPane.height);
    };
    fit();
    onCleanup(observeSize(pane, fit));
  };
  return (
    <div class="kw-ledger-panel" data-empty={empty() ? "" : undefined} ref={measure}>
      <Show when={!empty()} fallback={<RestingCreature {...props} />}>
        <header class="kw-ledger-head">
          <PortraitView
            skin={props.skin}
            hueStop={props.hue}
            name={props.name}
            size={roomy() ? largePortrait : smallPortrait}
          />
          <div class="kw-ledger-identity">
            <p class="kw-ledger-title">
              <span class="kw-creature-name">{props.name}</span>
              <FormOf skin={props.skin} />
              <span
                class="kw-ledger-count"
                data-waiting={props.summary.waiting > 0 ? "" : undefined}
              >
                {headCount(props.summary)}
              </span>
            </p>
            <For each={summaryLines(props.summary)}>
              {(line) => <p class="kw-ledger-summary">{line}</p>}
            </For>
          </div>
        </header>
        <Switch>
          <Match when={props.reading.kind === "reading" && props.rows.length === 0}>
            <p class="kw-ledger-quiet" role="status">
              {readingLedgerLine}
            </p>
          </Match>
          <Match when={props.reading.kind === "refused" ? props.reading : undefined}>
            {(refused) => (
              <p class="kw-ledger-quiet" role="status">
                {refused().kept ? refused().detail : noLedgerLine}
              </p>
            )}
          </Match>
          <Match when={props.rows.length > 0}>
            <LedgerList {...props} />
          </Match>
        </Switch>
      </Show>
      <Show when={props.hint}>{(hint) => <p class="kw-ledger-hint">{hint()}</p>}</Show>
    </div>
  );
}

function LedgerList(props: LedgerPanelProps) {
  const named = createMemo(() => spansProjects(props.rows));
  return (
    <ol class="kw-ledger" aria-label={ledgerLabel(props.name)}>
      <For each={props.rows}>
        {(entry, index) => (
          <LedgerRow
            entry={entry}
            project={named() ? projectOf(entry.directory) : undefined}
            cursor={props.cursor === index()}
            now={props.now}
            onPress={() => props.onPress(index())}
            onPoint={() => props.onPoint(index())}
          />
        )}
      </For>
    </ol>
  );
}

interface LedgerRowProps {
  readonly entry: CreatureLedgerEntry;
  readonly project: string | undefined;
  readonly cursor: boolean;
  readonly now: number;
  onPress(): void;
  onPoint(): void;
}

function LedgerRow(props: LedgerRowProps) {
  const sign = () => signOf(props.entry);
  const spoken = () =>
    spokenRow({
      sign: sign(),
      title: props.entry.title,
      project: props.project,
      answer: props.entry.answer,
      conversation: conversationStandingOf(props.entry),
      age:
        props.entry.state === "running"
          ? undefined
          : spokenAge(props.entry.closedAt ?? props.entry.openedAt, props.now),
    });
  return (
    <li
      ref={(row) => keepInView(row, () => props.cursor)}
      class="kw-ledger-row"
      data-sign={sign()}
      data-cursor={props.cursor ? "" : undefined}
      data-unseen={unseen(props.entry) ? "" : undefined}
      data-waiting={waitsOnKeeper(props.entry) ? "" : undefined}
      data-conversation={props.entry.conversation?.state}
    >
      <button
        type="button"
        class="kw-ledger-button"
        aria-label={spoken()}
        aria-current={props.cursor ? "true" : undefined}
        onClick={() => props.onPress()}
        onPointerMove={(event) => {
          if (event.movementX !== 0 || event.movementY !== 0) props.onPoint();
        }}
        onFocus={() => props.onPoint()}
      >
        <span class="kw-ledger-sign" aria-hidden="true">
          {signGlyphs[sign()]}
        </span>
        <span class="kw-ledger-words">{props.entry.title}</span>
        <span class="kw-ledger-meta">{metaOf(props.entry, props.now, props.project)}</span>
      </button>
    </li>
  );
}

function RestingCreature(props: LedgerPanelProps) {
  return (
    <div class="kw-ledger-resting">
      <PortraitView skin={props.skin} hueStop={props.hue} name={props.name} />
      <p class="kw-ledger-title">
        <span class="kw-creature-name">{props.name}</span>
        <FormOf skin={props.skin} />
      </p>
      <p class="kw-ledger-quiet">{emptyLedgerLine(props.name)}</p>
    </div>
  );
}

function FormOf(props: { readonly skin: string }) {
  const form = (): string | undefined => {
    const loaded = loadSkin(props.skin);
    return loaded.ok ? formWord(loaded.skin.displayName) : undefined;
  };
  return <Show when={form()}>{(word) => <span class="kw-ledger-form">· {word()}</span>}</Show>;
}
