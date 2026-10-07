import { createSignal, type JSX, Show } from "solid-js";
import "./overview.css";

export interface Cursor {
  index(): number;
  move(delta: number): void;
  set(index: number): void;
}

export function createCursor(count: () => number): Cursor {
  const [raw, setRaw] = createSignal(0);
  const clamp = (index: number): number => Math.min(Math.max(0, index), Math.max(0, count() - 1));
  const index = (): number => clamp(raw());
  return {
    index,
    move: (delta) => setRaw(clamp(index() + delta)),
    set: (next) => setRaw(clamp(next)),
  };
}

export type RowDensity = "light" | "medium" | "heavy" | "full";

export interface OverviewRowProps {
  cursor: boolean;
  indent?: boolean | undefined;
  muted?: boolean | undefined;
  mark?: string | undefined;
  density?: RowDensity | undefined;
  aside?: string | undefined;
  onClick?: (() => void) | undefined;
  children: JSX.Element;
}

export function OverviewRow(props: OverviewRowProps) {
  return (
    <li
      class="kw-ov-row"
      data-cursor={props.cursor ? "" : undefined}
      data-indent={props.indent ? "" : undefined}
      data-muted={props.muted ? "" : undefined}
    >
      <button type="button" class="kw-ov-button" onClick={() => props.onClick?.()}>
        <span class="kw-ov-mark" aria-hidden="true" data-density={props.density}>
          {props.mark ?? " "}
        </span>
        <span class="kw-ov-name">{props.children}</span>
        <Show when={props.aside}>{(text) => <span class="kw-ov-aside">{text()}</span>}</Show>
      </button>
    </li>
  );
}

export interface SubLineProps {
  text: string;
  tone?: "error" | undefined;
}

export function SubLine(props: SubLineProps) {
  return (
    <p class="kw-ov-sub" data-tone={props.tone}>
      {props.text}
    </p>
  );
}

export interface DraftLineProps {
  label: string;
  initial?: string | undefined;
  placeholder?: string | undefined;
  onSubmit(text: string): void;
  onCancel(): void;
}

export function DraftLine(props: DraftLineProps) {
  const [text, setText] = createSignal(props.initial ?? "");
  return (
    <form
      class="kw-ov-draft"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(text().trim());
      }}
    >
      <span>{props.label}</span>
      <input
        aria-label={props.label}
        value={text()}
        placeholder={props.placeholder ?? ""}
        ref={(input) => queueMicrotask(() => input.focus())}
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") props.onCancel();
        }}
      />
    </form>
  );
}

export interface ChoiceLineProps {
  question: string;
  choices: Readonly<Record<string, string>>;
  onChoose(key: string): void;
  onCancel(): void;
}

export function ChoiceLine(props: ChoiceLineProps) {
  const legend = () =>
    Object.entries(props.choices)
      .map(([key, label]) => `${key} ${label}`)
      .join(" · ");
  return (
    <p
      class="kw-ov-line"
      data-tone="ask"
      tabIndex={-1}
      ref={(line) => queueMicrotask(() => line.focus())}
      onKeyDown={(event) => {
        event.preventDefault();
        if (event.key in props.choices) props.onChoose(event.key);
        else props.onCancel();
      }}
    >
      {props.question} · {legend()} · any other key cancels
    </p>
  );
}

export interface ConfirmLineProps {
  question: string;
  onConfirm(): void;
  onCancel(): void;
}

export const confirmKey = "y";

export function ConfirmLine(props: ConfirmLineProps) {
  return (
    <ChoiceLine
      question={props.question}
      choices={{ [confirmKey]: "confirms" }}
      onChoose={() => props.onConfirm()}
      onCancel={() => props.onCancel()}
    />
  );
}

export interface NoticeLineProps {
  text: string | undefined;
  tone?: "error" | undefined;
}

export function NoticeLine(props: NoticeLineProps) {
  return (
    <Show when={props.text}>
      {(text) => (
        <p class="kw-ov-line" data-tone={props.tone}>
          {text()}
        </p>
      )}
    </Show>
  );
}
