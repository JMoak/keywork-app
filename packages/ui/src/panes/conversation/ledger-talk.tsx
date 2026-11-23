import "./conversation.css";
import type { ToolRun } from "@keywork-app/client";
import {
  type CreatureLedgerEntry,
  type DenyReason,
  isServedRefusal,
  type QuestionAnswer,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js";
import { KeyAct } from "../../chrome/key-act.tsx";
import { NeedsYouAnswers } from "../../companion/bubble.tsx";
import { defaultAnswers } from "../../companion/feed.ts";
import { type AskChords, type AskPick, askChordsOf, denialFor } from "../../page/ask-card.tsx";
import { type AnswerBy, admitsAnswer } from "../../page/ask-card-guard.ts";
import { askingWhy, readWhyKeys } from "../../page/ask-card-why.ts";
import { NoteLine } from "../../page/note-line.tsx";
import { answerHeldAsk, askingRun, type HeldAsk, reachAsk } from "../../shell/answer-ask.ts";
import type { ShellSeams } from "../registry.ts";

export interface LedgerTalk {
  entry(): CreatureLedgerEntry | undefined;
  ended(): boolean;
  endedLine(): string;
  asked(): HeldAsk | undefined;
  askedRun(): ToolRun | undefined;
  askKeys(): AskChords;
  wording(): boolean;
  answer(pick: AskPick, by: AnswerBy): void;
  giveReason(reason: DenyReason, by: AnswerBy): void;
  sendWords(note: string): void;
  close(): void;
}

export interface LedgerTalkSeams {
  root(): HTMLElement | undefined;
  say(line: string): void;
  returnHome(): void;
}

export function followLedgerTalk(
  shell: Pick<ShellSeams, "client" | "feed" | "store" | "keys">,
  sessionId: () => string | undefined,
  seams: LedgerTalkSeams,
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
  const [worded, setWorded] = createSignal<string>();
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
  const asked = createMemo(() => (ended() ? undefined : askWaitingIn(entry())), undefined, {
    equals: sameAsk,
  });
  const answer = (pick: AskPick, by: AnswerBy, reason?: DenyReason, note?: string): void => {
    const held = asked();
    if (held === undefined) return;
    const answering = { store: shell.store, approveKey: askChordsOf(shell.keys).approve };
    void answerHeldAsk(answering, held, pick, by, reason, note).then((line) => {
      if (line !== undefined) seams.say(line);
    });
  };

  createEffect(() => {
    const session = asked()?.sessionId;
    if (session !== undefined) void shell.store.open(session);
  });
  onCleanup(reachAsk({ store: shell.store, root: seams.root, held: asked }));

  return {
    entry,
    ended,
    endedLine: () => endedLineOf(entry()),
    asked,
    askedRun: () => {
      const held = asked();
      return held === undefined
        ? undefined
        : askingRun(shell.store.projection(held.sessionId), held.callId);
    },
    askKeys: () => askChordsOf(shell.keys),
    wording: () => worded() !== undefined && worded() === asked()?.callId,
    answer,
    giveReason: (reason, by) => {
      if (reason !== "other") answer("deny", by, reason);
      else if (admitsAnswer(by)) setWorded(asked()?.callId);
    },
    sendWords: (note) => {
      setWorded(undefined);
      const denial = denialFor("other", note);
      answer("deny", "words", denial.reason, denial.note);
      seams.returnHome();
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

export interface LedgerBandProps {
  readonly talk: LedgerTalk;
  readonly leaveKey: string;
  onLeave: (() => void) | undefined;
  returnHome(): void;
}

export function LedgerBand(props: LedgerBandProps) {
  let band: HTMLFieldSetElement | undefined;
  const sayingWhy = (): boolean => {
    const callId = props.talk.asked()?.callId;
    return callId !== undefined && askingWhy(callId);
  };
  readWhyKeys(
    () => band,
    () => (props.talk.wording() ? undefined : props.talk.asked()?.callId),
    (reason) => props.talk.giveReason(reason, "key"),
  );
  createEffect(
    on(sayingWhy, (asking, wasAsking) => {
      if (asking) band?.focus({ preventScroll: true });
      else if (wasAsking === true) props.returnHome();
    }),
  );
  return (
    <Show when={props.talk.entry()}>
      {(entry) => (
        <Show
          when={!props.talk.ended()}
          fallback={
            <div class="kw-talk-end">
              <p class="kw-talk-ended" role="status">
                {props.talk.endedLine()}
              </p>
              <Show when={props.onLeave}>
                {(leave) => (
                  <KeyAct
                    class="kw-talk-leave"
                    label={leaveWord}
                    chord={props.leaveKey}
                    spoken={leaveLabel}
                    onPress={() => leave()()}
                  />
                )}
              </Show>
            </div>
          }
        >
          <fieldset
            class="kw-talk-band"
            aria-label={entry().kind === "question" ? spokenWhenAnswered : spokenWhenClosed}
            tabIndex={-1}
            ref={band}
          >
            <span>{entry().kind === "question" ? endsWhenAnswered : endsWhenClosed}</span>
            <span class="kw-talk-acts">
              <Show when={props.talk.asked()}>
                {(held) => (
                  <Show
                    when={props.talk.wording()}
                    fallback={
                      <NeedsYouAnswers
                        placement="band"
                        run={props.talk.askedRun()}
                        callId={held().callId}
                        answers={defaultAnswers}
                        keys={props.talk.askKeys()}
                        onAnswer={props.talk.answer}
                        onReason={props.talk.giveReason}
                      />
                    }
                  >
                    <NoteLine onSend={props.talk.sendWords} />
                  </Show>
                )}
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
export const leaveWord = "close this pane";
export const leaveLabel = "Close this pane: the conversation stays in its creature's ledger";

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

function sameAsk(one: HeldAsk | undefined, other: HeldAsk | undefined): boolean {
  return one?.sessionId === other?.sessionId && one?.callId === other?.callId;
}

function askWaitingIn(entry: CreatureLedgerEntry | undefined): HeldAsk | undefined {
  if (entry?.about.kind !== "ask" || entry.state !== "waiting" || entry.session === null)
    return undefined;
  return { sessionId: entry.session, callId: entry.about.callId };
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
