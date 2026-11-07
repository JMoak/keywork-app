import { createMemo, For, Show } from "solid-js";
import { OverviewRow, type RowDensity } from "../overview/rows.tsx";
import {
  asideOf,
  auditLine,
  auditLinesShown,
  codeLine,
  type GateContext,
  gateLine,
  identityWord,
  rolesLine,
  waitingLine,
} from "./copy.ts";
import type { ParcelPairing, ParcelRow } from "./parcels.ts";

export type DetailKind = "roles" | "gate" | "code" | "audit";

export interface DetailLine {
  readonly kind: DetailKind;
  readonly text: string;
}

export interface ParcelEntryProps {
  row: ParcelRow;
  cursor: boolean;
  busyMark: string | undefined;
  waiting: boolean;
  context: GateContext;
  confirmChord: string;
  onPick(): void;
}

export function ParcelEntry(props: ParcelEntryProps) {
  const details = createMemo(() =>
    detailLines(props.row, {
      expanded: props.cursor,
      waiting: props.waiting,
      context: props.context,
      confirmChord: props.confirmChord,
    }),
  );
  return (
    <>
      <OverviewRow
        cursor={props.cursor}
        muted={isFaint(props.row)}
        mark={props.busyMark ?? markOf(props.row.pairing)}
        density={densityOf(props.row.pairing)}
        aside={asideOf(props.row)}
        onClick={() => props.onPick()}
      >
        <span class="kw-parcels-machine">{props.row.machine}</span>
        <Show when={identityWord(props.row)}>
          {(who) => <span class="kw-parcels-who">{` · ${who()}`}</span>}
        </Show>
      </OverviewRow>
      <Show when={details().length > 0}>
        <li class="kw-parcels-detail">
          <For each={details()}>{(line) => <p data-kind={line.kind}>{line.text}</p>}</For>
        </li>
      </Show>
    </>
  );
}

export interface DetailOptions {
  readonly expanded: boolean;
  readonly waiting: boolean;
  readonly context: GateContext;
  readonly confirmChord: string;
}

export function detailLines(row: ParcelRow, options: DetailOptions): DetailLine[] {
  return [
    ...(row.roles.length > 0 ? [line("roles", rolesLine(row.roles))] : []),
    ...row.gates.map((gate) => line("gate", gateLine(gate, options.context))),
    ...pairingLines(row, options),
    ...(options.expanded
      ? row.audit
          .slice(0, auditLinesShown)
          .map((entry) => line("audit", auditLine(entry, options.context, row.id)))
      : []),
  ];
}

export function markOf(pairing: ParcelPairing): string {
  switch (pairing.kind) {
    case "here":
    case "paired":
      return "█";
    case "pairing-out":
    case "pairing-in":
      return "▓";
    case "unpaired":
      return "░";
    case "no-node":
    case "unlisted":
      return "·";
  }
}

export function densityOf(pairing: ParcelPairing): RowDensity {
  switch (pairing.kind) {
    case "here":
    case "paired":
      return "full";
    case "pairing-out":
    case "pairing-in":
      return "heavy";
    case "unpaired":
      return "medium";
    case "no-node":
    case "unlisted":
      return "light";
  }
}

function pairingLines(row: ParcelRow, options: DetailOptions): DetailLine[] {
  if (options.waiting) return [line("code", waitingLine(row.machine))];
  const code = codeLine(row, options.confirmChord);
  return code === undefined ? [] : [line("code", code)];
}

function isFaint(row: ParcelRow): boolean {
  return !row.online || row.pairing.kind === "no-node" || row.pairing.kind === "unlisted";
}

function line(kind: DetailKind, text: string): DetailLine {
  return { kind, text };
}
