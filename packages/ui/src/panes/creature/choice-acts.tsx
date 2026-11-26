import { For } from "solid-js";
import { KeyAct } from "../../chrome/key-act.tsx";

export interface ChoiceActsProps {
  question: string;
  choices: Readonly<Record<string, string>>;
  chosen?: string | undefined;
  onChoose(key: string): void;
  onCancel(): void;
}

export const cancelsWord = "any other key cancels";

export function ChoiceActs(props: ChoiceActsProps) {
  return (
    <p
      class="kw-ov-line kw-creature-choices"
      data-tone="ask"
      tabIndex={-1}
      ref={(line) => queueMicrotask(() => line.focus())}
      onKeyDown={(event) => {
        event.preventDefault();
        if (event.key in props.choices) props.onChoose(event.key);
        else props.onCancel();
      }}
    >
      {props.question}
      <For each={Object.entries(props.choices)}>
        {([key, label]) => (
          <>
            {" · "}
            <KeyAct
              chord={key}
              label={label}
              keyLeads
              offTheTabPath
              pressed={props.chosen === undefined ? undefined : props.chosen === key}
              onPress={() => props.onChoose(key)}
            />
          </>
        )}
      </For>
      {" · "}
      <KeyAct label={cancelsWord} offTheTabPath onPress={props.onCancel} />
    </p>
  );
}
