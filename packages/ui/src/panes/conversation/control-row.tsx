import { createMemo, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { keepInView } from "../overview/rows.tsx";
import "./conversation.css";

export type ControlAsk =
  | {
      readonly kind: "text";
      readonly label: string;
      readonly initial: string;
      readonly choices: readonly string[];
    }
  | { readonly kind: "confirm"; readonly question: string }
  | {
      readonly kind: "pick";
      readonly label: string;
      readonly hint: string;
      readonly options: readonly PickOption[];
    };

export interface PickOption {
  readonly key: string;
  readonly text: string;
  readonly note?: string | undefined;
}

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
        <Match when={pickAskOf(props.ask)} keyed>
          {(ask) => <PickAsk ask={ask} onAnswer={props.onAnswer} onDismiss={props.onDismiss} />}
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
type PickAskShape = Extract<ControlAsk, { kind: "pick" }>;

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

function PickAsk(props: {
  ask: PickAskShape;
  onAnswer: (key: string) => void;
  onDismiss: () => void;
}) {
  const [at, setAt] = createSignal(props.ask.options.length - 1);
  let picker: HTMLDivElement | undefined;
  onMount(() => picker?.focus());

  const step = (by: number): void => {
    setAt((index) => Math.min(props.ask.options.length - 1, Math.max(0, index + by)));
  };
  const choose = (index: number): void => {
    const option = props.ask.options[index];
    if (option !== undefined) props.onAnswer(option.key);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === "ArrowUp" || event.key === "k") step(-1);
    else if (event.key === "ArrowDown" || event.key === "j") step(1);
    else if (event.key === "Enter") choose(at());
    else if (event.key === "Escape") props.onDismiss();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={picker}
      class="kw-controls-pick"
      role="dialog"
      aria-label={props.ask.label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <ol class="kw-controls-options">
        <For each={props.ask.options}>
          {(option, index) => (
            <li ref={(row) => keepInView(row, () => index() === at())}>
              <button
                type="button"
                tabIndex={-1}
                class="kw-controls-option"
                aria-current={index() === at() ? "true" : undefined}
                data-picked={index() === at() ? "" : undefined}
                onClick={() => choose(index())}
              >
                <span class="kw-controls-option-text">{option.text}</span>
                <Show when={option.note}>
                  {(note) => <span class="kw-controls-option-note">{note()}</span>}
                </Show>
              </button>
            </li>
          )}
        </For>
      </ol>
      <span class="kw-controls-hint">{props.ask.hint}</span>
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

function pickAskOf(ask: ControlAsk | undefined): PickAskShape | undefined {
  return ask?.kind === "pick" ? ask : undefined;
}
