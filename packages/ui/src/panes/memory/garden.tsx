import type {
  GardenerActivity,
  MemoryLayer,
  MemoryNote,
  MemoryQueryHit,
} from "@keywork-app/protocol";
import { For, Match, Show, Switch } from "solid-js";
import { relativeAge } from "../../chrome/telemetry.ts";
import { keepInView } from "../overview/rows.tsx";
import { DensityCells, DensityMark } from "./cells.tsx";
import {
  budgetCells,
  budgetReadout,
  curingCell,
  curingRampCells,
  curingReadout,
  curingWord,
  provenanceCell,
} from "./density.ts";
import type { LayerTally, MemoryRow, MemoryRowKind, MemorySection } from "./rows.ts";

export interface GardenProps {
  sections: readonly MemorySection[];
  cursor: string | undefined;
  gardener: GardenerActivity | undefined;
  onSelect(row: MemoryRow): void;
  onOpen(row: MemoryRow): void;
}

export function Garden(props: GardenProps) {
  return (
    <div class="kw-memory-garden">
      <Show when={props.gardener}>
        {(gardener) => (
          <p class="kw-memory-gardener">
            gardener {gardener().state}
            <Show when={gardener().sweptAt}>
              {(sweptAt) => <span> · swept {relativeAge(sweptAt())}</span>}
            </Show>
          </p>
        )}
      </Show>
      <For each={props.sections}>
        {(section) => (
          <section class="kw-memory-section" data-section={section.id}>
            <h3 class="kw-memory-heading">{section.heading}</h3>
            <ol class="kw-memory-rows">
              <For each={section.rows}>
                {(row) => (
                  <li
                    class="kw-memory-item"
                    data-kind={row.kind}
                    data-row={row.id}
                    data-cursor={props.cursor === row.id ? "" : undefined}
                    ref={(item) => keepInView(item, () => props.cursor === row.id)}
                  >
                    <button
                      type="button"
                      class="kw-memory-row"
                      onClick={() => props.onSelect(row)}
                      onDblClick={() => props.onOpen(row)}
                    >
                      <RowBody row={row} />
                    </button>
                  </li>
                )}
              </For>
            </ol>
          </section>
        )}
      </For>
    </div>
  );
}

function RowBody(props: { row: MemoryRow }) {
  const rowAs =
    <K extends MemoryRowKind>(kind: K) =>
    (): Extract<MemoryRow, { kind: K }> | undefined =>
      props.row.kind === kind ? (props.row as Extract<MemoryRow, { kind: K }>) : undefined;
  return (
    <Switch>
      <Match when={rowAs("layer")()}>
        {(row) => <LayerRow layer={row().layer} tally={row().tally} />}
      </Match>
      <Match when={rowAs("note")()}>{(row) => <NoteRow note={row().note} />}</Match>
      <Match when={rowAs("hit")()}>{(row) => <HitRow hit={row().hit} />}</Match>
      <Match when={rowAs("date")()}>
        {(row) => <span class="kw-memory-title">{row().date}</span>}
      </Match>
      <Match when={rowAs("inbox")()}>{(row) => <InboxRow row={row()} />}</Match>
      <Match when={rowAs("candidate")()}>{(row) => <CandidateRow row={row()} />}</Match>
      <Match when={rowAs("question")()}>{(row) => <QuestionRow row={row()} />}</Match>
      <Match when={rowAs("finish")()}>{(row) => <FinishRow row={row()} />}</Match>
    </Switch>
  );
}

function LayerRow(props: { layer: MemoryLayer; tally: LayerTally }) {
  return (
    <>
      <DensityCells
        cells={curingRampCells(props.tally.curing)}
        label={`curing · ${curingReadout(props.tally.curing) || "no notes"}`}
      />
      <span class="kw-memory-title">
        {`${props.tally.notes} ${props.tally.notes === 1 ? "note" : "notes"}`}
      </span>
      <Show when={props.layer.prompt}>
        {(prompt) => (
          <span class="kw-memory-facts">
            <DensityCells
              cells={budgetCells(prompt().used, prompt().budget)}
              label={budgetReadout(prompt().used, prompt().budget)}
            />
            <span class="kw-memory-fact">{budgetReadout(prompt().used, prompt().budget)}</span>
          </span>
        )}
      </Show>
    </>
  );
}

function NoteRow(props: { note: MemoryNote }) {
  return (
    <>
      <span class="kw-memory-marks">
        <DensityMark cell={curingCell(props.note.curing)} label={curingWord(props.note.curing)} />
        <DensityMark cell={provenanceCell(props.note.provenance)} label={props.note.provenance} />
      </span>
      <span class="kw-memory-title">{props.note.title}</span>
      <span class="kw-memory-facts">
        <Show when={props.note.pinned}>
          <span class="kw-memory-fact">pinned</span>
        </Show>
        <Show when={props.note.injected}>
          <span class="kw-memory-fact">in prompt</span>
        </Show>
        <Show when={props.note.recalls > 0}>
          <span class="kw-memory-fact">{props.note.recalls} recalls</span>
        </Show>
      </span>
    </>
  );
}

function HitRow(props: { hit: MemoryQueryHit }) {
  const legs = () =>
    Object.entries(props.hit.ranks)
      .map(([leg, rank]) => `${leg} #${rank}`)
      .join(" · ");
  return (
    <>
      <span class="kw-memory-marks">
        <DensityMark
          cell={curingCell(props.hit.superseded ? 0 : 2)}
          label={props.hit.superseded ? "superseded" : "current"}
        />
      </span>
      <span class="kw-memory-title">{props.hit.note}</span>
      <span class="kw-memory-facts">
        <span class="kw-memory-fact">{props.hit.layer}</span>
        <span class="kw-memory-fact">{legs()}</span>
      </span>
    </>
  );
}

function InboxRow(props: { row: Extract<MemoryRow, { kind: "inbox" }> }) {
  const view = () => props.row.view;
  return (
    <>
      <span class="kw-memory-marks">
        <DensityMark cell={provenanceCell(view().provenance)} label={view().provenance} />
      </span>
      <span class="kw-memory-title">{view().title}</span>
      <span class="kw-memory-facts">
        <Show when={view().detail}>
          {(detail) => <span class="kw-memory-fact">{detail()}</span>}
        </Show>
        <Show when={view().odds}>
          {(odds) => (
            <span class="kw-memory-fact" data-fact="odds">
              {odds()}
            </span>
          )}
        </Show>
        <span class="kw-memory-fact">{relativeAge(props.row.item.created)}</span>
      </span>
    </>
  );
}

function CandidateRow(props: { row: Extract<MemoryRow, { kind: "candidate" }> }) {
  const candidate = () => props.row.candidate;
  return (
    <>
      <span class="kw-memory-marks">
        <DensityMark
          cell={curingCell(candidate().choice === undefined ? 0 : 3)}
          label={candidate().choice ?? "undecided"}
        />
        <DensityMark cell={provenanceCell(candidate().provenance)} label={candidate().provenance} />
      </span>
      <span class="kw-memory-title">{candidate().title}</span>
      <span class="kw-memory-facts">
        <span class="kw-memory-fact">{candidate().choice ?? "undecided"}</span>
        <Show when={!candidate().eligible}>
          <span class="kw-memory-fact">{candidate().shortfalls.join(", ") || "below bar"}</span>
        </Show>
      </span>
    </>
  );
}

function QuestionRow(props: { row: Extract<MemoryRow, { kind: "question" }> }) {
  const question = () => props.row.question;
  return (
    <>
      <span class="kw-memory-marks">
        <DensityMark
          cell={curingCell(question().choice === undefined ? 0 : 3)}
          label={question().choice ?? "open"}
        />
        <DensityMark cell={provenanceCell(question().provenance)} label={question().provenance} />
      </span>
      <span class="kw-memory-title">? {question().title}</span>
      <span class="kw-memory-facts">
        <span class="kw-memory-fact">{question().choice ?? "open"}</span>
      </span>
    </>
  );
}

function FinishRow(props: { row: Extract<MemoryRow, { kind: "finish" }> }) {
  const undecided = () =>
    props.row.digest.candidates.filter((candidate) => candidate.choice === undefined).length +
    props.row.digest.questions.filter((question) => question.choice === undefined).length;
  return (
    <>
      <span class="kw-memory-marks">
        <DensityMark
          cell={curingCell(undecided() === 0 ? 3 : 0)}
          label={undecided() === 0 ? "ready to close" : `${undecided()} undecided`}
        />
      </span>
      <span class="kw-memory-title">close {props.row.arc}</span>
      <span class="kw-memory-facts">
        <span class="kw-memory-fact">
          {undecided() === 0 ? "ready" : `${undecided()} undecided`}
        </span>
        <Show when={props.row.digest.successor}>
          {(successor) => <span class="kw-memory-fact">carries to {successor()}</span>}
        </Show>
      </span>
    </>
  );
}
