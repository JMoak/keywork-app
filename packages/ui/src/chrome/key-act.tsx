import { Show } from "solid-js";
import "./key-act.css";

export interface KeyActProps {
  label?: string | undefined;
  chord?: string | undefined;
  keyLeads?: boolean | undefined;
  class?: string | undefined;
  pressed?: boolean | undefined;
  spoken?: string | undefined;
  offTheTabPath?: boolean | undefined;
  onPress(): void;
}

export function KeyAct(props: KeyActProps) {
  const label = () => (
    <Show when={props.label}>{(text) => <span class="kw-key-act-label">{text()}</span>}</Show>
  );
  const key = () => <Show when={props.chord}>{(chord) => <kbd>{chord()}</kbd>}</Show>;
  const between = (): string => (props.label === undefined || props.chord === undefined ? "" : " ");
  return (
    <button
      type="button"
      class={props.class === undefined ? "kw-key-act" : `kw-key-act ${props.class}`}
      aria-pressed={props.pressed}
      aria-label={props.spoken}
      tabIndex={props.offTheTabPath === true ? -1 : undefined}
      onClick={(event) => {
        event.stopPropagation();
        props.onPress();
      }}
    >
      <Show
        when={props.keyLeads === true}
        fallback={
          <>
            {label()}
            {between()}
            {key()}
          </>
        }
      >
        {key()}
        {between()}
        {label()}
      </Show>
    </button>
  );
}
