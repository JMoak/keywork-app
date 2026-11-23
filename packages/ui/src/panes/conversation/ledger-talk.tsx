import "./conversation.css";
import {
  type AskVerdict,
  type CreatureLedgerEntry,
  isServedRefusal,
  type QuestionAnswer,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import type { ShellSeams } from "../registry.ts";

export interface LedgerTalk {
  entry(): CreatureLedgerEntry | undefined;
  ended(): boolean;
  endedLine(): string;
  answer(verdict: AskVerdict): void;
  close(): void;
}

export function followLedgerTalk(
  shell: Pick<ShellSeams, "client" | "feed" | "store">,
  sessionId: () => string | undefined,
): LedgerTalk {
  const about = createMemo(
    (): Talking | undefined => {
      const id = sessionId();
      const creature = id === undefined ? undefined : shell.store.summary(id)?.bot;
      return id === undefined || creature === undefined ? undefined : { creature, session: id };
    },
    undefined,
    { equals: sameTalk },
  );
  const [entry, setEntry] = createSignal<CreatureLedgerEntry>();
  const learned = (talking: Talking, heard: CreatureLedgerEntry): void => {
    if (heard.conversation?.session === talking.session) setEntry(heard);
  };

  createEffect(
    on(about, (talking) => {
      setEntry(undefined);
      if (talking === undefined) return;
      onCleanup(
        shell.feed.subscribe((batch) => {
          for (const envelope of batch) {
            if (envelope.type !== "creature.ledger") continue;
            if (envelope.payload.creature === talking.creature)
              learned(talking, envelope.payload.entry);
          }
        }),
      );
      void entryAbout(shell, talking).then((found) => {
        if (found !== undefined && about() === talking) learned(talking, found);
      });
    }),
  );

  const ended = (): boolean => entry()?.conversation?.state === "ended";
  return {
    entry,
    ended,
    endedLine: () => endedLineOf(entry()),
    answer: (verdict) => {
      const about = entry()?.about;
      if (about?.kind !== "ask" || ended()) return;
      const answering =
        verdict === "granted"
          ? shell.client.answerAsk(about.callId, "granted", "once")
          : shell.client.answerAsk(about.callId, "denied", undefined, "not-now");
      void answering.catch(() => undefined);
    },
    close: () => {
      const talking = about();
      const held = entry();
      if (talking === undefined || held === undefined || ended()) return;
      void shell.client
        .closeLedgerConversation(talking.creature, held.id)
        .then((closed) => {
          if (!isServedRefusal(closed)) learned(talking, closed);
        })
        .catch(() => undefined);
    },
  };
}

export function LedgerBand(props: { readonly talk: LedgerTalk }) {
  return (
    <Show when={props.talk.entry()}>
      {(entry) => (
        <Show
          when={!props.talk.ended()}
          fallback={
            <p class="kw-talk-ended" role="status">
              {props.talk.endedLine()}
            </p>
          }
        >
          <fieldset
            class="kw-talk-band"
            aria-label={entry().kind === "question" ? spokenWhenAnswered : spokenWhenClosed}
          >
            <span>{entry().kind === "question" ? endsWhenAnswered : endsWhenClosed}</span>
            <span class="kw-talk-acts">
              <Show when={entry().about.kind === "ask" && entry().state === "waiting"}>
                <button
                  type="button"
                  class="kw-talk-act"
                  aria-label={allowLabel(entry().title)}
                  onClick={() => props.talk.answer("granted")}
                >
                  {allowWord}
                </button>
                <button
                  type="button"
                  class="kw-talk-act"
                  aria-label={notYetLabel(entry().title)}
                  onClick={() => props.talk.answer("denied")}
                >
                  {notYetWord}
                </button>
              </Show>
              <button
                type="button"
                class="kw-talk-act"
                aria-label={closeLabel}
                onClick={() => props.talk.close()}
              >
                {closeWord}
              </button>
            </span>
          </fieldset>
        </Show>
      )}
    </Show>
  );
}

export const endsWhenAnswered = "ends when answered";
export const endsWhenClosed = "ends when you close it";
export const spokenWhenAnswered =
  "A short conversation about one question: it ends when the question is answered or you close it";
export const spokenWhenClosed = "A short conversation about one task: it ends when you close it";
export const closeWord = "Close";
export const closeLabel = "Close this conversation: it ends here and stays to read";
export const allowWord = "Allow once";
export const notYetWord = "Not yet";

export function allowLabel(question: string): string {
  return `Allow once: ${question}`;
}

export function notYetLabel(question: string): string {
  return `Not yet: say no for now to ${question}`;
}

const endedByAnswer: Readonly<Record<QuestionAnswer, string>> = {
  granted: "This conversation has ended: you allowed it.",
  denied: "This conversation has ended: you said no.",
  lapsed: "This conversation has ended: nobody answered in time.",
};

export function endedLineOf(entry: CreatureLedgerEntry | undefined): string {
  if (entry?.conversation?.endedBy === "keeper")
    return "This conversation has ended: you closed it.";
  const answer = entry?.answer ?? null;
  return answer === null
    ? "This conversation has ended: the question was answered."
    : endedByAnswer[answer];
}

interface Talking {
  readonly creature: string;
  readonly session: string;
}

function sameTalk(one: Talking | undefined, other: Talking | undefined): boolean {
  return one?.creature === other?.creature && one?.session === other?.session;
}

async function entryAbout(
  shell: Pick<ShellSeams, "client">,
  talking: Talking,
): Promise<CreatureLedgerEntry | undefined> {
  try {
    const view = await shell.client.creatureLedger(talking.creature);
    if (isServedRefusal(view)) return undefined;
    return view.entries.find((entry) => entry.conversation?.session === talking.session);
  } catch {
    return undefined;
  }
}
