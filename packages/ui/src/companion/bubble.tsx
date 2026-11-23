import type { ToolRun } from "@keywork-app/client";
import type { DenyReason } from "@keywork-app/protocol";
import { Show } from "solid-js";
import { type AskChords, type AskPick, offeredAnswers, pickLabels } from "../page/ask-card.tsx";
import {
  AnswerKey,
  type AnswerOffer,
  AskAnswers,
  waitWhenItAppears,
} from "../page/ask-card-answers.tsx";
import type { AnswerBy } from "../page/ask-card-guard.ts";
import { askingWhy, stopAskingWhy } from "../page/ask-card-why.ts";
import { NoteLine } from "../page/note-line.tsx";
import type { NeedsYouBubble as Bubble, ChoreAccept, OverturnOffer } from "./port.ts";

export type { AnswerOffer } from "../page/ask-card-answers.tsx";

export type BubblePlacement = "companion" | "porch" | "line" | "desk" | "ledger" | "band";

export const acceptLabel = "accept";

export const overturnLabel = "overturn";

export const overturnChordDefault = "x";

export const answerLabels = pickLabels;

export interface NeedsYouBubbleProps {
  placement?: Extract<BubblePlacement, "companion" | "porch"> | undefined;
  bubble: Bubble;
  keys: AskChords;
  run?: ToolRun | undefined;
  wording?: boolean | undefined;
  overturnChord?: string | undefined;
  onOpen(): void;
  onAnswer(pick: AskPick, by: AnswerBy): void;
  onReason?(reason: DenyReason, by: AnswerBy): void;
  onAccept?(accept: ChoreAccept, by: AnswerBy): void;
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
            callId={props.bubble.callId}
            answers={props.bubble.callId === undefined ? [] : props.bubble.answers}
            accept={props.bubble.accept}
            overturn={props.bubble.overturn}
            overturnChord={props.overturnChord}
            onAnswer={(pick, by) => props.onAnswer(pick, by)}
            onReason={(reason, by) => props.onReason?.(reason, by)}
            onAccept={(accept, by) => props.onAccept?.(accept, by)}
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
  callId?: string | undefined;
  answers?: readonly AskPick[] | undefined;
  keyless?: boolean | undefined;
  accept?: ChoreAccept | undefined;
  overturn?: OverturnOffer | undefined;
  overturnChord?: string | undefined;
  onAnswer(pick: AskPick, by: AnswerBy): void;
  onReason?(reason: DenyReason, by: AnswerBy): void;
  onAccept?(accept: ChoreAccept, by: AnswerBy): void;
  onOverturn?(overturn: OverturnOffer): void;
}

export function answerOffers(
  run: ToolRun | undefined,
  answers: readonly AskPick[] = [],
): AnswerOffer[] {
  if (run !== undefined) return offeredAnswers(run);
  return answers.map((pick) => ({
    pick,
    label: pickLabels[pick],
    tone: pick === "deny" ? "deny" : "grant",
  }));
}

export function NeedsYouAnswers(props: NeedsYouAnswersProps) {
  const prefix = () => classPrefix[props.placement];
  const offers = () => answerOffers(props.run, props.answers);
  const callId = () => props.run?.callId ?? props.callId;
  const sayingWhy = () => {
    const asked = callId();
    return asked !== undefined && askingWhy(asked);
  };
  const takeBack = (): void => {
    const asked = callId();
    if (asked !== undefined) stopAskingWhy(asked);
  };
  waitWhenItAppears(() => props.accept?.digest);
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
              onPress={(by) => props.onAccept?.(accept(), by)}
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
              unguarded
              onPress={() => props.onOverturn?.(overturn())}
            />
          )}
        </Show>
        <AskAnswers
          callId={callId()}
          offers={offers()}
          keys={props.keys}
          why={sayingWhy()}
          part={prefix()}
          keyless={props.keyless}
          onAnswer={(pick, by) => props.onAnswer(pick, by)}
          onReason={(reason, by) => props.onReason?.(reason, by)}
          onBack={takeBack}
        />
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
  line: "kw-stead-line",
  desk: "kw-desk",
  ledger: "kw-ledger",
  band: "kw-talk",
};
