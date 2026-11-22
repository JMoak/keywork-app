import type { CreatureHandoff, CreatureHandoffChange } from "@keywork-app/protocol";
import type { Slug } from "../world/types.ts";
import type { RoadGrade } from "./kit.ts";
import type { Partnership } from "./scene.ts";

export const handoffsFor = { trodden: 1, cart: 5, paved: 20 } as const;

export const droppedPairTakesItsRoadUp: boolean = true;

export type HandoffTally = Readonly<Record<string, CreatureHandoff>>;

export const noHandoffs: HandoffTally = {};

export interface Pairing extends Partnership {
  readonly handoffs: number;
}

export function roadGradeFor(handoffs: number): RoadGrade {
  if (handoffs >= handoffsFor.paved) return 3;
  if (handoffs >= handoffsFor.cart) return 2;
  if (handoffs >= handoffsFor.trodden) return 1;
  return 0;
}

export function tallyOf(rows: readonly CreatureHandoff[]): HandoffTally {
  return rows.reduce<HandoffTally>(
    (tally, handoff) => tallyAfter(tally, { change: "counted", handoff }),
    noHandoffs,
  );
}

export function tallyAfter(tally: HandoffTally, change: CreatureHandoffChange): HandoffTally {
  const key = directionKey(change.handoff.from, change.handoff.to);
  const held = tally[key];
  if (held !== undefined && olderThan(change.handoff, held)) return tally;
  if (change.change === "counted") return { ...tally, [key]: { ...change.handoff } };
  if (held === undefined || !droppedPairTakesItsRoadUp) return tally;
  return Object.fromEntries(Object.entries(tally).filter(([each]) => each !== key));
}

export function partnershipsOf(tally: HandoffTally): Pairing[] {
  const pairs = new Map<string, { between: readonly [Slug, Slug]; handoffs: number }>();
  for (const { from, to, count } of Object.values(tally)) {
    if (from === to || !(count > 0)) continue;
    const between = from < to ? ([from, to] as const) : ([to, from] as const);
    const key = directionKey(...between);
    const known = pairs.get(key);
    pairs.set(key, { between, handoffs: (known?.handoffs ?? 0) + count });
  }
  return [...pairs.values()]
    .map((pair) => ({ ...pair, grade: roadGradeFor(pair.handoffs) }))
    .filter((pair) => pair.grade > 0)
    .sort(
      (a, b) =>
        b.handoffs - a.handoffs ||
        a.between[0].localeCompare(b.between[0]) ||
        a.between[1].localeCompare(b.between[1]),
    );
}

function olderThan(incoming: CreatureHandoff, held: CreatureHandoff): boolean {
  const age = Date.parse(incoming.lastAt) - Date.parse(held.lastAt);
  return age < 0 || (age === 0 && incoming.count < held.count);
}

function directionKey(from: Slug, to: Slug): string {
  return JSON.stringify([from, to]);
}
