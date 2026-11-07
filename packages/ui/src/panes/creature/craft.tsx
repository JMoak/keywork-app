import type { MemoryNote, MemoryNotes, Provenance } from "@keywork-app/protocol";
import { For, Show } from "solid-js";
import { isCraftNote } from "../memory/forget.ts";

export interface CraftRow {
  readonly name: string;
  readonly firstLine: string;
  readonly provenance: Provenance;
  readonly file: string;
}

export const craftHeading = "Craft";
export const nothingLearned =
  "Nothing learned about its craft yet · what it learns about doing its own work lands here";
export const noCraftToEdit = "no craft note to open · it has not learned anything yet";
export const noCraftToForget = "no craft note to forget · it has not learned anything yet";

export function craftRows(listed: MemoryNotes | undefined): CraftRow[] {
  if (listed === undefined || !listed.trusted) return [];
  return listed.notes.filter(isCraftNote).map(craftRow);
}

export function craftSource(slug: string, note: string): string {
  return `craft:${slug}/${note}`;
}

export function craftHint(keys: { next: string; edit: string; forget: string }): string {
  return `${keys.next} next lesson · ${keys.edit} edits it · ${keys.forget} forgets it after a dry run`;
}

export interface CraftSectionProps {
  rows: readonly CraftRow[];
  focused: number;
  hint: string;
}

export function CraftSection(props: CraftSectionProps) {
  return (
    <>
      <h3 class="kw-creature-heading">{craftHeading}</h3>
      <Show
        when={props.rows.length > 0}
        fallback={<p class="kw-creature-shadow-opening">{nothingLearned}</p>}
      >
        <ul class="kw-creature-craft" aria-label={craftHeading}>
          <For each={props.rows}>
            {(row, index) => (
              <li
                data-craft={row.name}
                aria-current={index() === props.focused ? "true" : undefined}
              >
                <span>{row.name}</span>
                <span class="kw-creature-opens">{row.firstLine}</span>
                <span class="kw-creature-landmark">{row.provenance}</span>
              </li>
            )}
          </For>
        </ul>
        <p class="kw-creature-opens">{props.hint}</p>
      </Show>
    </>
  );
}

function craftRow(note: MemoryNote): CraftRow {
  return {
    name: note.name,
    firstLine: firstLineOf(note.body),
    provenance: note.provenance,
    file: note.file,
  };
}

function firstLineOf(body: string): string {
  return (
    body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}
