import type { Skin } from "@keywork-app/habitat";
import { CreaturePortrait } from "../../creatures/portrait.tsx";
import { createRenderer, loadSkin, type Renderer } from "../stead/habitat-render.ts";
import { skinRefusedWord } from "./copy.ts";

export const portraitSize = 2;
export const portraitClip = "idle";

export interface PortraitProps {
  skin: string;
  hueStop: number;
  name: string;
}

export interface Portrait {
  readonly skin: Skin;
  readonly render: Renderer;
}

export function PortraitView(props: PortraitProps) {
  return (
    <CreaturePortrait
      skin={props.skin}
      hueStop={props.hueStop}
      name={props.name}
      size={portraitSize}
      unavailable={skinRefusedWord}
    />
  );
}

export function portraitOf(id: string): Portrait | undefined {
  const loaded = loadSkin(id);
  return loaded.ok ? { skin: loaded.skin, render: createRenderer(loaded.skin) } : undefined;
}

export function idleFrameAfter(skin: Skin, frame: number): { frame: number; ms: number } {
  const row = skin.rows[portraitClip];
  const next = (frame + 1) % row.frames;
  return { frame: next, ms: row.ms[next] ?? row.ms[0] ?? 500 };
}
