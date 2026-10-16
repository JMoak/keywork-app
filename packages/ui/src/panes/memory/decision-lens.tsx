import { For, Show } from "solid-js";
import { keepInView } from "../overview/rows.tsx";
import { noWorkingSession } from "../overview/working-session.ts";
import { DensityMark } from "./cells.tsx";
import { type DecisionRow, noDecisionsLine } from "./decisions.ts";

export interface DecisionLensProps {
  session: string | undefined;
  rows: readonly DecisionRow[];
  cursor: string | undefined;
  unfolded: Readonly<Record<string, boolean>>;
  onSelect(id: string): void;
  onToggle(id: string): void;
}

export function DecisionLens(props: DecisionLensProps) {
  return (
    <Show when={props.session} fallback={<p class="kw-memory-line">{noWorkingSession}</p>}>
      {(session) => (
        <section class="kw-memory-section" data-section="decisions">
          <h3 class="kw-memory-heading">decisions · {session()}</h3>
          <Show
            when={props.rows.length > 0}
            fallback={<p class="kw-memory-line">{noDecisionsLine}</p>}
          >
            <ol class="kw-memory-rows">
              <For each={props.rows}>
                {(row) => (
                  <DecisionItem
                    row={row}
                    cursor={props.cursor === row.id}
                    unfolded={props.unfolded[row.id] === true}
                    onSelect={() => props.onSelect(row.id)}
                    onToggle={() => props.onToggle(row.id)}
                  />
                )}
              </For>
            </ol>
          </Show>
        </section>
      )}
    </Show>
  );
}

interface DecisionItemProps {
  row: DecisionRow;
  cursor: boolean;
  unfolded: boolean;
  onSelect(): void;
  onToggle(): void;
}

function DecisionItem(props: DecisionItemProps) {
  return (
    <li
      class="kw-memory-item"
      data-kind="decision"
      data-row={props.row.id}
      data-cursor={props.cursor ? "" : undefined}
      ref={(item) => keepInView(item, () => props.cursor)}
    >
      <button
        type="button"
        class="kw-memory-row"
        aria-expanded={props.unfolded}
        onClick={() => props.onSelect()}
        onDblClick={() => props.onToggle()}
      >
        <span class="kw-memory-marks">
          <DensityMark cell={props.row.mark.cell} label={props.row.mark.label} />
        </span>
        <span class="kw-memory-title">{props.row.asked}</span>
        <span class="kw-memory-facts">
          <For each={props.row.facts}>{(fact) => <span class="kw-memory-fact">{fact}</span>}</For>
        </span>
      </button>
      <Show when={props.unfolded}>
        <DecisionFold row={props.row} />
      </Show>
    </li>
  );
}

function DecisionFold(props: { row: DecisionRow }) {
  return (
    <div class="kw-memory-fold">
      <ul class="kw-memory-candidates">
        <For each={props.row.candidates}>
          {(candidate) => (
            <li class="kw-memory-candidate" data-verdict={candidate.verdict}>
              <span class="kw-memory-verdict">
                {candidate.verdict === "offered" ? "" : candidate.verdict}
              </span>
              <span>{candidate.name}</span>
              <Show when={candidate.odds}>
                {(odds) => <span class="kw-memory-fact">{odds()}</span>}
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.row.rule}>{(rule) => <p class="kw-memory-rule">{rule()}</p>}</Show>
    </div>
  );
}
