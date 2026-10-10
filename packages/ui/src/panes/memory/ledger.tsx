import type { DailyEntry, LedgerEntry } from "@keywork-app/protocol";
import { For, Show } from "solid-js";
import { DensityMark } from "./cells.tsx";
import { provenanceCell } from "./density.ts";
import { ledgerSummary } from "./rows.ts";

export interface LedgerLensProps {
  entries: readonly LedgerEntry[];
  cursor: string | undefined;
  reverted: Readonly<Record<string, "reverted" | "needs-rebase">>;
  onSelect(id: string): void;
}

export function LedgerLens(props: LedgerLensProps) {
  return (
    <Show
      when={props.entries.length > 0}
      fallback={<p class="kw-memory-line">no writes this run · the audit on disk is the record</p>}
    >
      <ol class="kw-memory-rows">
        <For each={props.entries}>
          {(entry) => (
            <li
              class="kw-memory-item"
              data-kind="ledger"
              data-row={entry.id}
              data-cursor={props.cursor === entry.id ? "" : undefined}
            >
              <button type="button" class="kw-memory-row" onClick={() => props.onSelect(entry.id)}>
                <span class="kw-memory-marks">
                  <DensityMark
                    cell={provenanceCell(entry.op === "revert" ? "untrusted" : "agent")}
                    label={entry.op}
                  />
                </span>
                <span class="kw-memory-title">{ledgerSummary(entry)}</span>
                <span class="kw-memory-facts">
                  <span class="kw-memory-fact">{entry.timestamp}</span>
                  <span class="kw-memory-fact">
                    {entry.deltas.length} {entry.deltas.length === 1 ? "file" : "files"}
                  </span>
                  <Show when={props.reverted[entry.id]}>
                    {(outcome) => (
                      <span class="kw-memory-fact" data-outcome={outcome()}>
                        {outcome() === "reverted"
                          ? "reverted"
                          : "needs rebase · the file moved on, nothing touched"}
                      </span>
                    )}
                  </Show>
                </span>
              </button>
            </li>
          )}
        </For>
      </ol>
    </Show>
  );
}

export interface DailyLensProps {
  date: string;
  entries: readonly DailyEntry[] | undefined;
}

export function DailyLens(props: DailyLensProps) {
  return (
    <section class="kw-memory-daily">
      <h2 class="kw-memory-note-title">{props.date}</h2>
      <Show when={props.entries} fallback={<p class="kw-memory-line">░ reading…</p>}>
        {(entries) => (
          <Show
            when={entries().length > 0}
            fallback={<p class="kw-memory-line">nothing logged that day</p>}
          >
            <ol class="kw-memory-rows">
              <For each={entries()}>
                {(entry) => (
                  <li class="kw-memory-row" data-kind="daily">
                    <span class="kw-memory-marks">
                      <DensityMark
                        cell={provenanceCell(entry.provenance)}
                        label={entry.provenance}
                      />
                    </span>
                    <span class="kw-memory-title kw-memory-daily-text">{entry.text}</span>
                    <span class="kw-memory-facts">
                      <span class="kw-memory-fact">{entry.time}</span>
                    </span>
                  </li>
                )}
              </For>
            </ol>
          </Show>
        )}
      </Show>
    </section>
  );
}
