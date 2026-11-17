import { heldAtThePorch } from "../creature/creature.ts";
import { type CreatureReading, creatureReading } from "../creature/semantic.ts";
import type { Creature, HabitatState } from "../world/types.ts";

export interface Courtyard {
  readonly kind: "occupied";
  readonly slug: string;
  readonly index: number;
  readonly address: string;
  readonly creature: Creature;
  readonly reading: CreatureReading;
}

export interface VacantCourtyard {
  readonly kind: "vacant";
  readonly slug: string;
  readonly index: number;
  readonly address: string;
}

export interface CourtyardRange {
  readonly start: number;
  readonly end: number;
}

export const courtyardCapacity = 4096;

export class CourtyardCapacityError extends RangeError {
  constructor() {
    super(
      `Courtyards hold up to ${courtyardCapacity} addresses. The full scene remains available.`,
    );
    this.name = "CourtyardCapacityError";
  }
}

export function reconcileCourtyardOrder(
  world: HabitatState,
  prior: readonly string[],
): readonly string[] {
  const known = new Set(prior);
  const arriving = Object.values(world.creatures)
    .filter((creature) => !known.has(creature.slug))
    .sort(inOrderOfRaising)
    .map((creature) => creature.slug);
  if (known.size + arriving.length > courtyardCapacity) throw new CourtyardCapacityError();
  if (known.size === prior.length && arriving.length === 0) return prior;
  return [...known, ...arriving];
}

export function courtyardsOf(
  world: HabitatState,
  order: readonly string[],
  now: number,
): readonly (Courtyard | VacantCourtyard)[] {
  return reconcileCourtyardOrder(world, order).map((slug, index) =>
    courtyardAt(world, slug, index, now),
  );
}

export function courtyardsInRange(
  world: HabitatState,
  order: readonly string[],
  now: number,
  range: CourtyardRange,
): readonly (Courtyard | VacantCourtyard)[] {
  if (
    !Number.isSafeInteger(range.start) ||
    !Number.isSafeInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start
  )
    throw new RangeError("A courtyard range needs ordered nonnegative integer bounds.");
  return reconcileCourtyardOrder(world, order)
    .slice(range.start, range.end)
    .map((slug, offset) => courtyardAt(world, slug, range.start + offset, now));
}

function courtyardAt(
  world: HabitatState,
  slug: string,
  index: number,
  now: number,
): Courtyard | VacantCourtyard {
  const place = { slug, index, address: `Court ${index + 1}` };
  const creature = world.creatures[slug];
  if (creature === undefined) return { ...place, kind: "vacant" };
  return {
    ...place,
    kind: "occupied",
    creature,
    reading: heldAtThePorch(creatureReading(world, slug, now), world, slug),
  };
}

function inOrderOfRaising(a: Creature, b: Creature): number {
  return compare(a.workshop.raisedAt, b.workshop.raisedAt) || compare(a.slug, b.slug);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
