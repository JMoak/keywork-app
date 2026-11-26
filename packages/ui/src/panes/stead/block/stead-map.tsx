import type { Appearance, Kit, Land, LandMemory } from "@keywork-app/habitat/block";
import { Show } from "solid-js";
import { useProductProfile } from "../../../chrome/product.ts";
import type { ShellSeams } from "../../registry.ts";
import type { BlockWorldControls } from "./block-world.tsx";
import { createLands, type KeptLands, machineSeamsOf } from "./machines.ts";
import { type MapControls, MapWorld } from "./map-world.tsx";
import type { Opening } from "./press.ts";

export interface SteadMapProps {
  readonly shell: Pick<ShellSeams, "client" | "feed">;
  readonly shown: boolean;
  readonly town: BlockWorldControls | undefined;
  readonly kit: Kit;
  readonly light: Appearance | undefined;
  readonly focused: boolean;
  readonly creatures: number;
  readonly stored: LandMemory | undefined;
  keep(memory: KeptLands): void;
  onControls(controls: MapControls): void;
  onOpen(land: Land): void;
  onLeft(): void;
}

export function SteadMap(props: SteadMapProps) {
  const profile = useProductProfile();
  const lands = createLands(
    machineSeamsOf(props.shell),
    { stored: () => props.stored, keep: (memory) => props.keep(memory) },
    () => props.shown,
  );
  return (
    <Show when={props.shown ? props.town : undefined}>
      {(town) => (
        <MapWorld
          kit={props.kit}
          light={props.light}
          lands={lands()}
          look={() => town().look()}
          side={town().side()}
          focused={props.focused}
          creatures={props.creatures}
          product={capitalised(profile.name)}
          onControls={(controls) => props.onControls(controls)}
          onPress={(land) => props.onOpen(land)}
          onLeft={() => props.onLeft()}
        />
      )}
    </Show>
  );
}

export function onTheMap(action: string, map: MapControls | undefined): boolean {
  switch (action) {
    case "stead.down":
      map?.step(1);
      return true;
    case "stead.up":
      map?.step(-1);
      return true;
    case "stead.open":
      map?.press();
      return true;
    default:
      return false;
  }
}

export function parcelsOn(land: Land): Opening {
  return { kind: "pane", spec: { kind: "parcels", machine: land.id } };
}

export function mapSpoken(shown: boolean): string {
  return shown
    ? "the map of your machines: press to step into the town"
    : "the town: press to step back to the map of your machines";
}

function capitalised(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}
