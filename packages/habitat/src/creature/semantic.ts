import { day, minute, parseTs } from "../clock/clock.ts";
import type { Beat } from "../pose/pose.ts";
import type { PoseName } from "../pose/skin.ts";
import {
  childrenOf,
  crateOf,
  type DecidedForKeeper,
  type HabitatState,
  type HeldChore,
  type SessionId,
  type Slug,
  type Thread,
  type ToolAtHand,
  threadsOf,
} from "../world/types.ts";
import { type RepairQuestion, repairOf } from "./repair.ts";

export type Semantic = "porch" | "blocked" | "back" | "working" | "paused" | "idle";

export const semanticOrder: readonly Semantic[] = [
  "porch",
  "blocked",
  "back",
  "working",
  "paused",
  "idle",
];

export const staleAfter = {
  working: 30 * minute,
  blocked: 60 * minute,
  back: 7 * day,
} as const;

export const toolBeatMs = 600;

export type Glyph = "bell" | "cross" | "check" | "dot" | "pause" | "none";

export const glyphs: Readonly<Record<Semantic, Glyph>> = {
  porch: "bell",
  blocked: "cross",
  back: "check",
  working: "dot",
  paused: "pause",
  idle: "none",
};

export interface ThreadReading {
  readonly thread: SessionId;
  readonly state: Semantic;
  readonly since: number;
  readonly staleAt: number | undefined;
  readonly tool: ToolAtHand | undefined;
  readonly stumbledAt: string | undefined;
  readonly asks: number;
  readonly repair: RepairQuestion | undefined;
  readonly back:
    | { readonly at: string; readonly preview: string; readonly report: string | undefined }
    | undefined;
}

export interface ToolBeat {
  readonly clip: PoseName;
  readonly shownAt: number;
}

export interface CreatureReading {
  readonly state: Semantic;
  readonly carrier: ThreadReading | undefined;
  readonly chore?: HeldChore | undefined;
  readonly decided?: DecidedForKeeper | undefined;
  readonly lamps: number;
  readonly lanterns: number;
  readonly notes: number;
  readonly crates: number;
  readonly asks: number;
}

export function threadReading(thread: Thread, world: HabitatState, now: number): ThreadReading {
  const base = {
    thread: thread.id,
    tool: atHand(thread.turn?.tool, now),
    stumbledAt: thread.turn?.stumbledAt,
    asks: Object.keys(thread.asks).length,
    repair: repairOf(thread),
    back:
      thread.back === undefined
        ? undefined
        : { at: thread.back.at, preview: thread.back.preview, report: thread.report },
  };
  const askedAt = Object.values(thread.asks)
    .map((ask) => parseTs(ask.askedAt))
    .sort((a, b) => a - b)[0];
  if (askedAt !== undefined) return { ...base, state: "porch", since: askedAt, staleAt: undefined };
  if (base.repair !== undefined && thread.failure !== undefined) {
    return { ...base, state: "porch", since: parseTs(thread.failure.at), staleAt: undefined };
  }
  if (thread.failure !== undefined) {
    const since = parseTs(thread.failure.at);
    const staleAt = since + staleAfter.blocked;
    if (now < staleAt) return { ...base, state: "blocked", since, staleAt };
  }
  if (thread.turn !== undefined) {
    const staleAt = parseTs(thread.turn.lastProgressAt) + staleAfter.working;
    if (now < staleAt) {
      const paused = thread.waiting !== undefined || parcelFogged(world, thread);
      return {
        ...base,
        state: paused ? "paused" : "working",
        since: parseTs(thread.turn.startedAt),
        staleAt,
      };
    }
  }
  if (thread.back !== undefined) {
    const since = parseTs(thread.back.at);
    const staleAt = since + staleAfter.back;
    if (now < staleAt) return { ...base, state: "back", since, staleAt };
  }
  return {
    ...base,
    state: "idle",
    since: parseTs(thread.restingSince ?? thread.lastActivityAt),
    staleAt: undefined,
  };
}

export function rollup(
  world: HabitatState,
  threadId: SessionId,
  now: number,
): ThreadReading | undefined {
  const thread = world.threads[threadId];
  if (thread === undefined || thread.removed) return undefined;
  const readings = [thread, ...childrenOf(world, threadId)].map((each) =>
    threadReading(each, world, now),
  );
  return highest(readings);
}

export function creatureReading(world: HabitatState, slug: Slug, now: number): CreatureReading {
  const own = threadsOf(world, slug);
  const children = own.flatMap((thread) => childrenOf(world, thread.id));
  const everyThread = dedupe([...own, ...children]);
  const readings = everyThread.map((thread) => threadReading(thread, world, now));
  const carrier = highest(readings);
  return {
    state: restingState(world, slug, carrier),
    carrier,
    chore: undefined,
    lamps: own.filter((thread) => thread.kind !== "child" && thread.turn !== undefined).length,
    lanterns: everyThread.filter((thread) => thread.kind === "child" && thread.turn !== undefined)
      .length,
    notes: own.reduce((sum, thread) => sum + thread.queued, 0),
    crates: own.filter((thread) => crateOf(thread) !== undefined).length,
    asks: own.reduce((sum, thread) => sum + Object.keys(thread.asks).length, 0),
  };
}

export function restingState(
  world: HabitatState,
  slug: Slug,
  carrier: ThreadReading | undefined,
): Semantic {
  const held = carrier?.state ?? "idle";
  if (held !== "idle") return held;
  return world.creatures[slug]?.paused === undefined ? "idle" : "paused";
}

export function highest(readings: readonly ThreadReading[]): ThreadReading | undefined {
  return readings.reduce<ThreadReading | undefined>(
    (best, reading) => (best === undefined || outranksReading(reading, best) ? reading : best),
    undefined,
  );
}

export function outranksReading(a: ThreadReading, b: ThreadReading): boolean {
  const rank = semanticOrder.indexOf(a.state) - semanticOrder.indexOf(b.state);
  return rank < 0 || (rank === 0 && a.since > b.since);
}

export function clipFor(reading: CreatureReading): PoseName {
  switch (reading.state) {
    case "porch":
      return "wait";
    case "blocked":
      return "blocked";
    case "back":
    case "idle":
      return "idle";
    case "working":
      return toolClip(reading.carrier?.tool?.name);
    case "paused":
      return "sit";
  }
}

export function toolClip(name: string | undefined): PoseName {
  if (name === undefined) return "work";
  if (name === "bash") return "hammer";
  if (readingTools.has(name)) return "read";
  if (carvingTools.has(name)) return "carve";
  return "work";
}

export function toolBeatOf(
  held: ToolBeat | undefined,
  tool: string | undefined,
  now: number,
): ToolBeat | undefined {
  if (tool === undefined) return beatStands(held, now) ? held : undefined;
  const clip = toolClip(tool);
  return held?.clip === clip ? held : { clip, shownAt: now };
}

export function workingBeat(
  tool: string | undefined,
  held: ToolBeat | undefined,
  now: number,
): Beat {
  if (held !== undefined && beatStands(held, now)) return { clip: held.clip, lane: "agent" };
  return { clip: toolClip(tool), lane: "agent", walkTo: "bench" };
}

export function toolHeldUntil(tool: ToolAtHand | undefined): number | undefined {
  return tool?.until === undefined ? undefined : parseTs(tool.until) + toolBeatMs;
}

function beatStands(held: ToolBeat | undefined, now: number): held is ToolBeat {
  return held !== undefined && now < held.shownAt + toolBeatMs;
}

function atHand(tool: ToolAtHand | undefined, now: number): ToolAtHand | undefined {
  const heldUntil = toolHeldUntil(tool);
  return heldUntil === undefined || now < heldUntil ? tool : undefined;
}

const readingTools: ReadonlySet<string> = new Set(["read", "glob", "grep", "ls", "find", "search"]);
const carvingTools: ReadonlySet<string> = new Set(["edit", "write", "patch", "multi-edit"]);

function parcelFogged(world: HabitatState, thread: Thread): boolean {
  if (thread.creature === undefined) return false;
  const parcel = world.creatures[thread.creature]?.workshop.parcel;
  if (parcel === undefined) return false;
  return world.parcels[parcel]?.online === false;
}

function dedupe(threads: readonly Thread[]): Thread[] {
  const seen = new Set<SessionId>();
  return threads.filter((thread) => {
    if (seen.has(thread.id)) return false;
    seen.add(thread.id);
    return true;
  });
}
