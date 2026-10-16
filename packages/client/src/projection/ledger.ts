import type {
  ChangedPath,
  CustomEntry,
  MessageEntry,
  SessionEntries,
  SessionEntry,
  Usage,
} from "@keywork-app/protocol";
import type { ChangesState } from "./changes.ts";
import type { SessionProjection, TranscriptEntry, UserEntry } from "./types.ts";

export interface TranscriptLedger {
  readonly opening: readonly PathMark[];
  readonly turns: readonly TurnLedger[];
}

export interface TurnLedger {
  readonly head: number;
  readonly end: number;
  readonly place: PathTurn | undefined;
  readonly files: readonly ChangedPath[] | undefined;
  readonly toolMs: number | undefined;
  readonly costUsd: number | undefined;
}

export interface PathReading {
  readonly opening: readonly PathMark[];
  readonly turns: readonly PathTurn[];
}

export interface PathTurn {
  readonly turn: number;
  readonly promptId: string;
  readonly leafId: string;
  readonly text: string;
  readonly costUsd: number | undefined;
  readonly marks: readonly PathMark[];
}

export interface PathMark {
  readonly kind: PathMarkKind;
  readonly entryId: string;
  readonly turn: number | undefined;
  readonly leaf: boolean;
}

export type PathMarkKind = "restore" | "restore-undone";

export interface RestoreReach {
  readonly turns: number;
  readonly files: number | undefined;
}

export function transcriptLedger(
  projection: SessionProjection,
  path: PathReading | undefined,
  changes: ChangesState,
): TranscriptLedger {
  const spans = settledTurns(projection);
  const places = placeTurns(
    spans.map((span) => span.prompt),
    path?.turns ?? [],
  );
  return {
    opening: path?.opening ?? [],
    turns: spans.map((span, at) => turnLedger(projection.entries, span, places[at], changes)),
  };
}

export function latestLedger(
  projection: SessionProjection,
  path: PathReading | undefined,
  changes: ChangesState,
): TurnLedger | undefined {
  const span = settledTurns(projection).at(-1);
  if (span === undefined) return undefined;
  const [place] = placeTurns([span.prompt], path?.turns ?? []);
  return turnLedger(projection.entries, span, place, changes);
}

export function pathReading(snapshot: SessionEntries): PathReading {
  const known = readings.get(snapshot);
  if (known !== undefined) return known;
  const reading = readPath(snapshot);
  readings.set(snapshot, reading);
  return reading;
}

export function restoreReach(path: PathReading, changes: ChangesState, turn: number): RestoreReach {
  return {
    turns: path.turns.filter((onPath) => onPath.turn >= turn).length,
    files:
      changes.availability === "ready"
        ? changes.files.filter((file) => file.turn !== undefined && file.turn >= turn).length
        : undefined,
  };
}

interface TurnSpan {
  readonly head: number;
  readonly end: number;
  readonly prompt: UserEntry;
}

function settledTurns(projection: SessionProjection): TurnSpan[] {
  const heads = projection.entries.flatMap((entry, head) =>
    entry.kind === "user" ? [{ head, prompt: entry }] : [],
  );
  const spans = heads.map(({ head, prompt }, at) => ({
    head,
    end: (heads[at + 1]?.head ?? projection.entries.length) - 1,
    prompt,
  }));
  return projection.turn === undefined ? spans : spans.slice(0, -1);
}

function placeTurns(
  prompts: readonly UserEntry[],
  path: readonly PathTurn[],
): (PathTurn | undefined)[] {
  let unclaimed = path.length;
  const newestFirst = [...prompts].reverse().map((prompt) => {
    const match = path.slice(0, unclaimed).findLastIndex((turn) => samePrompt(prompt, turn));
    if (match === -1) return undefined;
    unclaimed = match;
    return path[match];
  });
  return newestFirst.reverse();
}

function samePrompt(prompt: UserEntry, turn: PathTurn): boolean {
  return prompt.entryId === undefined
    ? prompt.text === turn.text
    : prompt.entryId === turn.promptId;
}

function turnLedger(
  entries: readonly TranscriptEntry[],
  span: TurnSpan,
  place: PathTurn | undefined,
  changes: ChangesState,
): TurnLedger {
  return {
    head: span.head,
    end: span.end,
    place,
    files: place === undefined ? undefined : filesOfTurn(changes, place.turn),
    toolMs: toolTime(entries.slice(span.head, span.end + 1)),
    costUsd: place?.costUsd,
  };
}

function filesOfTurn(changes: ChangesState, turn: number): ChangedPath[] | undefined {
  if (changes.availability !== "ready") return undefined;
  return changes.files.filter((file) => file.turn === turn);
}

function toolTime(entries: readonly TranscriptEntry[]): number | undefined {
  const timed = entries.flatMap((entry) =>
    entry.kind === "tool" && entry.run.durationMs !== undefined ? [entry.run.durationMs] : [],
  );
  return timed.length === 0 ? undefined : timed.reduce((sum, ms) => sum + ms, 0);
}

const readings = new WeakMap<SessionEntries, PathReading>();

interface OpenTurn {
  readonly turn: number;
  readonly prompt: MessageEntry;
  readonly marks: PathMark[];
  readonly usages: (Usage | undefined)[];
  leafId: string;
}

function readPath(snapshot: SessionEntries): PathReading {
  const byId = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
  const opening: PathMark[] = [];
  const turns: OpenTurn[] = [];
  for (const entry of snapshot.activePath.flatMap((id) => byId.get(id) ?? [])) {
    const open = turns.at(-1);
    if (entry.type === "message") {
      if (entry.message.role === "user") turns.push(openedBy(entry, turns.length + 1));
      else if (open !== undefined) followMessage(open, entry);
      continue;
    }
    const mark = markOf(entry, byId, snapshot.leafId);
    if (mark !== undefined) (open?.marks ?? opening).push(mark);
  }
  return { opening, turns: turns.map(closedTurn) };
}

function openedBy(prompt: MessageEntry, turn: number): OpenTurn {
  return { turn, prompt, marks: [], usages: [], leafId: prompt.id };
}

function followMessage(open: OpenTurn, entry: MessageEntry): void {
  open.leafId = entry.id;
  if (entry.message.role === "assistant") open.usages.push(entry.usage);
}

function closedTurn(open: OpenTurn): PathTurn {
  return {
    turn: open.turn,
    promptId: open.prompt.id,
    leafId: open.leafId,
    text: promptText(open.prompt),
    costUsd: pricedTotal(open.usages),
    marks: open.marks,
  };
}

function promptText(prompt: MessageEntry): string {
  return prompt.message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}

function pricedTotal(usages: readonly (Usage | undefined)[]): number | undefined {
  if (usages.length === 0) return undefined;
  let total = 0;
  for (const usage of usages) {
    if (usage?.costUsd === undefined) return undefined;
    total += usage.costUsd;
  }
  return total;
}

function markOf(
  entry: SessionEntry,
  byId: ReadonlyMap<string, SessionEntry>,
  leafId: string | null,
): PathMark | undefined {
  if (entry.type !== "custom") return undefined;
  const leaf = entry.id === leafId;
  switch (entry.customType) {
    case "restore":
      return { kind: "restore", entryId: entry.id, turn: restoredTurnOf(entry), leaf };
    case "restore-undone":
      return { kind: "restore-undone", entryId: entry.id, turn: undoneTurnOf(entry, byId), leaf };
    default:
      return undefined;
  }
}

function undoneTurnOf(
  entry: CustomEntry,
  byId: ReadonlyMap<string, SessionEntry>,
): number | undefined {
  const restoreId = fieldOf(entry.data, "restore");
  return typeof restoreId === "string" ? restoredTurnOf(byId.get(restoreId)) : undefined;
}

function restoredTurnOf(entry: SessionEntry | undefined): number | undefined {
  const turn = entry?.type === "custom" ? fieldOf(entry.data, "turn") : undefined;
  return typeof turn === "number" ? turn : undefined;
}

function fieldOf(data: unknown, key: string): unknown {
  return typeof data === "object" && data !== null
    ? (data as Record<string, unknown>)[key]
    : undefined;
}
