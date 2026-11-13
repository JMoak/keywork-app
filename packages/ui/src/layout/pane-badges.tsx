import { Show } from "solid-js";
import "./pane-badges.css";

export function OrdinalBadge(props: { chord: string | undefined }) {
  return (
    <Show when={props.chord}>
      {(chord) => (
        <span class="kw-ordinal-badge" aria-hidden="true">
          {chord()}
        </span>
      )}
    </Show>
  );
}

export function ZoomBadge(props: { hidden: number; restore: string | undefined }) {
  return (
    <p class="kw-zoom-badge" role="status">
      {zoomLine(props.hidden, props.restore)}
    </p>
  );
}

export function zoomLine(hidden: number, restore: string | undefined): string {
  const panes = `${hidden} ${hidden === 1 ? "pane" : "panes"} hidden`;
  return restore === undefined ? `zoomed · ${panes}` : `zoomed · ${panes} · ${restore} shows them`;
}
