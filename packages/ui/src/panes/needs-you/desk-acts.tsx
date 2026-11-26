import { Show } from "solid-js";
import { KeyAct } from "../../chrome/key-act.tsx";
import type { DeskKeys } from "./desk.ts";

export interface DeskActsProps {
  keys: DeskKeys;
  decided: boolean;
  onDismiss(): void;
  onNext(): void;
  onOverturn(): void;
}

export const deskActWords = {
  dismiss: "dismiss",
  next: "next waiting",
  overturn: "overturn",
} as const;

export function DeskActs(props: DeskActsProps) {
  return (
    <p class="kw-desk-acts" data-native-activation>
      <KeyAct label={deskActWords.next} chord={props.keys.waiting} onPress={props.onNext} />
      <KeyAct label={deskActWords.dismiss} chord={props.keys.dismiss} onPress={props.onDismiss} />
      <Show when={props.decided}>
        <KeyAct
          label={deskActWords.overturn}
          chord={props.keys.overturn}
          onPress={props.onOverturn}
        />
      </Show>
    </p>
  );
}
