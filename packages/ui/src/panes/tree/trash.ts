import type {
  DiscardTrashedOutcome,
  PurgedTrash,
  RemoveOutcome,
  RestoreOutcome,
  SessionSummary,
} from "@keywork-app/protocol";
import { type SessionsRow, sessionIdOf } from "./rows.ts";

export type TrashIntent = "remove" | "restore" | "discard";

export type PendingTrash = PendingRowTrash | PendingPurge;

export interface PendingRowTrash {
  intent: TrashIntent;
  sessionId: string;
  name: string;
}

export interface PendingPurge {
  intent: "purge";
  count: number;
}

export interface TrashChords {
  show: string;
  empty: string;
}

export const busyRemovalNotice = "a turn is running · wait for it to finish before removing";

export const noLongerTrashedNotice = "that session is no longer in the trash";

export const alreadyEmptyNotice = "the trash is already empty";

export function intentFor(
  row: SessionsRow | undefined,
  intent: TrashIntent,
  nameOf: (row: SessionsRow) => string,
): PendingRowTrash | undefined {
  if (row === undefined) return undefined;
  const fits = intent === "remove" ? row.kind !== "trashed" : row.kind === "trashed";
  return fits ? { intent, sessionId: sessionIdOf(row), name: nameOf(row) } : undefined;
}

export function purgeIntent(trash: readonly SessionSummary[]): PendingPurge | undefined {
  return trash.length === 0 ? undefined : { intent: "purge", count: trash.length };
}

export function trashQuestion(pending: PendingTrash): string {
  switch (pending.intent) {
    case "remove":
      return `remove "${pending.name}"? it goes to the trash, memory notes stay`;
    case "restore":
      return `restore "${pending.name}" from the trash`;
    case "discard":
      return `delete "${pending.name}" for good? there is no undo`;
    case "purge":
      return `empty the trash? ${sessionCount(pending.count)} ${pending.count === 1 ? "goes" : "go"} for good, there is no undo`;
  }
}

export function removalNotice(outcome: RemoveOutcome, title: string, trashChord: string): string {
  if (outcome === "busy") return busyRemovalNotice;
  if (outcome === "missing") return `"${title}" is already gone`;
  return `removed "${title}" · ${trashChord} shows the trash, memory notes stay`;
}

export function restoreNotice(outcome: RestoreOutcome, name?: string): string {
  return outcome === "missing"
    ? noLongerTrashedNotice
    : `restored "${name ?? outcome.title}" · it is back in the session tree`;
}

export function discardNotice(outcome: DiscardTrashedOutcome, title: string): string {
  return outcome === "missing" ? noLongerTrashedNotice : `deleted "${title}" for good`;
}

export function purgeNotice(outcome: PurgedTrash): string {
  return outcome.purged === 0
    ? alreadyEmptyNotice
    : `deleted ${sessionCount(outcome.purged)} for good · the trash is empty`;
}

export function trashHeading(shown: boolean, count: number, chords: TrashChords): string {
  if (!shown) return `trash · ${chords.show} shows it`;
  return count === 0 ? "trash" : `trash · ${sessionCount(count)} · ${chords.empty} empties it`;
}

export function emptyTrashLine(removeChord: string): string {
  return `the trash is empty · ${removeChord} sends a session here`;
}

function sessionCount(count: number): string {
  return `${count} ${count === 1 ? "session" : "sessions"}`;
}
