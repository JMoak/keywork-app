import { pick, type Random } from "@keywork-app/habitat";
import type { SurfaceOrigin } from "../port.ts";
import {
  type Arrangement,
  arranged,
  dealWays,
  eligible,
  type Incoming,
  type Pattern,
  patternsStandingApart,
  type Way,
} from "./patterns.ts";

export type Relation = "sequence" | "siblings" | "tasks" | "notes" | "unknown";

export type Urgency = "waiting" | "soon" | "later";

export type Room = "open" | "short" | "none";

export interface BurstFacts {
  readonly asker: SurfaceOrigin;
  readonly relation: Relation;
  readonly urgency: Urgency;
  readonly previous?: Pattern | undefined;
}

export interface BurstContext extends BurstFacts {
  readonly count: number;
  readonly room: Room;
  readonly maximised: boolean;
  readonly fits: readonly Pattern[];
}

export interface Asking {
  readonly asker: SurfaceOrigin;
  readonly previous?: string | undefined;
}

export interface Dealt {
  readonly way: Way;
  readonly turn: number;
  readonly of: number;
}

export function choosePattern(context: BurstContext, random: Random): Pattern {
  if (context.count <= 1) return context.fits.includes("column") ? "column" : "cascade";
  const suited = bestSuited(context);
  if (context.asker === "keeper") return suited[0] ?? "cascade";
  const repeats = (pattern: Pattern): boolean => pattern === context.previous;
  return pick(random, unlikeThePrevious(suited, repeats)) ?? "cascade";
}

export function chosenWay(ways: readonly Way[], asking: Asking, random: Random): Way | undefined {
  if (asking.asker === "keeper") return ways[0];
  return pick(
    random,
    unlikeThePrevious(ways, (way) => way.look === asking.previous),
  );
}

export function nextDeal(incoming: Incoming, after: string | undefined): Dealt | undefined {
  const ways = dealWays(incoming);
  const looks = [...new Set(ways.map((way) => way.look))];
  const turn = (looks.indexOf(after ?? "") + 1) % Math.max(1, looks.length);
  const way = ways.find((each) => each.look === looks[turn]);
  return way === undefined ? undefined : { way, turn: turn + 1, of: looks.length };
}

export function contextOf(incoming: Incoming, facts: BurstFacts): BurstContext {
  return contextFrom(eligible(incoming), incoming, facts);
}

export function arrangedFor(incoming: Incoming, facts: BurstFacts, random: Random): Arrangement {
  const held = eligible(incoming);
  const chosen = choosePattern(contextFrom(held, incoming, facts), random);
  return held.find((arrangement) => arrangement.pattern === chosen) ?? arranged(chosen, incoming);
}

type Taste = Partial<Record<Pattern, number>>;

type Crowd = "few" | "some" | "many";

const madeForIt = 3;
const suitsIt = 2;
const passes = 1;
const aboveAll = 6;
const ruledOut = -9;

const tasteByRelation: Record<Relation, Taste> = {
  sequence: { stair: madeForIt, cascade: suitsIt, column: passes, pile: passes },
  siblings: { fan: madeForIt, column: suitsIt, grid: suitsIt, cascade: passes },
  tasks: { grid: madeForIt, column: suitsIt, cascade: passes },
  notes: { burst: madeForIt, cascade: suitsIt, column: passes, fan: passes, grid: passes },
  unknown: { column: suitsIt, cascade: suitsIt, grid: suitsIt, fan: suitsIt, burst: suitsIt },
};

const tasteByUrgency: Record<Urgency, Taste> = {
  waiting: { column: 2, grid: 2, stair: 1, fan: 1, burst: -1, pile: ruledOut },
  soon: {},
  later: { pile: aboveAll },
};

const tasteByCrowd: Record<Crowd, Taste> = {
  few: { column: 1, burst: -2 },
  some: {},
  many: { cascade: 1, burst: 1, column: -1, stair: -1, fan: -2 },
};

const crowdUpTo = { few: 3, some: 8 } as const;

const plainestFirst: readonly Pattern[] = [
  "column",
  "cascade",
  "grid",
  "stair",
  "fan",
  "burst",
  "pile",
];

function bestSuited(context: BurstContext): readonly Pattern[] {
  const fitting = plainestFirst.filter((pattern) => context.fits.includes(pattern));
  const best = Math.max(...fitting.map((pattern) => suits(pattern, context)));
  return fitting.filter((pattern) => suits(pattern, context) === best);
}

function suits(pattern: Pattern, context: BurstContext): number {
  return (
    (tasteByRelation[context.relation][pattern] ?? 0) +
    (tasteByUrgency[context.urgency][pattern] ?? 0) +
    (tasteByCrowd[crowdOf(context.count)][pattern] ?? 0) +
    (pattern === "cascade" && isShortOfRoom(context) ? 1 : 0)
  );
}

function crowdOf(count: number): Crowd {
  if (count <= crowdUpTo.few) return "few";
  return count <= crowdUpTo.some ? "some" : "many";
}

function isShortOfRoom(context: BurstContext): boolean {
  return context.maximised || context.room !== "open";
}

function unlikeThePrevious<Choice>(
  suited: readonly Choice[],
  repeats: (choice: Choice) => boolean,
): readonly Choice[] {
  const others = suited.filter((choice) => !repeats(choice));
  return others.length > 0 ? others : suited;
}

function contextFrom(
  held: readonly Arrangement[],
  incoming: Incoming,
  facts: BurstFacts,
): BurstContext {
  return {
    ...facts,
    count: incoming.arriving.length,
    room: roomAround(held),
    maximised: incoming.desk.consoleMaximized,
    fits: held.map((arrangement) => arrangement.pattern),
  };
}

function roomAround(held: readonly Arrangement[]): Room {
  const beside = held.filter((arrangement) => arrangement.stands === "beside");
  if (beside.length === 0) return "none";
  return beside.some(({ pattern }) => patternsStandingApart.has(pattern)) ? "open" : "short";
}
