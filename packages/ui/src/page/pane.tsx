import {
  type AssistantEntry,
  type NoticeEntry,
  type SessionProjection,
  type ThinkingEntry,
  type ToolEntry,
  type ToolRun,
  type TranscriptEntry,
  toolRowSpans,
  type UserEntry,
} from "@keywork-app/client";
import type { AskVerdict } from "@keywork-app/protocol";
import { For, type JSX, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { Markdown } from "./markdown.tsx";
import "./page.css";

export interface ConversationPaneProps {
  projection: SessionProjection;
  title?: string | undefined;
  onAnswerAsk?: ((callId: string, verdict: AskVerdict) => void) | undefined;
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
  return (
    <section class="kw-pane" aria-label="conversation">
      <ol class="kw-transcript">
        <For each={props.projection.entries}>
          {(entry, index) => (
            <Entry
              entry={entry}
              streaming={props.projection.streaming === index()}
              unfolded={unfolded(index())}
              onToggle={() => toggle(index())}
              onAnswerAsk={props.onAnswerAsk}
            />
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
  onAnswerAsk?: ((callId: string, verdict: AskVerdict) => void) | undefined;
}

function Entry(props: EntryProps) {
  const entry = () => props.entry;
  return (
    <Switch>
      <Match when={as<UserEntry>(entry(), "user")}>
        {(user) => (
          <Row voice="user" replay={user().replay}>
            <p class="kw-user">{user().text}</p>
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
  onAnswerAsk?: ((callId: string, verdict: AskVerdict) => void) | undefined;
}

function ToolRow(props: ToolRowProps) {
  const run = () => props.tool.run;
  const spans = () => toolRowSpans(run());
  const disclosable = () => run().detail !== undefined && run().detail?.length !== 0;
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onToggle();
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
        when={disclosable()}
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
          aria-expanded={props.unfolded}
          onClick={() => props.onToggle()}
          onKeyDown={onKey}
        >
          {spanElements()}
        </button>
      </Show>
      <Show when={run().phase === "asking" && props.onAnswerAsk !== undefined}>
        <AskCard run={run()} onAnswer={(verdict) => props.onAnswerAsk?.(run().callId, verdict)} />
      </Show>
      <Show when={props.unfolded && disclosable()}>
        <pre class="kw-tool-detail">{run().detail?.join("\n")}</pre>
      </Show>
    </Row>
  );
}

interface AskCardProps {
  run: ToolRun;
  onAnswer: (verdict: AskVerdict) => void;
}

function AskCard(props: AskCardProps) {
  const why = () =>
    props.run.ask?.rule === "policy"
      ? "a rule asks before this tool runs"
      : "this tool changes things";
  return (
    <fieldset class="kw-ask" aria-label="permission ask">
      <span class="kw-ask-why">{why()}</span>
      <span class="kw-ask-args">{props.run.args}</span>
      <span class="kw-ask-actions">
        <button type="button" class="kw-ask-approve" onClick={() => props.onAnswer("granted")}>
          approve <kbd>ctrl+y</kbd>
        </button>
        <button type="button" class="kw-ask-deny" onClick={() => props.onAnswer("denied")}>
          deny <kbd>ctrl+n</kbd>
        </button>
      </span>
    </fieldset>
  );
}

function as<T extends TranscriptEntry>(entry: TranscriptEntry, kind: T["kind"]): T | undefined {
  return entry.kind === kind ? (entry as T) : undefined;
}
