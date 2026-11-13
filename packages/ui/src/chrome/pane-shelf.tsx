import { For, Show } from "solid-js";
import type { Absence } from "../layout/index.ts";
import { type LifecycleState, stampGlyph } from "./stamp.ts";
import { pinMark } from "./title-row.tsx";
import "./pane-shelf.css";

export interface ShelfItem {
  readonly id: string;
  readonly name: string;
  readonly ordinal: number;
  readonly why: Absence;
  readonly state: LifecycleState;
  readonly pinned: boolean;
}

export interface PaneShelfProps {
  items: readonly ShelfItem[];
  hint: string | undefined;
  onReturn: (id: string) => void;
}

export const tuckedGloss = "waiting for room";

export function PaneShelf(props: PaneShelfProps) {
  return (
    <Show when={props.items.length > 0}>
      <nav class="kw-shelf" aria-label="panes on the shelf">
        <span class="kw-shelf-lead" aria-hidden="true">
          shelf
        </span>
        <For each={props.items}>
          {(item) => (
            <button
              type="button"
              class="kw-shelf-pane"
              data-why={item.why}
              data-state={item.state}
              aria-label={shelfLabel(item)}
              onClick={() => props.onReturn(item.id)}
            >
              <Show when={item.state !== "idle"}>
                <span class="kw-shelf-stamp" aria-hidden="true">
                  {stampGlyph(item.state)}
                </span>
              </Show>
              <span class="kw-shelf-ordinal">{item.ordinal}</span>
              <Show when={item.pinned}>
                <span class="kw-shelf-pin" aria-hidden="true">
                  {pinMark}
                </span>
              </Show>
              <span class="kw-shelf-name">{item.name}</span>
              <Show when={item.why === "tucked"}>
                <span class="kw-shelf-why">{tuckedGloss}</span>
              </Show>
            </button>
          )}
        </For>
        <Show when={props.hint}>
          {(hint) => <kbd class="kw-shelf-hint">{hint()} returns the last</kbd>}
        </Show>
      </nav>
    </Show>
  );
}

export function shelfLabel(item: ShelfItem): string {
  const standing = item.why === "tucked" ? tuckedGloss : "shelved";
  const wanting = item.state === "needs-you" ? ", needs you" : "";
  return `${item.name}, pane ${item.ordinal}, ${standing}${wanting}`;
}
