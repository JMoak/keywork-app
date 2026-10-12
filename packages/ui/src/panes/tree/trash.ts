import type {
  DiscardTrashedOutcome,
  RemoveOutcome,
  RestoreOutcome,
  SessionSummary,
} from "@keywork-app/protocol";

export type SessionsRow = { kind: "session" | "trashed"; summary: SessionSummary };

export type TrashIntent = "remove" | "restore" | "discard";

export interface PendingTrash {
  intent: TrashIntent;
  summary: SessionSummary;
  name: string;
}

export const busyRemovalNotice = "a turn is running · wait for it to finish before removing";

export const noLongerTrashedNotice = "that session is no longer in the trash";

export function sessionsRows(
  sessions: readonly SessionSummary[],
  trash: readonly SessionSummary[],
  showTrash: boolean,
): SessionsRow[] {
  return [
    ...sessions.map((summary): SessionsRow => ({ kind: "session", summary })),
    ...(showTrash ? trash.map((summary): SessionsRow => ({ kind: "trashed", summary })) : []),
  ];
}

export function intentFor(
  row: SessionsRow | undefined,
  intent: TrashIntent,
  nameOf: (summary: SessionSummary) => string,
): PendingTrash | undefined {
  if (row === undefined) return undefined;
  const fits = intent === "remove" ? row.kind === "session" : row.kind === "trashed";
  return fits ? { intent, summary: row.summary, name: nameOf(row.summary) } : undefined;
}

export function trashQuestion(pending: PendingTrash): string {
  const title = pending.name;
  switch (pending.intent) {
    case "remove":
      return `remove "${title}"? it goes to the trash, memory notes stay`;
    case "restore":
      return `restore "${title}" from the trash`;
    case "discard":
      return `delete "${title}" for good? there is no undo`;
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

export function trashHeading(shown: boolean, count: number, trashChord: string): string {
  if (!shown) return `trash · ${trashChord} shows it`;
  return count === 0 ? "trash" : `trash · ${count} ${count === 1 ? "session" : "sessions"}`;
}

export function emptyTrashLine(removeChord: string): string {
  return `the trash is empty · ${removeChord} sends a session here`;
}
