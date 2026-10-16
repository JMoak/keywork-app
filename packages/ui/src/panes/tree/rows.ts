import type { ChildLineage } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";

export interface SessionsListing {
  readonly sessions: readonly SessionSummary[];
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
  readonly summary: SessionSummary;
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

export function foldedLine(children: number): string {
  return `▸ ${children} ${children === 1 ? "child" : "children"}`;
}

function familyRows(summary: SessionSummary, listing: SessionsListing): SessionsRow[] {
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
