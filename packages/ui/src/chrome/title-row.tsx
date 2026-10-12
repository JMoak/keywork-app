import { For, Show } from "solid-js";
import type { ContextLevel } from "../instruments/context.ts";
import { ContextGauge } from "../instruments/gauge.tsx";
import type { WidthTier } from "../page/tiers.ts";
import type { ChromeWeight } from "./root-attributes.ts";
import { type LifecycleState, stampGlyph } from "./stamp.ts";

export type TitleZone = "stamp" | "name" | "bot" | "inference" | "mode" | "telemetry";

export interface TitleRowProps {
  name: string;
  state: LifecycleState;
  step: number;
  focused: boolean;
  tier: WidthTier;
  weight: ChromeWeight;
  bot?: string | undefined;
  inference?: string | undefined;
  modeWord?: string | undefined;
  telemetry?: string | undefined;
  context?: ContextLevel | undefined;
}

export const focusMark = "▎";

export function titleZones(tier: WidthTier, focused: boolean): ReadonlySet<TitleZone> {
  switch (tier) {
    case "broadsheet":
      return new Set(["stamp", "name", "bot", "inference", "mode", "telemetry"]);
    case "column":
      return new Set(["stamp", "name", "bot", "mode", "telemetry"]);
    case "clipping":
      return new Set(focused ? ["stamp", "name", "mode", "telemetry"] : ["stamp", "name", "mode"]);
    case "masthead":
      return new Set(["stamp", "name"]);
  }
}

export function TitleRow(props: TitleRowProps) {
  const zones = () => titleZones(props.tier, props.focused);
  const detailText = (zone: DetailZone): string | undefined =>
    zone === "bot" ? props.bot : zone === "inference" ? props.inference : props.modeWord;
  const details = () =>
    detailZones.filter((zone) => zones().has(zone) && present(detailText(zone)));
  const telemetryShown = () =>
    zones().has("telemetry") && (props.context !== undefined || present(props.telemetry));
  return (
    <header class="kw-frame-title" data-tier={props.tier}>
      <Show when={props.weight === "borderless"}>
        <span class="kw-frame-lead" aria-hidden="true">
          {props.focused ? focusMark : " "}
        </span>
      </Show>
      <span class="kw-frame-stamp" aria-hidden="true" data-state={props.state}>
        {stampGlyph(props.state, props.step)}
      </span>
      <span class="kw-frame-name" data-state={props.state}>
        {props.name}
      </span>
      <span class="kw-frame-detail">
        <For each={details()}>
          {(zone) => <span class={`kw-frame-${zone}`}>{detailText(zone)}</span>}
        </For>
      </span>
      <Show when={telemetryShown()}>
        <span class="kw-frame-telemetry">
          <Show when={props.context}>{(level) => <ContextGauge level={level()} />}</Show>
          <Show when={props.telemetry}>
            {(text) => <span class="kw-frame-usage">{text()}</span>}
          </Show>
        </span>
      </Show>
    </header>
  );
}

const detailZones = ["bot", "inference", "mode"] as const;
type DetailZone = (typeof detailZones)[number];

function present(text: string | undefined): text is string {
  return text !== undefined && text !== "";
}
