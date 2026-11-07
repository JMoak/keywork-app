import type { SessionRow } from "@keywork-app/protocol";
import { timeWord } from "../stead/copy.ts";
import {
  brokersLine,
  costWord,
  displayDarkLine,
  displayEndedLine,
  displayOpeningLine,
  displayReadyLine,
  displayRefusedLine,
  egressLine,
  egressLines,
  elsewhereLine,
  filesLines,
  headLine,
  limitationLines,
  measuredWord,
  noDisplayLine,
  noTypingLine,
  nothingRefused,
  notReported,
  raisedWord,
  refusalEntryLine,
  roomNames,
  snapshotsServedLine,
  terminalNote,
  threadCountWord,
  threadStateWords,
  threadsLead,
  typedLogLine,
  typedLogShown,
  typedRunLines,
  typedTerminalLead,
  watchingLine,
  workshopTitle,
} from "./copy.ts";
import type {
  CreatureHome,
  DisplayFrame,
  TerminalRun,
  WorkshopDetailRecord,
  WorkshopHealth,
  WorkshopRecord,
} from "./port.ts";

export interface WorkshopKeys {
  readonly start: string;
  readonly stop: string;
  readonly display: string;
  readonly files: string;
  readonly terminal: string;
  readonly next: string;
  readonly previous: string;
}

export type Watching =
  | { readonly phase: "closed" }
  | { readonly phase: "opening" }
  | { readonly phase: "watching"; readonly frame: DisplayFrame | undefined }
  | { readonly phase: "ended"; readonly detail: string | undefined }
  | { readonly phase: "refused"; readonly error: string };

export const closedWindow: Watching = { phase: "closed" };

export interface TypedRun {
  readonly command: string;
  readonly run: TerminalRun;
}

export interface WorkshopFacts {
  readonly workshop: WorkshopRecord;
  readonly health: WorkshopHealth | undefined;
  readonly detail?: WorkshopDetailRecord | undefined;
  readonly typed?: TypedRun | undefined;
  readonly watching: Watching;
  readonly threads: readonly SessionRow[];
  readonly snapshotsServed: boolean;
  readonly keys: WorkshopKeys;
  readonly now: number;
  readonly offsetMinutes: number;
}

export type ThreadState = (typeof threadStateWords)[keyof typeof threadStateWords];

export interface ThreadRow {
  readonly id: string;
  readonly state: ThreadState;
  readonly title: string;
  readonly time: string;
}

export type Room =
  | { readonly kind: "lines"; readonly name: string; readonly lines: readonly string[] }
  | {
      readonly kind: "threads";
      readonly name: string;
      readonly lead: string;
      readonly rows: readonly ThreadRow[];
      readonly note: string;
      readonly log: readonly string[];
      readonly output: readonly string[];
    }
  | {
      readonly kind: "table";
      readonly name: string;
      readonly rows: readonly (readonly [string, string])[];
    };

export const threadRowsShown = 6;

export function headOf(facts: WorkshopFacts): string {
  return headLine({
    substrate: facts.workshop.substrate,
    state: facts.workshop.state,
    health: facts.health,
    raised: raisedWord(facts.workshop.createdAt, facts.offsetMinutes),
  });
}

export function limitsOf(facts: WorkshopFacts): string[] {
  return limitationLines(facts.workshop.substrate, facts.workshop.limitations);
}

export function roomsOf(facts: WorkshopFacts): Room[] {
  const snapshots = snapshotsRoom(facts);
  return [
    displayRoom(facts),
    terminalRoom(facts),
    filesRoom(facts),
    egressRoom(facts),
    ...(facts.detail === undefined ? [] : [refusalsRoom(facts, facts.detail)]),
    brokersRoom(facts),
    ...(snapshots === undefined ? [] : [snapshots]),
    ledgerRoom(facts),
  ];
}

export function displayRoom(facts: WorkshopFacts): Room {
  return { kind: "lines", name: roomNames.display, lines: [displayLine(facts)] };
}

export function displayLine(facts: WorkshopFacts): string {
  const { workshop, watching, keys } = facts;
  switch (watching.phase) {
    case "opening":
      return displayOpeningLine;
    case "watching":
      return watchingLine(frameTime(watching.frame, facts), keys.display);
    case "ended":
      return displayEndedLine(watching.detail);
    case "refused":
      return displayRefusedLine(watching.error);
    case "closed":
      if (!workshop.display) return noDisplayLine(workshop.substrate);
      return workshop.state === "running"
        ? displayReadyLine(keys.display)
        : displayDarkLine(keys.start);
  }
}

export function terminalRoom(facts: WorkshopFacts): Room {
  const rows = threadRows(facts.threads, facts.now, facts.offsetMinutes);
  const { creature } = facts.workshop;
  const terminal = facts.detail?.terminal;
  return {
    kind: "threads",
    name: roomNames.terminal,
    lead:
      terminal?.allowed === true
        ? typedTerminalLead(creature, facts.threads.length, facts.keys.terminal)
        : threadsLead(creature, facts.threads.length, facts.keys.terminal),
    rows,
    note: terminal === undefined ? noTypingLine : terminalNote(terminal),
    log: (terminal?.log ?? [])
      .slice(-typedLogShown)
      .reverse()
      .map((entry) => typedLogLine(timeWord(entry.at, facts.now, facts.offsetMinutes), entry)),
    output: facts.typed === undefined ? [] : typedRunLines(facts.typed.command, facts.typed.run),
  };
}

export function refusalsRoom(facts: WorkshopFacts, detail: WorkshopDetailRecord): Room {
  const newest = [...detail.refusals.entries].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  const lines = newest.map((entry) =>
    refusalEntryLine(timeWord(entry.at, facts.now, facts.offsetMinutes), entry),
  );
  return {
    kind: "lines",
    name: roomNames.refusals,
    lines: [...(lines.length === 0 ? [nothingRefused] : lines), detail.refusals.unreported].filter(
      (line) => line !== "",
    ),
  };
}

export function filesRoom(facts: WorkshopFacts): Room {
  const { workshop, keys } = facts;
  return {
    kind: "lines",
    name: roomNames.files,
    lines: filesLines(workshop.substrate, workshop.workdir, keys.files),
  };
}

export function egressRoom(facts: WorkshopFacts): Room {
  const lines =
    facts.detail === undefined ? [egressLine(facts.workshop.substrate)] : egressLines(facts.detail);
  return { kind: "lines", name: roomNames.egress, lines };
}

export function brokersRoom(facts: WorkshopFacts): Room {
  return { kind: "lines", name: roomNames.brokers, lines: [brokersLine(facts.workshop.brokers)] };
}

export function snapshotsRoom(facts: WorkshopFacts): Room | undefined {
  if (!facts.snapshotsServed) return undefined;
  return { kind: "lines", name: roomNames.snapshots, lines: [snapshotsServedLine] };
}

export function ledgerRoom(facts: WorkshopFacts): Room {
  return {
    kind: "table",
    name: roomNames.ledger,
    rows: [
      ["disk", diskWord(facts.detail)],
      ["memory", memoryWord(facts.detail)],
      ["threads", threadCountWord(facts.threads.length)],
      ["cost", costWord(costOf(facts.threads))],
    ],
  };
}

function diskWord(detail: WorkshopDetailRecord | undefined): string {
  if (detail === undefined) return notReported;
  const { disk, unmeasured } = detail.resources.measured;
  return measuredWord(disk.usedBytes, disk.sizeBytes, unmeasured);
}

function memoryWord(detail: WorkshopDetailRecord | undefined): string {
  if (detail === undefined) return notReported;
  const { memory, unmeasured } = detail.resources.measured;
  return measuredWord(memory.usedBytes, memory.totalBytes, unmeasured);
}

export function threadsOf(rows: readonly SessionRow[], creature: string): SessionRow[] {
  return rows.filter((row) => row.bot === creature);
}

export function newestThread(rows: readonly SessionRow[]): SessionRow | undefined {
  return [...rows].sort(byLiveliness)[0];
}

export function threadRows(
  rows: readonly SessionRow[],
  now: number,
  offsetMinutes: number,
): ThreadRow[] {
  return [...rows]
    .sort(byLiveliness)
    .slice(0, threadRowsShown)
    .map((row) => ({
      id: row.id,
      state: threadStateOf(row),
      title: row.title,
      time: timeWord(row.lastActivityAt, now, offsetMinutes),
    }));
}

export function threadStateOf(row: SessionRow): ThreadState {
  if ((row.waiting?.asks ?? 0) > 0) return threadStateWords.needsYou;
  if (row.working === true) return threadStateWords.working;
  if (row.live === true) return threadStateWords.live;
  return threadStateWords.idle;
}

export function costOf(rows: readonly SessionRow[]): number | undefined {
  const priced = rows.flatMap((row) => (row.costNanos === undefined ? [] : [row.costNanos]));
  if (priced.length === 0) return undefined;
  return priced.reduce((sum, nanos) => sum + nanos, 0);
}

export interface NodeYard {
  readonly ours: readonly WorkshopRecord[];
  readonly elsewhere: readonly WorkshopRecord[];
}

export function yardOf(
  records: readonly WorkshopRecord[],
  homes: readonly CreatureHome[] | undefined,
): NodeYard {
  if (homes === undefined) return { ours: records, elsewhere: [] };
  const ourIds = new Set(homes.map((home) => home.workshop));
  return {
    ours: records.filter((record) => ourIds.has(record.id)),
    elsewhere: records.filter((record) => !ourIds.has(record.id)),
  };
}

export function shownWorkshop(
  yard: NodeYard,
  creature: string | undefined,
  floating: string | undefined,
): WorkshopRecord | undefined {
  if (creature !== undefined) {
    return pickWorkshop(yard.ours, creature) ?? pickWorkshop(yard.elsewhere, creature);
  }
  const floats = floating === undefined ? undefined : pickWorkshop(yard.ours, floating);
  return floats ?? yard.ours[0];
}

export function elsewhereLines(
  yard: NodeYard,
  shown: WorkshopRecord | undefined,
  offsetMinutes: number,
): string[] {
  return yard.elsewhere
    .filter((record) => record.id !== shown?.id)
    .map((record) =>
      elsewhereLine({ ...record, raised: raisedWord(record.createdAt, offsetMinutes) }),
    );
}

export function pickWorkshop(
  records: readonly WorkshopRecord[],
  creature: string | undefined,
): WorkshopRecord | undefined {
  if (creature === undefined) return records[0];
  return records.find((record) => record.creature === creature);
}

export function neighbourOf(
  records: readonly WorkshopRecord[],
  current: WorkshopRecord,
  step: 1 | -1,
): WorkshopRecord | undefined {
  if (records.length < 2) return undefined;
  const index = records.findIndex((record) => record.id === current.id);
  if (index === -1) return records[0];
  return records[(index + step + records.length) % records.length];
}

export function frameUrl(frame: DisplayFrame): string {
  return `data:image/png;base64,${frame.png}`;
}

export function folderUrlOf(path: string): string {
  const forward = path.replace(/\\/g, "/");
  const rooted = forward.startsWith("/") ? forward : `/${forward}`;
  return `file://${encodeURI(rooted)}`;
}

export function paneText(facts: WorkshopFacts): string {
  const lines = [
    workshopTitle(facts.workshop.creature),
    headOf(facts),
    ...limitsOf(facts).map((limit) => `  ▸ ${limit}`),
    ...roomsOf(facts).flatMap(roomText),
  ];
  return `${lines.join("\n")}\n`;
}

const stateColumn = Math.max(...Object.values(threadStateWords).map((word) => word.length)) + 2;

function roomText(room: Room): string[] {
  switch (room.kind) {
    case "lines":
      return [room.name, ...room.lines.map(indented)];
    case "threads":
      return [
        room.name,
        indented(room.lead),
        ...room.rows.map((row) =>
          indented(`${row.state.padEnd(stateColumn)}${row.title.padEnd(28)}  ${row.time}`),
        ),
        indented(room.note),
        ...room.log.map(indented),
        ...room.output.map(indented),
      ];
    case "table":
      return [
        room.name,
        ...room.rows.map(([label, value]) => indented(`${label.padEnd(9)}${value}`)),
      ];
  }
}

function indented(line: string): string {
  return `  ${line}`;
}

function frameTime(frame: DisplayFrame | undefined, facts: WorkshopFacts): string {
  return timeWord(frame?.at, facts.now, facts.offsetMinutes);
}

function byLiveliness(left: SessionRow, right: SessionRow): number {
  const rank = (row: SessionRow): number =>
    (row.waiting?.asks ?? 0) > 0 ? 0 : row.working === true ? 1 : row.live === true ? 2 : 3;
  const byRank = rank(left) - rank(right);
  return byRank !== 0 ? byRank : right.lastActivityAt.localeCompare(left.lastActivityAt);
}
