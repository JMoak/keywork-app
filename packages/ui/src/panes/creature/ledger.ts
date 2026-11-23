import type { CreatureLedgerEntry } from "@keywork-app/protocol";
import { relativeAge } from "../../chrome/telemetry.ts";
import {
  answerWords,
  conversationWords,
  doingLine,
  type LedgerSign,
  nowWord,
  waitingCount,
  waitingLine,
} from "./copy.ts";

export type { LedgerSign } from "./copy.ts";

export interface LedgerSummary {
  readonly projects: readonly string[];
  readonly waiting: number;
  readonly running: readonly string[];
}

export function ledgerOrder(entries: readonly CreatureLedgerEntry[]): CreatureLedgerEntry[] {
  return [...entries].sort(keeperFirst);
}

export function signOf(entry: CreatureLedgerEntry): LedgerSign {
  if (entry.kind === "question") return waitsOnKeeper(entry) ? "asks" : "asked";
  if (entry.state === "running") return "running";
  if (entry.state === "finished") return "back";
  return entry.state === "blocked" ? "blocked" : "done";
}

export function waitsOnKeeper(entry: CreatureLedgerEntry): boolean {
  return entry.kind === "question" && entry.state === "waiting";
}

export function unseen(entry: CreatureLedgerEntry): boolean {
  return entry.kind === "task" && entry.state === "finished";
}

export function answeredWithoutConversation(entry: CreatureLedgerEntry): boolean {
  return entry.kind === "question" && entry.state === "answered" && entry.conversation === null;
}

export function metaOf(entry: CreatureLedgerEntry, now: number, project?: string): string {
  const answer = entry.answer === null ? undefined : answerWords[entry.answer];
  const parts = [project, answer, conversationNoteOf(entry), ageOf(entry, now)];
  return parts.filter((part): part is string => part !== undefined).join(" · ");
}

export type ConversationStanding = keyof typeof conversationWords;

export function conversationStandingOf(
  entry: CreatureLedgerEntry,
): ConversationStanding | undefined {
  const conversation = entry.conversation;
  if (conversation === null) return undefined;
  if (conversation.state === "open") return "open";
  return conversation.endedBy === "keeper" ? "closed" : "ended";
}

function conversationNoteOf(entry: CreatureLedgerEntry): string | undefined {
  const standing = conversationStandingOf(entry);
  return standing === undefined ? undefined : conversationWords[standing];
}

export function ageOf(entry: CreatureLedgerEntry, now: number): string {
  if (entry.state === "running") return nowWord;
  return relativeAge(entry.closedAt ?? entry.openedAt, now);
}

export function projectOf(directory: string): string {
  const parts = directory.split(/[\\/]+/).filter((part) => part !== "");
  return parts.at(-1) ?? directory;
}

export function spansProjects(entries: readonly CreatureLedgerEntry[]): boolean {
  return new Set(entries.map((entry) => projectOf(entry.directory))).size > 1;
}

export function summaryOf(
  entries: readonly CreatureLedgerEntry[],
  bound: readonly string[],
  home: string,
): LedgerSummary {
  const ordered = ledgerOrder(entries);
  return {
    projects: bound.length > 0 ? [...bound] : workedIn(ordered, home),
    waiting: entries.filter(waitsOnKeeper).length,
    running: ordered.filter((entry) => entry.state === "running").map((entry) => entry.title),
  };
}

export function summaryLines(summary: LedgerSummary): readonly string[] {
  return [doingLine(summary.projects, summary.running), waitingLine(summary.waiting)];
}

export function headCount(summary: LedgerSummary): string {
  return waitingCount(summary.waiting);
}

function workedIn(ordered: readonly CreatureLedgerEntry[], home: string): string[] {
  const away = ordered.filter((entry) => plainPath(entry.directory) !== plainPath(home));
  return [...new Set(away.map((entry) => projectOf(entry.directory)))].filter(
    (name) => name !== "",
  );
}

function plainPath(path: string): string {
  return path
    .replace(/[\\/]+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();
}

function keeperFirst(left: CreatureLedgerEntry, right: CreatureLedgerEntry): number {
  return (
    groupOf(left) - groupOf(right) ||
    momentOf(right).localeCompare(momentOf(left)) ||
    left.id.localeCompare(right.id)
  );
}

function groupOf(entry: CreatureLedgerEntry): number {
  if (waitsOnKeeper(entry)) return 0;
  return entry.state === "running" ? 1 : 2;
}

function momentOf(entry: CreatureLedgerEntry): string {
  return entry.closedAt ?? entry.openedAt;
}
