import { minute, second } from "../clock/clock.ts";
import { between, type Random } from "../clock/random.ts";
import type { Place } from "../pose/pose.ts";
import type { PoseName } from "../pose/skin.ts";
import type { Needs } from "./needs.ts";

export type IdleKind = "rest" | "stretch" | "wander" | "inspect" | "look" | "tidy" | "tend" | "sit";

export const idleKinds: readonly IdleKind[] = [
  "rest",
  "stretch",
  "wander",
  "inspect",
  "look",
  "tidy",
  "tend",
  "sit",
];

export interface IdleChoice {
  readonly kind: IdleKind;
  readonly target: Place | undefined;
  readonly clip: PoseName;
  readonly cycles: number | undefined;
  readonly duration: number;
}

export interface RecentIdle {
  readonly kind: IdleKind;
  readonly at: number;
}

export interface Mood {
  readonly needs: Needs;
  readonly whimsy: number;
  readonly recent: readonly RecentIdle[];
  readonly now: number;
  readonly quietHours: boolean;
}

export interface Opportunities {
  readonly crateArrived: boolean;
  readonly treeExists: boolean;
  readonly beyondGates: readonly Place[];
  readonly inspectables: readonly Place[];
  readonly pointerNear: boolean;
  readonly nearThePorch: boolean;
}

export const idleGap = { min: 20 * second, max: 90 * second } as const;

export const cooldowns: Readonly<Record<IdleKind, number>> = {
  rest: 10 * minute,
  stretch: 60 * second,
  wander: 90 * second,
  inspect: 45 * second,
  look: 5 * second,
  tidy: 30 * second,
  tend: 20 * minute,
  sit: 2 * minute,
};

export const recentLimit = 12;

export function nextIdleDelay(random: Random, needs: Needs): number {
  const content = 1 - Math.max(needs.rest, needs.curiosity, needs.order);
  const span = idleGap.max - idleGap.min;
  return Math.round(idleGap.min + span * (0.35 * content + 0.65 * random()));
}

export function chooseIdle(
  random: Random,
  mood: Mood,
  where: Opportunities,
): IdleChoice | undefined {
  const candidates = eligible(random, mood, where);
  if (candidates.length === 0) return undefined;
  const best = Math.max(...candidates.map((candidate) => candidate.utility));
  const gap = 0.05 + mood.whimsy * 0.42;
  const within = candidates.filter((candidate) => candidate.utility >= best - gap);
  const top = within.reduce((a, b) => (a.utility >= b.utility ? a : b));
  if (mood.whimsy === 0) return top.choice;
  const temperature = 0.07 + mood.whimsy * 0.27;
  const weights = within.map((candidate) =>
    Math.exp((candidate.utility - best + mood.whimsy * 0.22 * candidate.novelty) / temperature),
  );
  let pick = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (const [index, candidate] of within.entries()) {
    pick -= weights[index] ?? 0;
    if (pick <= 0) return candidate.choice;
  }
  return top.choice;
}

interface Candidate {
  readonly choice: IdleChoice;
  readonly utility: number;
  readonly novelty: number;
}

function eligible(random: Random, mood: Mood, where: Opportunities): Candidate[] {
  const { needs, quietHours } = mood;
  const last = mood.recent.at(-1)?.kind;
  const offered: { kind: IdleKind; allowed: boolean; utility: number; choice: () => IdleChoice }[] =
    [
      {
        kind: "rest",
        allowed: needs.rest >= 0.45 || quietHours,
        utility: 0.35 + Math.max(0, needs.rest - 0.4) * 1.4 + (quietHours ? 0.28 : 0),
        choice: () =>
          stay("rest", "hay", "nap", undefined, between(random, 15 * second, 40 * second)),
      },
      {
        kind: "stretch",
        allowed: true,
        utility: 0.35 + needs.rest * 0.3,
        choice: () => stay("stretch", undefined, "stretch", 2, 1.5 * second),
      },
      {
        kind: "wander",
        allowed: needs.curiosity >= 0.25,
        utility: 0.35 + needs.curiosity * 0.5 + (where.beyondGates.length > 0 ? 0.1 : 0),
        choice: () =>
          stay(
            "wander",
            pickPlace(random, where.beyondGates, farPlaces),
            "idle",
            undefined,
            between(random, 6 * second, 10 * second),
          ),
      },
      {
        kind: "inspect",
        allowed: where.inspectables.length > 0,
        utility: 0.35 + needs.curiosity * 0.45 + (where.crateArrived ? 0.15 : 0),
        choice: () =>
          stay(
            "inspect",
            pickPlace(random, where.inspectables, ["door"]),
            "look",
            undefined,
            between(random, 4 * second, 7 * second),
          ),
      },
      {
        kind: "look",
        allowed: where.pointerNear,
        utility: 0.6,
        choice: () => stay("look", undefined, "look", undefined, 3 * second),
      },
      {
        kind: "tidy",
        allowed: where.crateArrived,
        utility: 0.35 + needs.order * 0.6,
        choice: () =>
          stay("tidy", "door", "carry", undefined, between(random, 4 * second, 6 * second)),
      },
      {
        kind: "tend",
        allowed: where.treeExists && needs.order >= 0.3,
        utility: 0.35 + needs.order * 0.5,
        choice: () => stay("tend", "tree", "deliver", 2, 3 * second),
      },
      {
        kind: "sit",
        allowed: true,
        utility: 0.4 + (1 - needs.curiosity) * 0.2,
        choice: () =>
          stay(
            "sit",
            where.nearThePorch ? "porch" : "fence",
            "sit",
            undefined,
            between(random, 10 * second, 25 * second),
          ),
      },
    ];
  return offered.flatMap((offer) => {
    const repeat = offer.kind === last && !(offer.kind === "rest" && needs.rest >= 0.7);
    if (!offer.allowed || repeat || coolingDown(mood, offer.kind)) return [];
    const count = mood.recent.filter((recent) => recent.kind === offer.kind).length;
    return [{ choice: offer.choice(), utility: offer.utility, novelty: 1 / (1 + count) }];
  });
}

const farPlaces: readonly Place[] = ["tree", "fence", "mill", "storehouse"];

function coolingDown(mood: Mood, kind: IdleKind): boolean {
  const last = mood.recent.findLast((recent) => recent.kind === kind);
  return last !== undefined && mood.now - last.at < cooldowns[kind];
}

function pickPlace(random: Random, preferred: readonly Place[], fallback: readonly Place[]): Place {
  const pool = preferred.length > 0 ? preferred : fallback;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? "fence";
}

function stay(
  kind: IdleKind,
  target: Place | undefined,
  clip: PoseName,
  cycles: number | undefined,
  duration: number,
): IdleChoice {
  return { kind, target, clip, cycles, duration: Math.round(duration) };
}
