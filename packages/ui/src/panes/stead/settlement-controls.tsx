import {
  type CourtyardDistrict,
  type WorkshopFamily,
  workshopFamilies,
} from "@keywork-app/habitat";
import { type GardenKind, gardenKinds, workshopDesign } from "@keywork-app/habitat/render";
import { For, Show } from "solid-js";

export interface DistrictSummary extends CourtyardDistrict {
  readonly occupied: number;
  readonly waiting: number;
}

export function SettlementControls(props: {
  readonly districts: readonly DistrictSummary[];
  readonly district: number;
  readonly onDistrict: (index: number) => void;
  readonly selected: string | undefined;
  readonly family: WorkshopFamily | undefined;
  readonly automaticFamily: WorkshopFamily;
  readonly garden: GardenKind | undefined;
  readonly onFamily: (family: string) => void;
  readonly onGarden: (garden: string) => void;
  readonly overview: boolean;
  readonly compact: boolean;
  readonly onArrange: () => void;
  readonly canUndo: boolean;
  readonly onUndo: () => void;
}) {
  return (
    <fieldset
      class="kw-settlement-controls"
      aria-label="Neighborhood and appearance"
      data-native-activation
    >
      <Show when={props.districts.length > 1}>
        <label>
          Neighborhood
          <select
            aria-label="Neighborhood"
            data-keys-owned
            value={props.district}
            onChange={(event) => props.onDistrict(Number(event.currentTarget.value))}
          >
            <For each={props.districts}>
              {(district) => (
                <option value={district.index}>
                  {district.address} · {district.occupied} creatures
                  {district.waiting > 0 ? ` · ${district.waiting} waiting` : ""}
                </option>
              )}
            </For>
          </select>
        </label>
        <button
          type="button"
          disabled={props.district === 0}
          onClick={() => props.onDistrict(props.district - 1)}
        >
          Previous neighborhood
        </button>
        <button
          type="button"
          disabled={props.district >= props.districts.length - 1}
          onClick={() => props.onDistrict(props.district + 1)}
        >
          Next neighborhood
        </button>
      </Show>
      <Show when={props.overview}>
        <button type="button" onClick={props.onArrange}>
          {props.compact ? "Spread courts out" : "Arrange courts compactly"}
        </button>
      </Show>
      <Show when={props.selected !== undefined}>
        <label>
          Workshop style
          <select
            aria-label="Workshop style"
            data-keys-owned
            value={props.family ?? "auto"}
            onChange={(event) => props.onFamily(event.currentTarget.value)}
          >
            <option value="auto">Automatic · {workshopDesign(props.automaticFamily).title}</option>
            <For each={workshopFamilies}>
              {(family) => <option value={family}>{workshopDesign(family).title}</option>}
            </For>
          </select>
        </label>
        <label>
          Garden
          <select
            aria-label="Garden"
            data-keys-owned
            value={props.garden ?? "none"}
            onChange={(event) => props.onGarden(event.currentTarget.value)}
          >
            <option value="none">No garden</option>
            <For each={gardenKinds}>
              {(garden) => (
                <option value={garden}>{garden.charAt(0).toUpperCase() + garden.slice(1)}</option>
              )}
            </For>
          </select>
        </label>
      </Show>
      <Show when={props.canUndo}>
        <button type="button" onClick={props.onUndo}>
          Undo arrangement
        </button>
      </Show>
    </fieldset>
  );
}
