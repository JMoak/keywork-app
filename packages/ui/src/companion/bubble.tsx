import type { ToolRun } from "@keywork-app/client";
import type { DenyReason } from "@keywork-app/protocol";
import { For, Show } from "solid-js";
import {
  type AskChords,
  type AskPick,
  answerLabel,
  askOffers,
  pickLabels,
} from "../page/ask-card.tsx";
import { askingWhy, reasonOffers, whyPrompt } from "../page/ask-card-why.ts";
import { NoteLine } from "../page/note-line.tsx";
import type { NeedsYouBubble as Bubble, ChoreAccept, OverturnOffer } from "./port.ts";

export type BubblePlacement = "companion" | "porch" | "desk";

export const acceptLabel = "accept";

export const overturnLabel = "overturn";

export const overturnChordDefault = "x";

export const answerLabels = pickLabels;

export interface NeedsYouBubbleProps {
  placement?: Exclude<BubblePlacement, "desk"> | undefined;
  bubble: Bubble;
  keys: AskChords;
  run?: ToolRun | undefined;
  wording?: boolean | undefined;
  style?: Readonly<Record<string, string>> | undefined;
  overturnChord?: string | undefined;
  onOpen(): void;
  onAnswer(pick: AskPick): void;
  onReason?(reason: DenyReason): void;
  onAccept?(accept: ChoreAccept): void;
  onOverturn?(overturn: OverturnOffer): void;
  onWords?(note: string): void;
}

export function NeedsYouBubble(props: NeedsYouBubbleProps) {
  const placement = (): BubblePlacement => props.placement ?? "companion";
  const prefix = () => classPrefix[placement()];
  return (
    <fieldset
      class={`${prefix()}-bubble`}
      data-placement={placement()}
      data-hit={placement() === "companion" ? "" : undefined}
      aria-label="needs you"
      style={props.style}
    >
      <button type="button" class={`${prefix()}-bubble-open`} onClick={() => props.onOpen()}>
        <span class={`${prefix()}-bubble-title`}>{props.bubble.title}</span>
        <span class={`${prefix()}-bubble-line`}>{props.bubble.line}</span>
      </button>
      <Show
        when={props.wording === true}
        fallback={
          <NeedsYouAnswers
            placement={placement()}
            keys={props.keys}
            run={props.run}
            answers={props.bubble.callId === undefined ? [] : props.bubble.answers}
            accept={props.bubble.accept}
            overturn={props.bubble.overturn}
            overturnChord={props.overturnChord}
            onAnswer={(pick) => props.onAnswer(pick)}
            onReason={(reason) => props.onReason?.(reason)}
            onAccept={(accept) => props.onAccept?.(accept)}
            onOverturn={(overturn) => props.onOverturn?.(overturn)}
          />
        }
      >
        <span class={`${prefix()}-words`}>
          <NoteLine onSend={(note) => props.onWords?.(note)} />
        </span>
      </Show>
    </fieldset>
  );
}

export interface NeedsYouAnswersProps {
  placement: BubblePlacement;
  keys: AskChords;
  run?: ToolRun | undefined;
  answers?: readonly AskPick[] | undefined;
  accept?: ChoreAccept | undefined;
  overturn?: OverturnOffer | undefined;
  overturnChord?: string | undefined;
  onAnswer(pick: AskPick): void;
  onReason?(reason: DenyReason): void;
  onAccept?(accept: ChoreAccept): void;
  onOverturn?(overturn: OverturnOffer): void;
}

export interface AnswerOffer {
  readonly pick: AskPick;
  readonly label: string;
  readonly tone: "grant" | "deny";
}

export function answerOffers(
  run: ToolRun | undefined,
  answers: readonly AskPick[] = [],
): AnswerOffer[] {
  if (run !== undefined) {
    return askOffers(run).map(({ pick, choice }) => ({
      pick,
      label: answerLabel(choice),
      tone: choice.verdict === "denied" ? "deny" : "grant",
    }));
  }
  return answers.map((pick) => ({
    pick,
    label: pickLabels[pick],
    tone: pick === "deny" ? "deny" : "grant",
  }));
}

export function NeedsYouAnswers(props: NeedsYouAnswersProps) {
  const prefix = () => classPrefix[props.placement];
  const offers = () => answerOffers(props.run, props.answers);
  const sayingWhy = () => props.run !== undefined && askingWhy(props.run.callId);
  return (
    <Show when={offers().length > 0 || props.accept !== undefined || props.overturn !== undefined}>
      <span class={`${prefix()}-answers`}>
        <Show when={props.accept}>
          {(accept) => (
            <AnswerKey
              class={`${prefix()}-answer`}
              label={acceptLabel}
              chord={props.keys.approve}
              tone="grant"
              onPress={() => props.onAccept?.(accept())}
            />
          )}
        </Show>
        <Show when={props.overturn}>
          {(overturn) => (
            <AnswerKey
              class={`${prefix()}-answer`}
              label={overturnLabel}
              chord={props.overturnChord ?? overturnChordDefault}
              tone="deny"
              onPress={() => props.onOverturn?.(overturn())}
            />
          )}
        </Show>
        <Show
          when={sayingWhy()}
          fallback={
            <For each={offers()}>
              {(offer) => (
                <AnswerKey
                  class={`${prefix()}-answer`}
                  label={offer.label}
                  chord={props.keys[offer.pick]}
                  tone={offer.tone}
                  onPress={() => props.onAnswer(offer.pick)}
                />
              )}
            </For>
          }
        >
          <span class={`${prefix()}-reason-prompt`}>{whyPrompt}</span>
          <For each={reasonOffers}>
            {(offer) => (
              <AnswerKey
                class={`${prefix()}-answer`}
                label={offer.label}
                chord={offer.key}
                tone="deny"
                onPress={() => props.onReason?.(offer.reason)}
              />
            )}
          </For>
        </Show>
      </span>
    </Show>
  );
}

export interface BadgeProps {
  activeThreads: number;
  finishedUnseen: number;
  waiting?: number | undefined;
}

export function Badge(props: BadgeProps) {
  const waiting = (): number => props.waiting ?? 0;
  return (
    <Show when={waiting() > 0 || props.activeThreads > 0 || props.finishedUnseen > 0}>
      <span class="kw-companion-badge" data-hit data-tone={badgeTone(props)} aria-hidden="true">
        {badgeCount(props)}
      </span>
    </Show>
  );
}

function badgeTone(props: BadgeProps): "needs" | "back" | "live" {
  if ((props.waiting ?? 0) > 0) return "needs";
  return props.finishedUnseen > 0 ? "back" : "live";
}

function badgeCount(props: BadgeProps): number | string {
  if ((props.waiting ?? 0) > 0) return props.waiting ?? 0;
  return props.activeThreads > 0 ? props.activeThreads : "✓";
}

const classPrefix: Readonly<Record<BubblePlacement, string>> = {
  companion: "kw-companion",
  porch: "kw-stead",
  desk: "kw-desk",
};

interface AnswerKeyProps {
  class: string;
  label: string;
  chord: string;
  tone: "grant" | "deny";
  onPress(): void;
}

function AnswerKey(props: AnswerKeyProps) {
  return (
    <button
      type="button"
      class={props.class}
      data-tone={props.tone}
      onClick={(event) => {
        event.stopPropagation();
        props.onPress();
      }}
    >
      {props.label} <kbd>{props.chord}</kbd>
    </button>
  );
}
