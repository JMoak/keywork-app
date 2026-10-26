import { type ChildLineage, countsOf, type SessionProjection } from "@keywork-app/client";
import type {
  ChangesSummary,
  SessionRow as ListedSession,
  SessionSummary,
} from "@keywork-app/protocol";

export type Liveness = "waiting" | "working" | "idle";

export interface SessionsListing {
  readonly sessions: readonly ListedSession[];
  readonly trash: readonly SessionSummary[];
  readonly showTrash: boolean;
  readonly folded: ReadonlySet<string>;
  children(parentId: string): readonly ChildLineage[];
  childOf(id: string): ChildLineage | undefined;
  trashed(id: string): boolean;
  nameOf(id: string): string | undefined;
}

export type SessionsRow = SessionRow | ChildRow | TrashedRow;

export interface SessionRow {
  readonly kind: "session";
  readonly summary: ListedSession;
  readonly children: number;
  readonly folded: boolean;
  readonly parent: ParentFact | undefined;
}

export interface ChildRow {
  readonly kind: "child";
  readonly child: ChildLineage;
}

export interface TrashedRow {
  readonly kind: "trashed";
  readonly summary: SessionSummary;
}

export interface ParentFact {
  readonly name: string | undefined;
  readonly trashed: boolean;
}

export function sessionsRows(listing: SessionsListing): SessionsRow[] {
  const listed = new Set(listing.sessions.map((summary) => summary.id));
  const nested = (id: string): boolean => {
    const parentId = listing.childOf(id)?.parentId;
    return parentId !== undefined && listed.has(parentId);
  };
  return [
    ...listing.sessions
      .filter((summary) => !nested(summary.id))
      .flatMap((summary) => familyRows(summary, listing)),
    ...(listing.showTrash
      ? listing.trash.map((summary): SessionsRow => ({ kind: "trashed", summary }))
      : []),
  ];
}

export function livenessOf(
  projection: SessionProjection | undefined,
  listed: ListedSession | undefined,
): Liveness {
  if (sessionWaiting(projection, listed)) return "waiting";
  return sessionWorking(projection, listed) ? "working" : "idle";
}

export function sessionWorking(
  projection: Pick<SessionProjection, "turn"> | undefined,
  listed: Pick<ListedSession, "working"> | undefined,
): boolean {
  return projection === undefined ? listed?.working === true : projection.turn !== undefined;
}

export function sessionWaiting(
  projection: Pick<SessionProjection, "entries"> | undefined,
  listed: Pick<ListedSession, "waiting"> | undefined,
): boolean {
  if (projection === undefined) return (listed?.waiting?.asks ?? 0) > 0;
  return projection.entries.some((entry) => entry.kind === "tool" && entry.run.phase === "asking");
}

export interface ChangesFacts {
  readonly files: string;
  readonly counts: string;
}

export function changesFacts(changes: ChangesSummary | undefined): ChangesFacts | undefined {
  if (changes === undefined || changes.files === 0) return undefined;
  return {
    files: changes.files === 1 ? "1 file" : `${changes.files} files`,
    counts: countsOf(changes),
  };
}

export function changesLine(changes: ChangesSummary | undefined): string | undefined {
  const facts = changesFacts(changes);
  return facts === undefined ? undefined : `${facts.files} · ${facts.counts}`;
}

export function sessionIdOf(row: SessionsRow): string {
  return row.kind === "child" ? row.child.sessionId : row.summary.id;
}

export function parentLine(fact: ParentFact): string {
  if (fact.trashed) {
    return fact.name === undefined
      ? "↳ child of a trashed session"
      : `↳ child of ${fact.name} · trashed`;
  }
  return fact.name === undefined
    ? "↳ child of a session not loaded"
    : `↳ child of ${fact.name} · not loaded`;
}

export interface NamedSession {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export function distinctNames(sessions: readonly NamedSession[]): ReadonlyMap<string, string> {
  const named = new Map<string, string>();
  for (const namesakes of groupedByName(sessions)) {
    oldestFirst(namesakes).forEach((session, place) => {
      named.set(session.id, place === 0 ? session.name : `${session.name} · ${place + 1}`);
    });
  }
  return named;
}

export function foldedLine(children: number): string {
  return `▸ ${children} ${children === 1 ? "child" : "children"}`;
}

function familyRows(summary: ListedSession, listing: SessionsListing): SessionsRow[] {
  const children = listing
    .children(summary.id)
    .filter((child) => !listing.trashed(child.sessionId));
  const folded = children.length > 0 && listing.folded.has(summary.id);
  const row: SessionRow = {
    kind: "session",
    summary,
    children: children.length,
    folded,
    parent: parentFactOf(summary.id, listing),
  };
  if (folded) return [row];
  return [row, ...children.map((child): SessionsRow => ({ kind: "child", child }))];
}

function parentFactOf(id: string, listing: SessionsListing): ParentFact | undefined {
  const parentId = listing.childOf(id)?.parentId;
  if (parentId === undefined) return undefined;
  return {
    name: listing.nameOf(parentId),
    trashed: listing.trashed(parentId) || listing.trash.some((summary) => summary.id === parentId),
  };
}

function groupedByName(sessions: readonly NamedSession[]): NamedSession[][] {
  const groups = new Map<string, NamedSession[]>();
  for (const session of sessions)
    groups.set(session.name, [...(groups.get(session.name) ?? []), session]);
  return [...groups.values()];
}

function oldestFirst(sessions: readonly NamedSession[]): NamedSession[] {
  return [...sessions].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}
