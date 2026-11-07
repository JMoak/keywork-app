import {
  bellLine,
  type ChoreAtTheBell,
  childrenOf,
  decidedFor,
  type HabitatState,
  ringingTheBell,
  type Thread,
  type ThreadReading,
  threadReading,
  threadsOf,
} from "@keywork-app/habitat";
import { coatOf } from "../panes/stead/herd.ts";
import type {
  AnswerPick,
  CompanionSnapshot,
  HeldChoreNeed,
  HeldDecision,
  WorkTool,
} from "./port.ts";
import { type CreatureFacts, snapshotFrom, type ThreadFacts } from "./snapshot.ts";

export interface Resident extends CreatureFacts {
  readonly slug: string;
}

export type AnswersFor = (threadId: string, callId: string) => readonly AnswerPick[];

export const defaultAnswers: readonly AnswerPick[] = ["approve", "deny"];

export function residents(world: HabitatState): Resident[] {
  return Object.keys(world.creatures)
    .sort()
    .map((slug, index) => ({
      slug,
      name: world.creatures[slug]?.name ?? slug,
      hueStop: coatOf(world.creatures[slug], index),
    }));
}

export function creatureSnapshot(
  world: HabitatState,
  resident: Resident,
  now: number,
  answersFor: AnswersFor = () => defaultAnswers,
): CompanionSnapshot {
  const own = threadsOf(world, resident.slug);
  const children = own.flatMap((thread) => childrenOf(world, thread.id));
  const seen = new Set<string>();
  const facts = [...own, ...children].flatMap((thread) => {
    if (seen.has(thread.id)) return [];
    seen.add(thread.id);
    return [threadFacts(thread, threadReading(thread, world, now), answersFor)];
  });
  return snapshotFrom(
    { name: resident.name, hueStop: resident.hueStop, slug: resident.slug },
    facts,
    heldChoreOf(world, resident.slug),
    decidedOf(world, resident.slug),
  );
}

export function decidedOf(world: HabitatState, slug: string): HeldDecision | undefined {
  const decided = decidedFor(world, slug);
  if (decided === undefined) return undefined;
  const thread = world.threads[decided.sessionId];
  return {
    recordId: decided.recordId,
    sessionId: decided.sessionId,
    title: thread === undefined || thread.title === "" ? decided.sessionId : thread.title,
    tool: decided.tool,
    ruleClass: decided.ruleClass,
  };
}

export function heldChoreOf(world: HabitatState, slug: string): HeldChoreNeed | undefined {
  const held = ringingTheBell(world)
    .filter((item): item is ChoreAtTheBell => item.kind === "chore" && item.creature === slug)
    .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""))[0];
  if (held === undefined) return undefined;
  return {
    creature: held.creature,
    routineId: held.routineId,
    line: bellLine(held),
    reason: held.reason,
    digest: held.digest,
  };
}

export function threadOfAsk(world: HabitatState, callId: string): string | undefined {
  return Object.values(world.threads).find((thread) => callId in thread.asks)?.id;
}

export function workToolOf(name: string | undefined): WorkTool {
  switch (name) {
    case "bash":
      return "bash";
    case "read":
      return "read";
    case "edit":
    case "write":
    case "multi_edit":
      return "edit";
    default:
      return undefined;
  }
}

function threadFacts(thread: Thread, reading: ThreadReading, answersFor: AnswersFor): ThreadFacts {
  const ask = earliestAsk(thread);
  return {
    id: thread.id,
    title: thread.title,
    live: thread.turn !== undefined,
    working: reading.state === "working" || reading.state === "paused",
    failed: reading.state === "blocked",
    finishedUnseen: reading.state === "back",
    paused: reading.state === "paused",
    tool: workToolOf(reading.tool?.name),
    crate: reading.back !== undefined,
    ask:
      ask === undefined
        ? undefined
        : { callId: ask.callId, tool: ask.tool, answers: answersFor(thread.id, ask.callId) },
  };
}

function earliestAsk(thread: Thread): Thread["asks"][string] | undefined {
  return Object.values(thread.asks).sort((a, b) => a.askedAt.localeCompare(b.askedAt))[0];
}
