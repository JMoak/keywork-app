import { CreaturePortrait } from "../creatures/portrait.tsx";
import { skinLabel } from "./copy.ts";

export interface PortraitProps {
  readonly skin: string;
  readonly hueStop: number;
}

export const portraitFacing = "right";
export const portraitClip = "idle";

export function Portrait(props: PortraitProps) {
  return (
    <CreaturePortrait
      skin={props.skin}
      hueStop={props.hueStop}
      name={skinLabel(props.skin)}
      class="kw-onboard-portrait"
      unavailable={`skin ${props.skin} refused`}
    />
  );
}
