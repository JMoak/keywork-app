import type { LedgerEntry, MemoryNote, MemoryNoteDetail } from "@keywork-app/protocol";
import { For, Show } from "solid-js";
import { Markdown } from "../../page/markdown.tsx";
import { DensityMark } from "./cells.tsx";
import { curingCell, curingWord, provenanceCell } from "./density.ts";
import { ledgerSummary } from "./rows.ts";

export interface NoteLensProps {
  note: MemoryNoteDetail | undefined;
  loading: boolean;
  history: readonly LedgerEntry[];
}

export function NoteLens(props: NoteLensProps) {
  return (
    <Show
      when={props.note}
      fallback={
        <p class="kw-memory-line">{props.loading ? "░ reading…" : "no note by that name"}</p>
      }
    >
      {(note) => (
        <article class="kw-memory-note">
          <h2 class="kw-memory-note-title">{note().title}</h2>
          <p class="kw-memory-note-facts">
            <For each={noteFacts(note())}>
              {(fact) => <span class="kw-memory-fact">{fact}</span>}
            </For>
          </p>
          <div class="kw-prose kw-memory-note-body">
            <Markdown source={note().body} />
          </div>
          <Show when={note().relations.length > 0}>
            <h3 class="kw-memory-heading">relations</h3>
            <ul class="kw-memory-relations">
              <For each={note().relations}>
                {(relation) => (
                  <li class="kw-memory-relation">
                    {relation.direction === "out" ? "→" : "←"} {relation.predicate} {relation.name}
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={props.history.length > 0}>
            <h3 class="kw-memory-heading">this run</h3>
            <ul class="kw-memory-relations">
              <For each={props.history}>
                {(entry) => (
                  <li class="kw-memory-relation">
                    {ledgerSummary(entry)} · {entry.timestamp}
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </article>
      )}
    </Show>
  );
}

export function NoteMarks(props: { note: MemoryNote }) {
  return (
    <span class="kw-memory-marks">
      <DensityMark cell={curingCell(props.note.curing)} label={curingWord(props.note.curing)} />
      <DensityMark cell={provenanceCell(props.note.provenance)} label={props.note.provenance} />
    </span>
  );
}

export function noteFacts(note: MemoryNote): string[] {
  return [
    note.layer,
    note.provenance,
    curingWord(note.curing),
    ...(note.pinned ? ["pinned"] : []),
    ...(note.confidence === undefined ? [] : [`confidence ${note.confidence}`]),
    ...(note.supersedes === undefined ? [] : [`supersedes ${note.supersedes}`]),
    ...(note.supersededBy === undefined ? [] : [`superseded by ${note.supersededBy}`]),
    ...(note.injected ? ["in prompt"] : []),
    `${note.recalls} recalls`,
    `${note.tokens} tokens`,
  ];
}
