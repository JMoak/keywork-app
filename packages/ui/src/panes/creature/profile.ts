import type { ChildLineage } from "@keywork-app/client";
import type { Chore, Landmark, Thread } from "@keywork-app/habitat";
import type { SessionRow } from "@keywork-app/protocol";
import { firstLines, groupWords, inheritWord, modelChoiceLine } from "./copy.ts";
import {
  type CreatureDetail,
  type KeeperReport,
  type ModelChoice,
  type ModelClass,
  type ModelPolicy,
  modelClasses,
  type RoutineFileView,
  type RoutineRow,
  type ThreadState,
} from "./wire.ts";

export type ThreadGroup = keyof typeof groupWords;

export interface ThreadRow {
  readonly id: string;
  readonly group: ThreadGroup;
  readonly title: string;
  readonly kind: "conversation" | "thread" | "routine" | "child";
  readonly state: string;
  readonly children: number;
  readonly costNanos: number | undefined;
  readonly lastActivityAt: string | undefined;
  readonly parent: string | undefined;
}

export type ReadableRoutine = RoutineRow & { readonly routine: RoutineFileView };

export interface UsageRow {
  readonly period: "today" | "week";
  readonly sessions: number;
  readonly costNanos: number | null;
  readonly unpriced: number;
}

export interface PolicyRow {
  readonly modelClass: ModelClass;
  readonly choice: ModelChoice;
  readonly line: string;
}

export interface RememberedRow {
  readonly kind: Landmark["kind"];
  readonly at: string;
  readonly line: string;
  readonly evidence: string;
}

export interface ShadowRow {
  readonly ruleClass: string;
  readonly rows: number;
  readonly agreement: number | undefined;
  readonly wouldAct: number;
  readonly gradeWord: string;
  readonly oneWayDoor: boolean;
}

export type PausePlan =
  | { readonly kind: "pause"; readonly targets: readonly ReadableRoutine[] }
  | { readonly kind: "resume"; readonly targets: readonly ReadableRoutine[] }
  | { readonly kind: "none" };

export interface ThreadSources {
  readonly rows: readonly SessionRow[];
  childrenOf(parent: string): readonly ChildLineage[];
  liveThread(id: string): Thread | undefined;
}

export const weekMs = 7 * 24 * 60 * 60 * 1000;
export const nameLimit = 64;

export function threadRows(detail: CreatureDetail, sources: ThreadSources): ThreadRow[] {
  const byId = new Map(sources.rows.map((row) => [row.id, row]));
  const conversation = byId.get(detail.conversation);
  const head: ThreadRow = {
    id: detail.conversation,
    group: "conversation",
    title: titleOf(conversation?.title, groupWords.conversation),
    kind: "conversation",
    state: liveState(sources.liveThread(detail.conversation)) ?? stateOfRow(conversation),
    children: 0,
    costNanos: conversation?.costNanos,
    lastActivityAt: conversation?.lastActivityAt,
    parent: undefined,
  };
  const threads = [...detail.threads]
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
    .map(
      (thread): ThreadRow => ({
        id: thread.id,
        group: "threads",
        title: titleOf(thread.title, thread.id),
        kind: thread.kind,
        state: liveState(sources.liveThread(thread.id)) ?? thread.state,
        children: thread.children,
        costNanos: byId.get(thread.id)?.costNanos,
        lastActivityAt: thread.lastActivityAt,
        parent: undefined,
      }),
    );
  const children = threads.flatMap((thread) =>
    sources.childrenOf(thread.id).map(
      (child): ThreadRow => ({
        id: child.sessionId,
        group: "children",
        title: titleOf(child.title, child.sessionId),
        kind: "child",
        state: child.state,
        children: 0,
        costNanos: child.costNanos,
        lastActivityAt: byId.get(child.sessionId)?.lastActivityAt,
        parent: thread.id,
      }),
    ),
  );
  return [head, ...threads, ...children];
}

export function usageRows(
  detail: CreatureDetail,
  rows: readonly SessionRow[],
  now: number,
): UsageRow[] {
  const since = now - weekMs;
  const week = rows.filter(
    (row) => row.bot === detail.slug && Date.parse(row.lastActivityAt) >= since,
  );
  const priced = week.filter((row) => row.costNanos !== undefined);
  return [
    {
      period: "today",
      sessions: detail.usage.sessions,
      costNanos: detail.usage.costNanos,
      unpriced: 0,
    },
    {
      period: "week",
      sessions: week.length,
      costNanos:
        priced.length === 0 ? null : priced.reduce((sum, row) => sum + (row.costNanos ?? 0), 0),
      unpriced: week.length - priced.length,
    },
  ];
}

export function policyRows(models: ModelPolicy): PolicyRow[] {
  return modelClasses.map((modelClass) => ({
    modelClass,
    choice: models[modelClass],
    line: modelChoiceLine(models[modelClass]),
  }));
}

export function rememberedRows(landmarks: readonly Landmark[], slug: string): RememberedRow[] {
  return landmarks
    .filter((landmark) => landmark.creature === slug)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((landmark) => ({
      kind: landmark.kind,
      at: landmark.at,
      line: firstLines[landmark.kind],
      evidence: landmark.evidence,
    }));
}

export function shadowRows(report: KeeperReport): ShadowRow[] {
  return report.classes.map((each) => ({
    ruleClass: each.ruleClass,
    rows: each.rows,
    agreement: each.agreement,
    wouldAct: each.wouldAct,
    gradeWord: each.gradeWord,
    oneWayDoor: each.oneWayDoor,
  }));
}

export function liveState(thread: Thread | undefined): ThreadState | undefined {
  if (thread === undefined) return undefined;
  if (Object.keys(thread.asks).length > 0) return "waiting";
  if (thread.failure !== undefined) return "blocked";
  if (thread.waiting !== undefined) return "paused";
  if (thread.turn !== undefined) return "working";
  if (thread.back !== undefined) return "back";
  return undefined;
}

export function choresOf(routines: readonly RoutineRow[]): Chore[] {
  return routines.flatMap((row) =>
    row.routine === null
      ? []
      : [
          {
            id: row.id,
            title: row.routine.title,
            nextAt: row.schedule.enabled ? (row.schedule.nextRunAt ?? undefined) : undefined,
            lastRanAt: undefined,
            running: row.activeRunId ?? undefined,
          },
        ],
  );
}

export function nextChore(chores: readonly Chore[]): Chore | undefined {
  return chores
    .filter((chore) => chore.nextAt !== undefined)
    .sort((a, b) => (a.nextAt ?? "").localeCompare(b.nextAt ?? ""))[0];
}

export function pausePlan(routines: readonly RoutineRow[]): PausePlan {
  const readable = routines.filter((row): row is ReadableRoutine => row.routine !== null);
  if (readable.length === 0) return { kind: "none" };
  const firing = readable.filter((row) => row.schedule.enabled);
  return firing.length > 0
    ? { kind: "pause", targets: firing }
    : { kind: "resume", targets: readable };
}

export function creatureFilePath(slug: string): string {
  return `.keywork/bots/${slug}/creature.json`;
}

export function parseModelReference(text: string): ModelChoice | undefined {
  const flat = text.trim();
  if (flat === "" || flat === inheritWord) return "inherit";
  const slash = flat.indexOf("/");
  if (slash <= 0 || slash === flat.length - 1) return undefined;
  return { provider: flat.slice(0, slash), model: flat.slice(slash + 1) };
}

export function plainName(text: string): string | undefined {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length === 0 || flat.length > nameLimit ? undefined : flat;
}

export function dayWord(iso: string): string {
  return iso.slice(0, 10);
}

function titleOf(title: string | undefined, fallback: string): string {
  return title === undefined || title === "" ? fallback : title;
}

function stateOfRow(row: SessionRow | undefined): ThreadRow["state"] {
  if (row === undefined) return "idle";
  if (row.waiting !== undefined && row.waiting.asks > 0) return "waiting";
  return row.working === true ? "working" : "idle";
}
