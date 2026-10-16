import type { SessionProjection, ToolRun } from "@keywork-app/client";
import { createMemo, For, Show } from "solid-js";
import { arcHueRank, botNamed } from "../../chrome/identity.ts";
import { hueStop } from "../../chrome/pane-frame.tsx";
import { stampGlyph } from "../../chrome/stamp.ts";
import { sessionName } from "../../chrome/telemetry.ts";
import {
  type ContextLevel,
  contextLevelOf,
  contextLevelOfReport,
} from "../../instruments/context.ts";
import { ContextGauge } from "../../instruments/gauge.tsx";
import { type AskChords, type AskPick, answerLabel, askOffers } from "../../page/ask-card.tsx";
import { askingRun } from "../../shell/answer-ask.ts";
import { glossOf, kindMarks, type NeedsYouItem } from "../../shell/needs-you.ts";
import type { Theme } from "../../theme/schema.ts";
import { keepInView } from "../overview/rows.tsx";
import type { ShellSeams } from "../registry.ts";
import { swatchesOf } from "../themes/index.tsx";
import { costOf } from "../tree/index.tsx";
import { currentStep, type DeskRow, rowAge, sessionOfRow } from "./desk.ts";

export interface DeskRowProps {
  row: DeskRow;
  shell: ShellSeams;
  cursor: boolean;
  step: number;
  keys: AskChords;
  onPick(): void;
  onAnswer(pick: AskPick): void;
}

export function DeskRowView(props: DeskRowProps) {
  const facts = createMemo(() => sessionFacts(props.shell, localSession(props.row, props.shell)));
  const quiet = () => props.shell.quiet?.has(facts()?.id) === true;
  const tail = () => tailOf(props.row, facts());
  const asking = () => (props.cursor ? askOnRow(props.row, props.shell) : undefined);
  return (
    <li
      class="kw-desk-row"
      data-tone={toneOf(props.row)}
      data-cursor={props.cursor ? "" : undefined}
      style={{ "--kw-arc-hue": arcHue(facts()?.hueRank) }}
      ref={(row) => keepInView(row, () => props.cursor)}
    >
      <Show when={props.row.kind === "waiting" ? props.row.heading : undefined}>
        {(workspace) => <span class="kw-desk-workspace">{workspace()}</span>}
      </Show>
      <button type="button" class="kw-desk-head" onClick={() => props.onPick()}>
        <span class="kw-desk-stamp" aria-hidden="true">
          {stampOf(props.row, props.step)}
        </span>
        <span class="kw-desk-title">
          <Show when={quiet()}>
            <span class="kw-desk-quiet" title="quiet">
              »
            </span>
          </Show>
          <span class="kw-desk-name">{nameOf(props.row, facts(), props.shell)}</span>
          <Show when={facts()} fallback={<Elsewhere row={props.row} shell={props.shell} />}>
            {(known) => <Where facts={known()} />}
          </Show>
        </span>
        <span class="kw-desk-facts">
          <Show when={facts()?.context}>
            {(level) => <ContextGauge level={level()} style="steps" />}
          </Show>
          <Show when={facts()?.cost}>{(cost) => <span class="kw-desk-cost">{cost()}</span>}</Show>
          <span class="kw-desk-age">{rowAge(props.row)}</span>
        </span>
      </button>
      <Show when={tail()}>
        {(line) => (
          <span class="kw-desk-tail">
            <span class="kw-desk-line">{line()}</span>
            <Show when={asking()}>
              {(run) => (
                <Answers
                  run={run()}
                  quiet={quiet()}
                  keys={props.keys}
                  onAnswer={(pick) => props.onAnswer(pick)}
                />
              )}
            </Show>
          </span>
        )}
      </Show>
    </li>
  );
}

interface SessionFacts {
  readonly id: string;
  readonly name: string;
  readonly arc: string | undefined;
  readonly hueRank: number | undefined;
  readonly bot: string | undefined;
  readonly wears: Theme | undefined;
  readonly context: ContextLevel | undefined;
  readonly cost: string | undefined;
  readonly step: string | undefined;
}

function Where(props: { facts: SessionFacts }) {
  return (
    <span class="kw-desk-where">
      <Show when={props.facts.arc}>
        {(slug) => (
          <span class="kw-desk-arc">
            <span class="kw-ov-chip" aria-hidden="true" />
            {slug()}
          </span>
        )}
      </Show>
      <Show when={props.facts.bot}>{(bot) => <span class="kw-desk-bot">{bot()}</span>}</Show>
      <Show when={props.facts.wears}>{(theme) => <Wears theme={theme()} />}</Show>
    </span>
  );
}

function Elsewhere(props: { row: DeskRow; shell: ShellSeams }) {
  return (
    <Show when={memoryItemOf(props.row)}>
      {(item) => (
        <span class="kw-desk-where">
          <span>{props.shell.needsYou?.queue.where(item()) ?? ""}</span>
        </span>
      )}
    </Show>
  );
}

function Wears(props: { theme: Theme }) {
  return (
    <span class="kw-desk-wears">
      <span class="kw-desk-strip" aria-hidden="true">
        <For each={swatchesOf(props.theme).slice(0, swatchCount)}>
          {(color) => <span class="kw-desk-swatch" style={{ background: color }} />}
        </For>
      </span>
      {props.theme.name}
    </span>
  );
}

interface AnswersProps {
  run: ToolRun;
  quiet: boolean;
  keys: AskChords;
  onAnswer(pick: AskPick): void;
}

function Answers(props: AnswersProps) {
  return (
    <span class="kw-desk-answers">
      <For each={askOffers(props.run, props.quiet)}>
        {(offer) => (
          <button
            type="button"
            class="kw-desk-answer"
            data-tone={offer.choice.verdict === "denied" ? "deny" : "grant"}
            onClick={() => props.onAnswer(offer.pick)}
          >
            {answerLabel(offer.choice)} <kbd>{props.keys[offer.pick]}</kbd>
          </button>
        )}
      </For>
    </span>
  );
}

const swatchCount = 8;

function sessionFacts(shell: ShellSeams, sessionId: string | undefined): SessionFacts | undefined {
  const summary = shell.store.summary(sessionId);
  if (summary === undefined) return undefined;
  const projection = shell.store.projection(summary.id);
  const surfaces = shell.store.surfaces.state;
  return {
    id: summary.id,
    name: sessionName(summary, projection),
    arc: summary.arc,
    hueRank: arcHueRank(summary, surfaces.ordinals),
    bot: summary.bot === undefined ? undefined : botNamed(summary.bot, surfaces.bots),
    wears: shell.needsYou?.dressed(summary.id)?.theme,
    context: contextOf(shell, summary.id, projection),
    cost: costOf(summary),
    step: projection.turn === undefined ? undefined : currentStep(projection),
  };
}

function contextOf(
  shell: ShellSeams,
  sessionId: string,
  projection: SessionProjection,
): ContextLevel | undefined {
  const reported = shell.store.controls.readings(sessionId).context;
  return reported === undefined ? contextLevelOf(projection.usage) : contextLevelOfReport(reported);
}

function localSession(row: DeskRow, shell: ShellSeams): string | undefined {
  if (row.kind === "waiting" && row.item.workspace !== shell.workspace) return undefined;
  return sessionOfRow(row);
}

function askOnRow(row: DeskRow, shell: ShellSeams): ToolRun | undefined {
  if (row.kind !== "waiting" || row.item.kind !== "ask") return undefined;
  return askingRun(shell.store.projection(row.item.sessionId), row.item.callId);
}

function nameOf(row: DeskRow, facts: SessionFacts | undefined, shell: ShellSeams): string {
  if (facts !== undefined) return facts.name;
  if (row.kind === "session") return row.summary.title;
  const memory = memoryItemOf(row);
  return memory === undefined ? (shell.needsYou?.queue.where(row.item) ?? "") : glossOf(memory);
}

function tailOf(row: DeskRow, facts: SessionFacts | undefined): string | undefined {
  if (row.kind === "session") return facts?.step;
  return memoryItemOf(row) === undefined ? glossOf(row.item) : undefined;
}

function memoryItemOf(row: DeskRow): NeedsYouItem | undefined {
  if (row.kind !== "waiting") return undefined;
  return row.item.kind === "airlock" || row.item.kind === "inbox" ? row.item : undefined;
}

function stampOf(row: DeskRow, step: number): string {
  return row.kind === "waiting" ? kindMarks[row.item.kind] : stampGlyph(row.state, step);
}

function toneOf(row: DeskRow): string {
  return row.kind === "waiting" ? row.item.kind : row.state;
}

function arcHue(rank: number | undefined): string | undefined {
  return rank === undefined ? undefined : `var(--kw-ramp-${hueStop(rank)})`;
}
