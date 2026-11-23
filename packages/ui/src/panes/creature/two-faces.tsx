import { For } from "solid-js";
import { KeyAct } from "../../chrome/key-act.tsx";
import { faceSpoken, faceWords } from "./copy.ts";

export type Face = "ledger" | "profile";

export interface TwoFacesProps {
  showing: Face;
  chord: string;
  onTurn(): void;
}

export function TwoFaces(props: TwoFacesProps) {
  const turnTo = (face: Face): void => {
    if (face !== props.showing) props.onTurn();
  };
  return (
    <div class="kw-creature-faces" data-native-activation>
      <div class="kw-creature-faces-turn">
        <For each={faces}>
          {(face) => (
            <KeyAct
              label={faceWords[face]}
              spoken={faceSpoken[face]}
              chord={face === props.showing ? undefined : props.chord}
              pressed={face === props.showing}
              onPress={() => turnTo(face)}
            />
          )}
        </For>
      </div>
    </div>
  );
}

const faces: readonly Face[] = ["ledger", "profile"];
