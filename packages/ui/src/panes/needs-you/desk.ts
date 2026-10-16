import { type SessionProjection, toolRowText } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";
import type { LifecycleState } from "../../chrome/stamp.ts";
import { relativeAge } from "../../chrome/telemetry.ts";
import { formatCost } from "../../instruments/format.ts";
import type { AskChords } from "../../page/ask-card.tsx";
import { dismissNotice, type NeedsYouItem, needYouCount } from "../../shell/needs-you.ts";

export type DeskGroupName = "needs you" | "working" | "back" | "quiet";

export type SessionGroupName = Exclude<DeskGroupName, "needs you">;

export type DeskRow = WaitingRow | SessionRow;

export interface WaitingRow {
  readonly kind: "waiting";
  readonly key: string;
  readonly item: NeedsYouItem;
  readonly heading: string | undefined;
}

export interface SessionRow {
  readonly kind: "session";
  readonly key: string;
  readonly summary: SessionSummary;
  readonly state: LifecycleState;
}

export interface DeskGroup {
  readonly name: DeskGroupName;
  readonly rows: readonly DeskRow[];
  readonly first: number;
}

export interface DeskSources {
  readonly waiting: readonly NeedsYouItem[];
  readonly sessions: readonly SessionSummary[];
  working(sessionId: string): boolean;
  unread(summary: SessionSummary): boolean;
  quiet(sessionId: string): boolean;
}

export interface DeskKeys extends AskChords {
  readonly down: string;
  readonly up: string;
  readonly open: string;
  readonly dismiss: string;
  readonly waiting: string;
}

export function deskGroups(sources: DeskSources): DeskGroup[] {
  const placed = sessionsOffTheQueue(sources).flatMap((summary) => placementsOf(summary, sources));
  const filled = [
    { name: "needs you" as const, rows: waitingRows(sources.waiting) },
    ...sessionGroups.map((name) => ({
      name,
      rows: placed.filter((place) => place.group === name).map((place) => place.row),
    })),
  ].filter((group) => group.rows.length > 0);
  return filled.map((group, at) => ({ ...group, first: rowsBefore(filled, at) }));
}

export function deskRows(groups: readonly DeskGroup[]): DeskRow[] {
  return groups.flatMap((group) => group.rows);
}

export function nextWaiting(rows: readonly DeskRow[], from: number): number | undefined {
  const waiting = rows.flatMap((row, index) => (row.kind === "waiting" ? [index] : []));
  return waiting.find((index) => index > from) ?? waiting[0];
}

export function deskTitle(waiting: number): string {
  return waiting === 0 ? "desk" : `desk · ${needYouCount(waiting)}`;
}

export function deskHead(sources: DeskSources): string {
  const working = sessionsOffTheQueue(sources).filter((summary) => sources.working(summary.id));
  const spent = sources.sessions.reduce((sum, summary) => sum + (summary.costNanos ?? 0), 0);
  return [
    countOf(sources.sessions.length, "session"),
    sources.waiting.length > 0 ? needYouCount(sources.waiting.length) : undefined,
    working.length > 0 ? `${working.length} working` : undefined,
    spent > 0 ? formatCost(spent / 1e9) : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export function deskHint(keys: DeskKeys): string {
  const answers = [keys.approve, keys.once, keys.session, keys.workspace, keys.deny].join(" ");
  return [
    `${keys.down} ${keys.up} move`,
    `${keys.open} goes there`,
    `${answers} answer an ask`,
    `${keys.dismiss} dismisses`,
    `${keys.waiting} next waiting`,
  ].join(" · ");
}

export function rowAge(row: DeskRow, now?: number): string {
  if (row.kind === "session") return relativeAge(row.summary.lastActivityAt, now);
  const age = relativeAge(row.item.since, now);
  return age === "now" ? age : `waiting ${age}`;
}

export function sessionOfRow(row: DeskRow): string | undefined {
  return row.kind === "session" ? row.summary.id : sessionOfItem(row.item);
}

export function currentStep(projection: SessionProjection): string {
  const step = projection.entries.findLast(
    (entry) =>
      entry.kind === "tool" && (entry.run.phase === "running" || entry.run.phase === "proposed"),
  );
  return step?.kind === "tool" ? toolRowText(step.run) : "thinking";
}

export function deskDismissNotice(row: DeskRow, keys: DeskKeys): string {
  if (row.kind === "waiting") {
    return row.item.kind === "ask"
      ? `an ask is answered, never dismissed · ${keys.approve} or ${keys.deny} answers it here`
      : dismissNotice(row.item);
  }
  switch (row.state) {
    case "finished-unseen":
      return "marked read · the sessions tree still lists it";
    case "working":
      return "a working session waits on nothing · it comes back when it finishes";
    default:
      return "nothing to dismiss · quiet keeps it on the desk until quiet ends";
  }
}

export function workspaceName(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .filter((part) => part !== "")
      .at(-1) ?? path
  );
}

const sessionGroups: readonly SessionGroupName[] = ["working", "back", "quiet"];

interface Placement {
  readonly group: SessionGroupName;
  readonly row: SessionRow;
}

function placementsOf(summary: SessionSummary, sources: DeskSources): Placement[] {
  const working = sources.working(summary.id);
  const unread = !working && sources.unread(summary);
  const state: LifecycleState = working ? "working" : unread ? "finished-unseen" : "idle";
  const group = groupOf(sources.quiet(summary.id), working, unread);
  if (group === undefined) return [];
  return [{ group, row: { kind: "session", key: `session:${summary.id}`, summary, state } }];
}

function groupOf(quiet: boolean, working: boolean, unread: boolean): SessionGroupName | undefined {
  if (quiet) return "quiet";
  if (working) return "working";
  return unread ? "back" : undefined;
}

function sessionsOffTheQueue(sources: DeskSources): SessionSummary[] {
  const waiting = new Set(sources.waiting.flatMap((item) => sessionOfItem(item) ?? []));
  return [...sources.sessions]
    .filter((summary) => !waiting.has(summary.id))
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
}

function waitingRows(items: readonly NeedsYouItem[]): WaitingRow[] {
  const workspaces = [...new Set(items.map((item) => item.workspace))];
  const headed = workspaces.length > 1;
  return workspaces.flatMap((workspace) =>
    items
      .filter((item) => item.workspace === workspace)
      .map((item, at) => ({
        kind: "waiting" as const,
        key: item.key,
        item,
        heading: headed && at === 0 ? workspaceName(workspace) : undefined,
      })),
  );
}

function rowsBefore(groups: readonly { rows: readonly DeskRow[] }[], at: number): number {
  return groups.slice(0, at).reduce((count, group) => count + group.rows.length, 0);
}

function sessionOfItem(item: NeedsYouItem): string | undefined {
  return item.kind === "ask" || item.kind === "failed" ? item.sessionId : undefined;
}

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
