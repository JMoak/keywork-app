import { For, Show } from "solid-js";
import {
  type ContextLevel,
  estimatedWord,
  type GaugeStyle,
  gaugeCells,
  gaugeCount,
  gaugeHover,
  gaugeReadout,
} from "./context.ts";
import { currentInstrumentTier, gaugeStyleFor } from "./tier.ts";
import "./gauge.css";

export interface ContextGaugeProps {
  level: ContextLevel;
  style?: GaugeStyle | undefined;
  unit?: string | undefined;
}

export const contextUnit = "in context";

export function ContextGauge(props: ContextGaugeProps) {
  const style = (): GaugeStyle => props.style ?? gaugeStyleFor(currentInstrumentTier());
  return (
    <span
      class="kw-gauge"
      role="img"
      aria-label={gaugeReadout(props.level)}
      title={gaugeHover(props.level)}
      data-style={style()}
      data-basis={props.level.basis}
      data-counted={props.level.counted}
    >
      <span class="kw-gauge-cells" aria-hidden="true">
        <For each={gaugeCells(props.level, style())}>
          {(cell) => (
            <span class="kw-gauge-cell" data-level={cell.level}>
              {cell.glyph}
            </span>
          )}
        </For>
      </span>
      <span class="kw-gauge-count">{gaugeCount(props.level, style())}</span>
      <Show when={props.unit}>{(unit) => <span class="kw-gauge-unit">{unit()}</span>}</Show>
      <Show when={props.level.counted === "estimated"}>
        <span class="kw-gauge-counted">{estimatedWord}</span>
      </Show>
    </span>
  );
}
