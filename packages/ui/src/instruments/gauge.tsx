import { For } from "solid-js";
import {
  type ContextLevel,
  type GaugeStyle,
  gaugeCells,
  gaugeCount,
  gaugeReadout,
} from "./context.ts";
import { currentInstrumentTier, gaugeStyleFor } from "./tier.ts";
import "./gauge.css";

export interface ContextGaugeProps {
  level: ContextLevel;
  style?: GaugeStyle | undefined;
}

export function ContextGauge(props: ContextGaugeProps) {
  const style = (): GaugeStyle => props.style ?? gaugeStyleFor(currentInstrumentTier());
  return (
    <span
      class="kw-gauge"
      role="img"
      aria-label={gaugeReadout(props.level)}
      title={gaugeReadout(props.level)}
      data-style={style()}
      data-basis={props.level.basis}
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
    </span>
  );
}
