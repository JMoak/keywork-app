import { createSignal, For, Show } from "solid-js";
import { KeyAct } from "../../chrome/key-act.tsx";
import {
  type EarnedRow,
  earlierOnesSpoken,
  earlierOnesWord,
  earlierWord,
  earnedHeading,
  foldWord,
} from "./earned.ts";
import { dayWord } from "./profile.ts";

export interface Folds {
  open(kind: string): boolean;
  everyOpen(): boolean;
  turn(kind: string): void;
  turnAll(): void;
}

export function createFolds(): Folds {
  const [everyOpen, setEveryOpen] = createSignal(false);
  const [turned, setTurned] = createSignal<ReadonlySet<string>>(new Set());
  const open = (kind: string): boolean => everyOpen() !== turned().has(kind);
  return {
    open,
    everyOpen,
    turn: (kind) => {
      const next = new Set(turned());
      if (!next.delete(kind)) next.add(kind);
      setTurned(next);
    },
    turnAll: () => {
      setEveryOpen(!everyOpen());
      setTurned(new Set<string>());
    },
  };
}

export interface EarnedSectionProps {
  rows: readonly EarnedRow[];
  folds: boolean;
  everyOpen: boolean;
  chord: string;
  onTurn(kind: string): void;
  onTurnAll(): void;
}

export function EarnedSection(props: EarnedSectionProps) {
  return (
    <Show when={props.rows.length > 0}>
      <h3 class="kw-creature-heading kw-creature-earned-heading" data-native-activation>
        <span>{earnedHeading}</span>
        <Show when={props.folds}>
          <KeyAct
            label={earlierOnesWord}
            chord={props.chord}
            pressed={props.everyOpen}
            spoken={props.everyOpen ? earlierOnesSpoken.open : earlierOnesSpoken.folded}
            onPress={props.onTurnAll}
          />
        </Show>
      </h3>
      <ul class="kw-creature-earned" aria-label={earnedHeading} data-native-activation>
        <For each={props.rows}>
          {(row) => (
            <li data-earlier={row.earlier ? "" : undefined}>
              <time dateTime={row.earnedAt}>{dayWord(row.earnedAt)}</time>
              <span class="kw-creature-earned-what">
                <span class="kw-creature-earned-title">{row.title}</span>
                <span class="kw-creature-earned-proof">{row.proof}</span>
              </span>
              <Show when={row.folded + row.opened > 0}>
                <KeyAct
                  class="kw-creature-earned-fold"
                  label={row.folded > 0 ? earlierWord(row.folded) : foldWord}
                  onPress={() => props.onTurn(row.kind)}
                />
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
