import type { DenyReason } from "@keywork-app/protocol";
import { createEffect, For, Index, on, Show } from "solid-js";
import type { AskChords, AskPick } from "./ask-card.tsx";
import {
  type AnswerBy,
  admitsAnswer,
  answersTakeKeys,
  answersTakePresses,
  questionAppeared,
} from "./ask-card-guard.ts";
import { reasonOffers, takeBackOffer, whyPrompt } from "./ask-card-why.ts";
import "./ask-card.css";

export type AnswerTone = "grant" | "deny" | "back";

export interface AnswerOffer {
  readonly pick: AskPick;
  readonly label: string;
  readonly tone: AnswerTone;
}

export interface AskAnswersProps {
  callId: string | undefined;
  offers: readonly AnswerOffer[];
  keys: AskChords;
  why: boolean;
  part: string;
  keyless?: boolean | undefined;
  onAnswer(pick: AskPick, by: AnswerBy): void;
  onReason(reason: DenyReason, by: AnswerBy): void;
  onBack(): void;
}

export function AskAnswers(props: AskAnswersProps) {
  const keyOf = (key: string): string | undefined => (props.keyless === true ? undefined : key);
  waitWhenItAppears(() =>
    props.callId === undefined ? undefined : `${props.callId} ${props.why}`,
  );
  return (
    <Show
      when={props.why}
      fallback={
        <Index each={props.offers}>
          {(offer) => (
            <AnswerKey
              class={`${props.part}-answer`}
              label={offer().label}
              chord={keyOf(props.keys[offer().pick])}
              tone={offer().tone}
              onPress={(by) => props.onAnswer(offer().pick, by)}
            />
          )}
        </Index>
      }
    >
      <span class={`${props.part}-reason-prompt`}>{whyPrompt}</span>
      <For each={reasonOffers}>
        {(offer) => (
          <AnswerKey
            class={`${props.part}-answer`}
            label={offer.label}
            chord={keyOf(offer.key)}
            tone="deny"
            onPress={(by) => props.onReason(offer.reason, by)}
          />
        )}
      </For>
      <AnswerKey
        class={`${props.part}-answer`}
        label={takeBackOffer.label}
        chord={keyOf(takeBackOffer.key)}
        tone="back"
        unguarded
        onPress={() => props.onBack()}
      />
    </Show>
  );
}

export function waitWhenItAppears(shown: () => string | undefined): void {
  createEffect(
    on(shown, (now, before) => {
      if (now !== undefined && now !== before) questionAppeared();
    }),
  );
}

export interface AnswerKeyProps {
  class: string;
  label: string;
  chord: string | undefined;
  tone: AnswerTone;
  unguarded?: boolean | undefined;
  onPress(by: AnswerBy): void;
}

export function AnswerKey(props: AnswerKeyProps) {
  let pressBeganReady: boolean | undefined;
  const guarded = (): boolean => props.unguarded !== true;
  const admits = (by: AnswerBy): boolean => {
    const began = pressBeganReady ?? true;
    pressBeganReady = undefined;
    return !guarded() || (admitsAnswer(by) && (by !== "pointer" || began));
  };
  const press = (event: MouseEvent): void => {
    event.stopPropagation();
    const by = pressedBy(event);
    if (admits(by)) props.onPress(by);
  };
  return (
    <button
      type="button"
      class={`kw-answer ${props.class}`}
      data-tone={props.tone}
      data-waiting={guarded() && !answersTakePresses() ? "" : undefined}
      aria-disabled={guarded() && !answersTakePresses() ? "true" : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onPointerDown={() => {
        pressBeganReady = admitsAnswer("pointer");
      }}
      onClick={press}
    >
      <span class="kw-answer-label">{props.label}</span>
      <Show when={props.chord}>
        {(chord) => (
          <>
            {" "}
            <kbd data-waiting={guarded() && !answersTakeKeys() ? "" : undefined}>{chord()}</kbd>
          </>
        )}
      </Show>
    </button>
  );
}

export function pressedBy(event: MouseEvent): AnswerBy {
  return event.detail === 0 ? "key" : "pointer";
}
