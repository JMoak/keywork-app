import { For } from "solid-js";
import type { GaugeCell } from "../../instruments/context.ts";
import "../../instruments/gauge.css";

export interface DensityCellsProps {
  cells: readonly GaugeCell[];
  label: string;
}

export function DensityCells(props: DensityCellsProps) {
  return (
    <span class="kw-gauge" role="img" aria-label={props.label} title={props.label}>
      <span class="kw-gauge-cells" aria-hidden="true">
        <For each={props.cells}>
          {(cell) => (
            <span class="kw-gauge-cell" data-level={cell.level}>
              {cell.glyph}
            </span>
          )}
        </For>
      </span>
    </span>
  );
}

export function DensityMark(props: { cell: GaugeCell; label: string }) {
  return (
    <span class="kw-memory-mark kw-gauge-cell" data-level={props.cell.level} title={props.label}>
      {props.cell.glyph}
    </span>
  );
}
