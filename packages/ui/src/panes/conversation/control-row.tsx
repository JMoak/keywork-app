import { createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import "./conversation.css";

export type ControlAsk =
  | {
      readonly kind: "text";
      readonly label: string;
      readonly initial: string;
      readonly choices: readonly string[];
    }
  | { readonly kind: "confirm"; readonly question: string };

export interface ControlRowProps {
  ask: ControlAsk | undefined;
  lines: readonly string[];
  onAnswer: (text: string) => void;
  onConfirm: (agreed: boolean) => void;
  onDismiss: () => void;
}

export function ControlRow(props: ControlRowProps) {
  return (
    <div class="kw-controls">
      <Switch>
        <Match when={textAskOf(props.ask)} keyed>
          {(ask) => <TextAsk ask={ask} onAnswer={props.onAnswer} onDismiss={props.onDismiss} />}
        </Match>
        <Match when={confirmAskOf(props.ask)} keyed>
          {(ask) => <ConfirmLine question={ask.question} onConfirm={props.onConfirm} />}
        </Match>
      </Switch>
      <Show when={props.lines.length > 0}>
        <output class="kw-controls-lines" aria-live="polite">
          <For each={props.lines}>{(line) => <span class="kw-controls-line">{line}</span>}</For>
        </output>
      </Show>
    </div>
  );
}

type TextAskShape = Extract<ControlAsk, { kind: "text" }>;
type ConfirmAskShape = Extract<ControlAsk, { kind: "confirm" }>;

function TextAsk(props: {
  ask: TextAskShape;
  onAnswer: (text: string) => void;
  onDismiss: () => void;
}) {
  const [text, setText] = createSignal(props.ask.initial);
  const [picked, setPicked] = createSignal(-1);
  const matching = createMemo(() =>
    choicesMatching(props.ask.choices, picked() === -1 ? text() : ""),
  );
  let input: HTMLInputElement | undefined;
  onMount(() => input?.focus());

  const pick = (step: number): void => {
    const choices = matching();
    if (choices.length === 0) return;
    const next = (picked() + step + choices.length) % choices.length;
    setPicked(next);
    setText(choices[next] ?? text());
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown") pick(1);
    else if (event.key === "ArrowUp") pick(-1);
    else if (event.key === "Escape") props.onDismiss();
    else if (event.key === "Enter" && text().trim() !== "") props.onAnswer(text().trim());
    else return;
    event.preventDefault();
  };

  return (
    <div class="kw-controls-ask">
      <span class="kw-controls-mark" aria-hidden="true">
        ?
      </span>
      <input
        ref={input}
        class="kw-controls-input"
        type="text"
        aria-label={props.ask.label}
        placeholder={props.ask.label}
        value={text()}
        onInput={(event) => {
          setPicked(-1);
          setText(event.currentTarget.value);
        }}
        onKeyDown={onKeyDown}
      />
      <Show when={matching().length > 0}>
        <ol class="kw-controls-choices" aria-label="known choices">
          <For each={matching()}>
            {(choice) => (
              <li class="kw-controls-choice" data-picked={choice === text() ? "" : undefined}>
                {choice}
              </li>
            )}
          </For>
        </ol>
      </Show>
    </div>
  );
}

function ConfirmLine(props: { question: string; onConfirm: (agreed: boolean) => void }) {
  let line: HTMLDivElement | undefined;
  onMount(() => line?.focus());
  const onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === "y" || key === "enter") props.onConfirm(true);
    else if (key === "n" || key === "escape") props.onConfirm(false);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div
      ref={line}
      class="kw-controls-confirm"
      role="alertdialog"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {props.question}
    </div>
  );
}

function choicesMatching(choices: readonly string[], needle: string): readonly string[] {
  const lowered = needle.trim().toLowerCase();
  return lowered === ""
    ? choices
    : choices.filter((choice) => choice.toLowerCase().includes(lowered));
}

function textAskOf(ask: ControlAsk | undefined): TextAskShape | undefined {
  return ask?.kind === "text" ? ask : undefined;
}

function confirmAskOf(ask: ControlAsk | undefined): ConfirmAskShape | undefined {
  return ask?.kind === "confirm" ? ask : undefined;
}
