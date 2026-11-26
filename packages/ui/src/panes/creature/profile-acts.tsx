import { For, Show } from "solid-js";
import { KeyAct } from "../../chrome/key-act.tsx";

export interface ProfileAct {
  readonly chord: string;
  readonly words: string;
  onPress(): void;
}

export interface ActsLineProps {
  acts: readonly ProfileAct[];
  class: string;
}

export function ActsLine(props: ActsLineProps) {
  return (
    <p class={props.class} data-native-activation>
      <For each={props.acts}>
        {(act, at) => (
          <>
            <Show when={at() > 0}> · </Show>
            <KeyAct chord={act.chord} label={act.words} keyLeads onPress={act.onPress} />
          </>
        )}
      </For>
    </p>
  );
}

export interface OpensActProps {
  chord: string;
  words: string;
  onPress(): void;
}

export function OpensAct(props: OpensActProps) {
  return (
    <span class="kw-creature-opens" data-native-activation>
      <KeyAct chord={props.chord} label={props.words} keyLeads onPress={props.onPress} />
    </span>
  );
}
