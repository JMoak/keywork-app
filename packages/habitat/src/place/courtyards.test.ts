import { describe, expect, it } from "vitest";
import { type Creature, emptyHabitat, type HabitatState } from "../world/types.ts";
import {
  CourtyardCapacityError,
  courtyardCapacity,
  courtyardsOf,
  reconcileCourtyardOrder,
} from "./index.ts";

const raisedAt = "2026-11-05T12:00:00.000Z";
const now = Date.parse(raisedAt);

describe("courtyard addresses", () => {
  it("sorts arrivals by raising time then slug regardless of record insertion order", () => {
    const a = creature("a");
    const b = creature("b");
    const later = creature("later", "2026-11-06T12:00:00.000Z");
    const order = reconcileCourtyardOrder(world(later, b, a), []);
    expect(order).toEqual(["a", "b", "later"]);
    expect(reconcileCourtyardOrder(world(a, later, b), order)).toBe(order);
  });

  it("appends even older arrivals without moving established addresses", () => {
    const order = ["later"];
    const expanded = reconcileCourtyardOrder(
      world(creature("later", "2026-11-06T12:00:00.000Z"), creature("a")),
      order,
    );
    expect(expanded).toEqual(["later", "a"]);
    expect(order).toEqual(["later"]);
  });

  it("keeps removal holes and gives a returning creature its original address", () => {
    const order = ["a", "b"];
    const removed = world(creature("b"));
    expect(reconcileCourtyardOrder(removed, order)).toBe(order);
    expect(courtyardsOf(removed, order, now)).toMatchObject([
      { kind: "vacant", slug: "a", index: 0, address: "Court 1" },
      { kind: "occupied", slug: "b", index: 1, address: "Court 2" },
    ]);
    expect(courtyardsOf(world(creature("b"), creature("a")), order, now)[0]).toMatchObject({
      kind: "occupied",
      slug: "a",
      index: 0,
      address: "Court 1",
    });
  });

  it("repairs duplicate saved addresses and includes arrivals omitted by a stale order", () => {
    const habitat = world(creature("a"), creature("b"));
    expect(reconcileCourtyardOrder(habitat, ["a", "a"])).toEqual(["a", "b"]);
    expect(courtyardsOf(habitat, ["a"], now).map((court) => court.slug)).toEqual(["a", "b"]);
  });

  it("bounds retained addresses without silently evicting a creature or reusing its place", () => {
    const order = Array.from({ length: courtyardCapacity }, (_, index) => `past-${index}`);
    expect(reconcileCourtyardOrder(emptyHabitat(), order)).toBe(order);
    expect(() => reconcileCourtyardOrder(world(creature("new")), order)).toThrow(
      CourtyardCapacityError,
    );
    expect(() => courtyardsOf(world(creature("new")), order, now)).toThrow(
      /full scene remains available/,
    );
  });
});

function world(...creatures: Creature[]): HabitatState {
  return {
    ...emptyHabitat(),
    creatures: Object.fromEntries(creatures.map((each) => [each.slug, each])),
  };
}

function creature(slug: string, at = raisedAt): Creature {
  return {
    slug,
    name: slug,
    skin: "kid",
    seed: 0,
    workshop: {
      raisedAt: at,
      parcel: undefined,
      substrate: undefined,
      health: "up",
      boardedAt: undefined,
    },
    conversation: undefined,
    chores: [],
  };
}
