import { createSignal, createUniqueId, For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import {
  cronWords,
  destinationChoiceWords,
  formWords,
  grantsConsentLine,
  idHint,
  notifyWords,
  toolChoiceWords,
  triggerChoiceWords,
} from "./copy.ts";
import { type ChoreDraft, choreFileOf, idFromTitle } from "./draft.ts";
import type { ChoreFile } from "./wire.ts";

export interface ChoreFormProps {
  readonly creature: string;
  readonly initial: ChoreDraft;
  readonly editing: boolean;
  readonly problem: string | undefined;
  readonly acceptChord: string;
  onSave(file: ChoreFile): void;
  onCancel(): void;
}

export function ChoreForm(props: ChoreFormProps) {
  const [draft, setDraft] = createStore<ChoreDraft>({ ...props.initial });
  const [problem, setProblem] = createSignal<string>();
  const group = createUniqueId();
  const field =
    <Key extends keyof ChoreDraft>(key: Key) =>
    (value: ChoreDraft[Key]): void =>
      setDraft(key, value);

  const save = (): void => {
    const reading = choreFileOf(draft);
    setProblem(reading.ok ? undefined : reading.problem);
    if (reading.ok) props.onSave(reading.file);
  };

  const keys = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onCancel();
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save();
    }
  };

  return (
    <form
      class="kw-chores-form"
      aria-label={formWords.heading(props.creature, props.editing)}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onKeyDown={keys}
    >
      <p class="kw-chores-heading">{formWords.heading(props.creature, props.editing)}</p>
      <TextField label={formWords.title} value={draft.title} onInput={field("title")} first />
      <TextField
        label={formWords.id}
        value={draft.id}
        placeholder={idHint(idFromTitle(draft.title))}
        readOnly={props.editing}
        onInput={field("id")}
      />
      <TextField
        label={formWords.instructions}
        value={draft.instructions}
        onInput={field("instructions")}
        multiline
      />
      <ChoiceField
        label={formWords.trigger}
        group={`${group}-trigger`}
        choices={triggerChoiceWords}
        value={draft.trigger}
        onChoose={field("trigger")}
      />
      <Switch>
        <Match when={draft.trigger === "cron"}>
          <TextField label={formWords.cron} value={draft.cron} onInput={field("cron")} />
          <TextField label={formWords.tz} value={draft.tz} onInput={field("tz")} />
          <TextField
            label={formWords.until}
            value={draft.until}
            placeholder={formWords.untilHint}
            onInput={field("until")}
          />
          <p class="kw-chores-preview">{cronWords(draft.cron)}</p>
        </Match>
        <Match when={draft.trigger === "interval"}>
          <TextField label={formWords.every} value={draft.every} onInput={field("every")} />
          <TextField
            label={formWords.until}
            value={draft.until}
            placeholder={formWords.untilHint}
            onInput={field("until")}
          />
        </Match>
        <Match when={draft.trigger === "at"}>
          <TextField label={formWords.at} value={draft.at} onInput={field("at")} />
        </Match>
        <Match when={draft.trigger === "file-watch"}>
          <TextField
            label={formWords.paths}
            value={draft.paths}
            onInput={field("paths")}
            multiline
          />
        </Match>
        <Match when={draft.trigger === "webhook"}>
          <p class="kw-chores-preview">{formWords.webhookHint}</p>
        </Match>
        <Match when={draft.trigger === "event"}>
          <TextField
            label={formWords.eventName}
            value={draft.eventName}
            onInput={field("eventName")}
          />
          <TextField
            label={formWords.where}
            value={draft.where}
            onInput={field("where")}
            multiline
          />
        </Match>
      </Switch>
      <ChoiceField
        label={formWords.destination}
        group={`${group}-destination`}
        choices={destinationChoiceWords}
        value={draft.destination}
        onChoose={field("destination")}
      />
      <Switch>
        <Match when={draft.destination === "thread"}>
          <TextField label={formWords.thread} value={draft.thread} onInput={field("thread")} />
        </Match>
        <Match when={draft.destination === "file"}>
          <TextField label={formWords.path} value={draft.path} onInput={field("path")} />
        </Match>
      </Switch>
      <ChoiceField
        label={formWords.notify}
        group={`${group}-notify`}
        choices={notifyWords}
        value={draft.notify}
        onChoose={field("notify")}
      />
      <ChoiceField
        label={formWords.tools}
        group={`${group}-tools`}
        choices={toolChoiceWords}
        value={draft.tools}
        onChoose={field("tools")}
      />
      <Show when={draft.tools !== "read-only"}>
        <TextField
          label={formWords.grants}
          value={draft.grants}
          placeholder={formWords.grantsHint}
          onInput={field("grants")}
          multiline
        />
        <p class="kw-chores-consent">{grantsConsentLine(props.acceptChord)}</p>
      </Show>
      <TextField label={formWords.usd} value={draft.usd} onInput={field("usd")} />
      <TextField label={formWords.minutes} value={draft.minutes} onInput={field("minutes")} />
      <p class="kw-chores-form-keys">
        <button type="submit" class="kw-ov-new">
          {formWords.save}
        </button>
        <button type="button" class="kw-ov-new" onClick={() => props.onCancel()}>
          {formWords.cancel}
        </button>
        <span>{formWords.keys}</span>
      </p>
      <Show when={problem() ?? props.problem}>
        {(text) => (
          <p class="kw-ov-line" data-tone="error" role="alert">
            {text()}
          </p>
        )}
      </Show>
    </form>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string | undefined;
  readonly multiline?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly first?: boolean | undefined;
  onInput(value: string): void;
}

function TextField(props: TextFieldProps) {
  const focusFirst = (element: HTMLElement): void => {
    if (props.first) queueMicrotask(() => element.focus());
  };
  return (
    <label class="kw-chores-field">
      <span>{props.label}</span>
      <Show
        when={props.multiline}
        fallback={
          <input
            aria-label={props.label}
            value={props.value}
            placeholder={props.placeholder ?? ""}
            readOnly={props.readOnly ?? false}
            ref={focusFirst}
            onInput={(event) => props.onInput(event.currentTarget.value)}
          />
        }
      >
        <textarea
          aria-label={props.label}
          value={props.value}
          placeholder={props.placeholder ?? ""}
          rows={3}
          ref={focusFirst}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
      </Show>
    </label>
  );
}

interface ChoiceFieldProps<Value extends string> {
  readonly label: string;
  readonly group: string;
  readonly choices: Readonly<Record<Value, string>>;
  readonly value: Value;
  onChoose(value: Value): void;
}

function ChoiceField<Value extends string>(props: ChoiceFieldProps<Value>) {
  const entries = () => Object.entries(props.choices) as Array<[Value, string]>;
  return (
    <fieldset class="kw-chores-choice">
      <legend>{props.label}</legend>
      <For each={entries()}>
        {([value, words]) => (
          <label>
            <input
              type="radio"
              name={props.group}
              value={value}
              checked={props.value === value}
              onChange={() => props.onChoose(value)}
            />
            {words}
          </label>
        )}
      </For>
    </fieldset>
  );
}
