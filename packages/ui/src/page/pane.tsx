import {
  type AssistantEntry,
  type NoticeEntry,
  type PathMark,
  type SessionProjection,
  type ThinkingEntry,
  type ToolEntry,
  type TranscriptEntry,
  type TranscriptLedger,
  type TurnLedger,
  toolRowSpans,
  type UserEntry,
} from "@keywork-app/client";
import type {
  AnswerOutcome,
  AskScope,
  AskVerdict,
  PermissionAsk,
  RememberedScope,
} from "@keywork-app/protocol";
import { createMemo, For, type JSX, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { AskCard, type AskChords } from "./ask-card.tsx";
import { type BotLabel, childRowSpans, openChildHint, plainBot } from "./child-row.ts";
import { LedgerLine, type LedgerVerbs, ledgerFacts, markText } from "./ledger.tsx";
import { Markdown } from "./markdown.tsx";
import "./page.css";

export type AskAnswerHandler = (
  callId: string,
  verdict: AskVerdict,
  scope?: AskScope,
) => Promise<AnswerOutcome> | undefined;

export type AskAcceptance = (ask: PermissionAsk) => RememberedScope | undefined;

export interface ConversationPaneProps {
  projection: SessionProjection;
  title?: string | undefined;
  onAnswerAsk?: AskAnswerHandler | undefined;
  askChords?: AskChords | undefined;
  quiet?: boolean | undefined;
  onOpenSession?: ((sessionId: string) => void) | undefined;
  botLabel?: BotLabel | undefined;
  askAccepted?: AskAcceptance | undefined;
  ledger?: TranscriptLedger | undefined;
  ledgerVerbs?: LedgerVerbs | undefined;
  redoable?: boolean | undefined;
}

export type Voice = "user" | "agent" | "machine" | "blank";

export const voiceGlyph: Record<Voice, string> = {
  user: "█",
  agent: "▓",
  machine: "░",
  blank: " ",
};

export function ConversationPane(props: ConversationPaneProps) {
  const [folds, setFolds] = createStore<Record<number, boolean>>({});
  const unfolded = (index: number): boolean => folds[index] === true;
  const toggle = (index: number): void => setFolds(index, !unfolded(index));
  const [ledgerFolds, setLedgerFolds] = createStore<Record<number, boolean>>({});
  const closingAt = createMemo(
    () => new Map((props.ledger?.turns ?? []).map((turn) => [turn.end, turn])),
  );
  return (
    <section class="kw-pane" aria-label="conversation">
      <ol class="kw-transcript">
        <For each={props.ledger?.opening ?? []}>
          {(mark) => <MarkRow mark={mark} redoable={props.redoable} />}
        </For>
        <For each={props.projection.entries}>
          {(entry, index) => (
            <>
              <Entry
                entry={entry}
                streaming={props.projection.streaming === index()}
                unfolded={unfolded(index())}
                onToggle={() => toggle(index())}
                onAnswerAsk={props.onAnswerAsk}
                askChords={props.askChords}
                quiet={props.quiet}
                onOpenSession={props.onOpenSession}
                botLabel={props.botLabel}
                askAccepted={props.askAccepted}
              />
              <Show when={closingAt().get(index())}>
                {(turn) => (
                  <TurnClose
                    turn={turn()}
                    verbs={props.ledgerVerbs}
                    redoable={props.redoable}
                    unfolded={ledgerFolds[turn().head] === true}
                    onToggle={() => setLedgerFolds(turn().head, (open) => !open)}
                  />
                )}
              </Show>
            </>
          )}
        </For>
      </ol>
      <p class="kw-masthead-tier" aria-hidden="true">
        <span class="kw-masthead-name">{props.title ?? headline(props.projection)}</span>
      </p>
    </section>
  );
}

export function headline(projection: SessionProjection): string {
  const first = projection.entries.find((entry) => entry.kind === "user");
  return first?.kind === "user" ? first.text : "keywork";
}

export function wordCount(text: string): string {
  const words = text.split(/\s+/).filter((word) => word !== "").length;
  return words === 1 ? "1 word" : `${words} words`;
}

interface EntryProps {
  entry: TranscriptEntry;
  streaming: boolean;
  unfolded: boolean;
  onToggle: () => void;
  onAnswerAsk?: AskAnswerHandler | undefined;
  askChords?: AskChords | undefined;
  quiet?: boolean | undefined;
  onOpenSession?: ((sessionId: string) => void) | undefined;
  botLabel?: BotLabel | undefined;
  askAccepted?: AskAcceptance | undefined;
}

function Entry(props: EntryProps) {
  const entry = () => props.entry;
  return (
    <Switch>
      <Match when={as<UserEntry>(entry(), "user")}>
        {(user) => (
          <Row voice="user" replay={user().replay}>
            <p class="kw-user">
              {user().text}
              <Show when={user().origin}>
                {(origin) => <span class="kw-origin">via {origin().client}</span>}
              </Show>
            </p>
          </Row>
        )}
      </Match>
      <Match when={as<AssistantEntry>(entry(), "assistant")}>
        {(assistant) => (
          <Row
            voice="agent"
            replay={assistant().replay}
            streaming={props.streaming && !assistant().settled}
          >
            <div class="kw-prose">
              <Markdown source={assistant().text} />
            </div>
          </Row>
        )}
      </Match>
      <Match when={as<ThinkingEntry>(entry(), "thinking")}>
        {(thinking) => (
          <Row voice="agent" replay={thinking().replay}>
            <button
              type="button"
              class="kw-thinking"
              aria-expanded={props.unfolded}
              onClick={() => props.onToggle()}
            >
              thinking · {wordCount(thinking().text)}
            </button>
            <Show when={props.unfolded}>
              <p class="kw-thinking-text">{thinking().text}</p>
            </Show>
          </Row>
        )}
      </Match>
      <Match when={as<ToolEntry>(entry(), "tool")}>
        {(tool) => (
          <ToolRow
            tool={tool()}
            unfolded={props.unfolded}
            onToggle={() => props.onToggle()}
            onAnswerAsk={props.onAnswerAsk}
            askChords={props.askChords}
            quiet={props.quiet}
            onOpenSession={props.onOpenSession}
            botLabel={props.botLabel}
            askAccepted={props.askAccepted}
          />
        )}
      </Match>
      <Match when={as<NoticeEntry>(entry(), "notice")}>
        {(notice) => (
          <Row voice={notice().level === "error" ? "machine" : "blank"}>
            <p class="kw-notice" data-level={notice().level}>
              {notice().text}
            </p>
          </Row>
        )}
      </Match>
    </Switch>
  );
}

interface RowProps {
  voice: Voice;
  replay?: boolean | undefined;
  streaming?: boolean | undefined;
  stampLabel?: string | undefined;
  onStamp?: (() => void) | undefined;
  children: JSX.Element;
}

function Row(props: RowProps) {
  return (
    <li class="kw-entry" data-voice={props.voice} data-replay={props.replay ? "" : undefined}>
      <Show
        when={props.onStamp}
        fallback={
          <span
            class="kw-stamp"
            data-voice={props.voice}
            data-streaming={props.streaming ? "" : undefined}
            aria-hidden="true"
          >
            {voiceGlyph[props.voice]}
          </span>
        }
      >
        {(onStamp) => (
          <button
            type="button"
            class="kw-stamp kw-stamp-fold"
            data-voice={props.voice}
            aria-label={props.stampLabel}
            onClick={() => onStamp()()}
          >
            {voiceGlyph[props.voice]}
          </button>
        )}
      </Show>
      <div class="kw-body">{props.children}</div>
    </li>
  );
}

interface ToolRowProps {
  tool: ToolEntry;
  unfolded: boolean;
  onToggle: () => void;
  onAnswerAsk?: AskAnswerHandler | undefined;
  askChords?: AskChords | undefined;
  quiet?: boolean | undefined;
  onOpenSession?: ((sessionId: string) => void) | undefined;
  botLabel?: BotLabel | undefined;
  askAccepted?: AskAcceptance | undefined;
}

function ToolRow(props: ToolRowProps) {
  const run = () => props.tool.run;
  const openableChild = (): string | undefined =>
    props.onOpenSession === undefined ? undefined : run().child?.sessionId;
  const spans = () => {
    const child = run().child;
    if (child === undefined) return toolRowSpans(run());
    const row = childRowSpans(run(), child, props.botLabel ?? plainBot);
    return openableChild() === undefined ? row : [...row, openChildHint];
  };
  const disclosable = () => run().detail !== undefined && run().detail?.length !== 0;
  const actionable = () => disclosable() || openableChild() !== undefined;
  const activate = (): void => {
    const child = openableChild();
    if (child === undefined) props.onToggle();
    else props.onOpenSession?.(child);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (event.key === "Enter") activate();
    else if (disclosable()) props.onToggle();
  };
  const spanElements = () => (
    <For each={spans()}>
      {(span) => (
        <span class="kw-tool-span" data-tone={span.tone} data-part={span.part}>
          {span.text}
        </span>
      )}
    </For>
  );
  return (
    <Row
      voice="machine"
      replay={run().replay}
      stampLabel={props.unfolded ? "fold tool detail" : "unfold tool detail"}
      onStamp={disclosable() ? props.onToggle : undefined}
    >
      <Show
        when={actionable()}
        fallback={
          <div class="kw-tool" data-phase={run().phase}>
            {spanElements()}
          </div>
        }
      >
        <button
          type="button"
          class="kw-tool"
          data-phase={run().phase}
          data-child={run().child === undefined ? undefined : ""}
          aria-expanded={disclosable() ? props.unfolded : undefined}
          onClick={activate}
          onKeyDown={onKey}
        >
          {spanElements()}
        </button>
      </Show>
      <Show when={run().phase === "asking" && props.onAnswerAsk !== undefined}>
        <AskCard
          run={run()}
          onAnswer={(verdict, scope) => props.onAnswerAsk?.(run().callId, verdict, scope)}
          chords={props.askChords}
          quiet={props.quiet}
          accepted={acceptedScopeOf(run(), props.askAccepted)}
        />
      </Show>
      <Show when={props.unfolded && disclosable()}>
        <pre class="kw-tool-detail">{run().detail?.join("\n")}</pre>
      </Show>
    </Row>
  );
}

interface TurnCloseProps {
  turn: TurnLedger;
  verbs?: LedgerVerbs | undefined;
  redoable?: boolean | undefined;
  unfolded: boolean;
  onToggle: () => void;
}

function TurnClose(props: TurnCloseProps) {
  return (
    <>
      <Show when={ledgerFacts(props.turn).length > 0}>
        <Row voice="blank">
          <LedgerLine
            turn={props.turn}
            verbs={props.verbs}
            unfolded={props.unfolded}
            onToggle={() => props.onToggle()}
          />
        </Row>
      </Show>
      <For each={props.turn.place?.marks ?? []}>
        {(mark) => <MarkRow mark={mark} redoable={props.redoable} />}
      </For>
    </>
  );
}

function MarkRow(props: { mark: PathMark; redoable?: boolean | undefined }) {
  return (
    <Row voice="blank">
      <p class="kw-notice" data-mark={props.mark.kind}>
        {markText(props.mark, props.redoable === true)}
      </p>
    </Row>
  );
}

function acceptedScopeOf(
  run: ToolEntry["run"],
  accepted: AskAcceptance | undefined,
): RememberedScope | undefined {
  return run.ask === undefined ? undefined : accepted?.(run.ask);
}

function as<T extends TranscriptEntry>(entry: TranscriptEntry, kind: T["kind"]): T | undefined {
  return entry.kind === kind ? (entry as T) : undefined;
}
