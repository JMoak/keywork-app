import { countsOf, elapsedText, type PathMark, type TurnLedger } from "@keywork-app/client";
import type { ChangedPath } from "@keywork-app/protocol";
import { For, Show } from "solid-js";
import { formatCost } from "../instruments/format.ts";

export interface LedgerVerbs {
  restore(turn: TurnLedger): void;
  fork(turn: TurnLedger): void;
  choose(turn: TurnLedger): void;
}

export interface LedgerLineProps {
  turn: TurnLedger;
  verbs?: LedgerVerbs | undefined;
  unfolded: boolean;
  onToggle: () => void;
}

export function LedgerLine(props: LedgerLineProps) {
  const files = () => props.turn.files ?? [];
  const verbs = () => (props.turn.place === undefined ? undefined : props.verbs);
  const actionable = () => verbs() !== undefined || files().length > 0;
  const act = (key: LedgerKey): void => {
    if (key === "unfold") {
      if (files().length > 0) props.onToggle();
      return;
    }
    const chosen = verbs();
    if (key === "restore") chosen?.restore(props.turn);
    else chosen?.fork(props.turn);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const key = ledgerKeyOf(event);
    if (key === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    act(key);
  };
  const facts = () => <span class="kw-ledger-facts">{ledgerFacts(props.turn).join(" · ")}</span>;
  return (
    <>
      <Show when={actionable()} fallback={<p class="kw-ledger">{facts()}</p>}>
        <button
          type="button"
          class="kw-ledger"
          data-walk=""
          data-turn={props.turn.place?.turn}
          aria-expanded={files().length > 0 ? props.unfolded : undefined}
          onClick={() => act("unfold")}
          onFocus={() => verbs()?.choose(props.turn)}
          onKeyDown={onKeyDown}
        >
          {facts()}
          <Show when={verbs()}>
            <span class="kw-ledger-hint">{ledgerHint(files().length > 0)}</span>
          </Show>
        </button>
      </Show>
      <Show when={props.unfolded && files().length > 0}>
        <ul class="kw-ledger-files">
          <For each={files()}>
            {(file) => (
              <li class="kw-ledger-file">
                {file.path} <span class="kw-ledger-counts">{countsOf(file)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </>
  );
}

export function ledgerFacts(turn: TurnLedger): string[] {
  const files = turn.files ?? [];
  return [
    turn.place === undefined ? undefined : `turn ${turn.place.turn}`,
    files.length === 0 ? undefined : counted(files.length, "file"),
    files.length === 0 ? undefined : countsOf(totalOf(files)),
    turn.toolMs === undefined ? undefined : `${elapsedText(turn.toolMs)} in tools`,
    turn.costUsd === undefined ? undefined : formatCost(turn.costUsd),
  ].filter((fact) => fact !== undefined);
}

export function ribbonText(turn: TurnLedger | undefined): string | undefined {
  if (turn?.place === undefined) return undefined;
  const files = turn.files ?? [];
  return [
    `turn ${turn.place.turn}`,
    ...(files.length === 0 ? [] : [counted(files.length, "file")]),
    ...(turn.costUsd === undefined ? [] : [formatCost(turn.costUsd)]),
  ].join(" · ");
}

export function ledgerHint(withFiles: boolean): string {
  return withFiles
    ? " ·· ↵ files · u restores to before · f forks here"
    : " ·· u restores to before · f forks here";
}

export function markText(mark: PathMark, redoable: boolean): string {
  const turn = mark.turn === undefined ? "a turn" : `turn ${mark.turn}`;
  if (mark.kind === "restore-undone") return `the restore to before ${turn} was taken back`;
  const restored = `restored to before ${turn}`;
  return mark.leaf && redoable ? `${restored} · redo brings the turns back` : restored;
}

export type LedgerKey = "restore" | "fork" | "unfold";

export function ledgerKeyOf(event: KeyboardEvent): LedgerKey | undefined {
  if (event.ctrlKey || event.metaKey || event.altKey) return undefined;
  switch (event.key) {
    case "u":
      return "restore";
    case "f":
      return "fork";
    case "Enter":
    case " ":
      return "unfold";
    default:
      return undefined;
  }
}

export function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function totalOf(files: readonly ChangedPath[]): Pick<ChangedPath, "added" | "deleted"> {
  return {
    added: files.reduce((sum, file) => sum + file.added, 0),
    deleted: files.reduce((sum, file) => sum + file.deleted, 0),
  };
}
