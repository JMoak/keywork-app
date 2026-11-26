import { samePlace } from "@keywork-app/habitat/block";
import type { Honour, SteadPlace } from "@keywork-app/protocol";
import { For, Show } from "solid-js";
import type { Rect } from "../../../layout/index.ts";
import "./green-card.css";
import { steadEarnedHeading } from "./honour-words.ts";
import { greenPlace, type SteadStanding } from "./honours.ts";
import { besideTheBuilding, dayWord } from "./site-card.tsx";

export interface GreenCardProps {
  readonly standing: SteadStanding | undefined;
  readonly pointed: SteadPlace | undefined;
  readonly held: SteadPlace | undefined;
  readonly stage: { readonly width: number; readonly height: number };
  readonly now: number;
  onStage(place: SteadPlace): Rect | undefined;
}

interface Shown {
  readonly monument: Rect;
  readonly honours: readonly Honour[];
  readonly held: boolean;
}

export function GreenCard(props: GreenCardProps) {
  const shown = (): Shown | undefined => {
    const held = samePlace(props.held, greenPlace);
    if (!held && !samePlace(props.pointed, greenPlace)) return undefined;
    const monument = props.onStage(greenPlace);
    const honours = props.standing?.ofTheStead() ?? [];
    return monument === undefined || honours.length === 0 ? undefined : { monument, honours, held };
  };
  return (
    <Show when={shown()}>
      {(card) => (
        <aside
          class="kw-stead-site kw-stead-green"
          role="status"
          data-held={card().held ? "" : undefined}
          style={besideTheBuilding(card().monument, props.stage)}
        >
          <strong class="kw-stead-site-name">{steadEarnedHeading}</strong>
          <ul class="kw-stead-green-earned">
            <For each={card().honours}>
              {(honour) => (
                <li>
                  <span>{props.standing?.titleOf(honour)}</span>
                  <time dateTime={honour.earnedAt}>
                    {dayWord(Date.parse(honour.earnedAt), props.now)}
                  </time>
                </li>
              )}
            </For>
          </ul>
        </aside>
      )}
    </Show>
  );
}
