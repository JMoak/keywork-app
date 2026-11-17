import { afterEach, describe, expect, it, vi } from "vitest";
import * as semantic from "../creature/semantic.ts";
import { type Creature, emptyHabitat, emptyThread, type HabitatState } from "../world/types.ts";
import { workshopFamilyOf } from "./architecture.ts";
import {
  CourtyardCapacityError,
  courtyardCapacity,
  courtyardsInRange,
  reconcileCourtyardOrder,
} from "./index.ts";
import {
  courtyardDistrictAt,
  courtyardDistricts,
  districtCapacity,
  districtOfCourt,
} from "./settlement.ts";

const raisedAt = "2026-11-05T12:00:00.000Z";
const now = Date.parse(raisedAt);

afterEach(() => vi.restoreAllMocks());

describe("growing courtyard districts", () => {
  it("starts empty and opens another district only when its first court arrives", () => {
    expect(courtyardDistricts([])).toEqual([]);
    expect(courtyardDistrictAt([], 0)).toBeUndefined();
    const order = addresses(17);
    expect(courtyardDistricts(order)).toEqual([
      { index: 0, start: 0, end: 16, address: "District 1", slugs: order.slice(0, 16) },
      { index: 1, start: 16, end: 17, address: "District 2", slugs: order.slice(16) },
    ]);
    expect(courtyardDistricts(order.slice(0, 16))).toHaveLength(1);
  });

  it("grows through a thousand residents without moving an established district or style", () => {
    const residents = addresses(1000).map(creature);
    const habitat = world(...residents);
    const order = reconcileCourtyardOrder(habitat, []);
    const districts = courtyardDistricts(order);
    const expanded = reconcileCourtyardOrder(
      world(creature("new"), ...residents.toReversed()),
      order,
    );
    const grown = courtyardDistricts(expanded);
    expect(districts).toHaveLength(63);
    expect(districts.at(-1)?.slugs).toHaveLength(8);
    expect(grown.slice(0, -1)).toEqual(districts.slice(0, -1));
    expect(grown.at(-1)?.slugs).toEqual([...order.slice(992), "new"]);
    for (const [index, slug] of order.entries()) {
      const district = courtyardDistrictAt(expanded, districtOfCourt(index));
      expect(district?.slugs[index % districtCapacity]).toBe(slug);
      expect(workshopFamilyOf(expanded.indexOf(slug))).toBe(workshopFamilyOf(index));
    }
    expect(order).toHaveLength(1000);
  });

  it("reserves vacancies across district boundaries and restores each returning address", () => {
    const residents = addresses(33).map(creature);
    const order = reconcileCourtyardOrder(world(...residents), []);
    const missing = new Set([order[0], order[15], order[16], order[32]]);
    const remaining = world(...residents.filter((resident) => !missing.has(resident.slug)));
    const reserved = reconcileCourtyardOrder(remaining, order);
    expect(courtyardDistricts(reserved)).toEqual(courtyardDistricts(order));
    const second = courtyardDistrictAt(reserved, 1);
    if (second === undefined) throw new Error("Missing district");
    expect(courtyardsInRange(remaining, reserved, now, second)[0]).toMatchObject({
      kind: "vacant",
      index: 16,
      address: "Court 17",
    });
    const returned = world(...residents.toReversed());
    expect(reconcileCourtyardOrder(returned, reserved)).toBe(order);
    expect(courtyardsInRange(returned, reserved, now, second)[0]).toMatchObject({
      kind: "occupied",
      index: 16,
      address: "Court 17",
    });
  });

  it("bounds every district at sixteen courts through the retained-address ceiling", () => {
    const order = addresses(courtyardCapacity);
    const districts = courtyardDistricts(order);
    expect(districts).toHaveLength(256);
    expect(districts.every((district) => district.slugs.length === districtCapacity)).toBe(true);
    expect(districts.flatMap((district) => district.slugs)).toEqual(order);
    expect(courtyardDistrictAt(order, 255)).toEqual(districts[255]);
    expect(courtyardDistrictAt(order, 256)).toBeUndefined();
    expect(() => courtyardDistricts([...order, "overflow"])).toThrow(CourtyardCapacityError);
    expect(() => courtyardDistrictAt([...order, "overflow"], 0)).toThrow(CourtyardCapacityError);
  });

  it("resolves boundary addresses without inventing an unavailable district", () => {
    expect([0, 15, 16, 31, 32, 4095].map(districtOfCourt)).toEqual([0, 0, 1, 1, 2, 255]);
    for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, courtyardCapacity])
      expect(() => districtOfCourt(invalid)).toThrow(RangeError);
    for (const invalid of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2])
      expect(courtyardDistrictAt(addresses(17), invalid)).toBeUndefined();
  });
});

describe("bounded court readings", () => {
  it("reads only the selected district while retaining permanent address indices", () => {
    const order = addresses(1000);
    const habitat = world(...order.map(creature));
    const reading = vi.spyOn(semantic, "creatureReading");
    const district = courtyardDistrictAt(order, 31);
    if (district === undefined) throw new Error("Missing district");
    const courts = courtyardsInRange(habitat, order, now, district);
    expect(courts).toHaveLength(16);
    expect(courts[0]).toMatchObject({ index: 496, address: "Court 497", slug: order[496] });
    expect(courts.at(-1)).toMatchObject({ index: 511, address: "Court 512", slug: order[511] });
    expect(reading.mock.calls.map(([, slug]) => slug)).toEqual(order.slice(496, 512));
    expect(reading.mock.calls.every(([state]) => state === habitat)).toBe(true);
  });

  it("keeps cross-district children and held decisions authoritative", () => {
    const order = addresses(17);
    const first = order[0] as string;
    const last = order[16] as string;
    const parent = { ...emptyThread("parent", raisedAt), creature: last, children: ["child"] };
    const child = {
      ...emptyThread("child", raisedAt),
      kind: "child" as const,
      parent: "parent",
      creature: first,
      asks: { call: { callId: "call", tool: "bash", subject: "run", askedAt: raisedAt } },
    };
    const habitat = {
      ...world(...order.map(creature)),
      threads: { parent, child },
    };
    const courts = courtyardsInRange(habitat, order, now, { start: 16, end: 17 });
    expect(courts).toMatchObject([
      { slug: last, reading: { state: "porch", carrier: { thread: "child", asks: 1 } } },
    ]);
    const decision = {
      recordId: "decision",
      sessionId: "parent",
      creature: undefined,
      ruleClass: "read",
      tool: "read",
      at: raisedAt,
    };
    const decided = {
      ...habitat,
      threads: { parent: { ...parent, children: [] } },
      porch: { ...habitat.porch, decided: { decision } },
    };
    expect(courtyardsInRange(decided, order, now, { start: 16, end: 17 })).toMatchObject([
      { reading: { state: "porch", decided: decision } },
    ]);
    expect(habitat.threads.child).toBe(child);
    expect(habitat.creatures).toHaveProperty(first);
  });

  it("reconciles stale saved orders before reading a new district", () => {
    const old = addresses(16);
    const habitat = world(...old.map(creature), creature("new"));
    expect(courtyardsInRange(habitat, old, now, { start: 16, end: 32 })).toMatchObject([
      { slug: "new", index: 16, address: "Court 17" },
    ]);
    expect(courtyardsInRange(habitat, old, now, { start: 32, end: 48 })).toEqual([]);
    expect(courtyardsInRange(habitat, old, now, { start: 0, end: 0 })).toEqual([]);
    expect(old).toHaveLength(16);
  });

  it("rejects malformed ranges without quietly reading a different court", () => {
    for (const range of [
      { start: -1, end: 1 },
      { start: 0.5, end: 1 },
      { start: 2, end: 1 },
      { start: 0, end: Number.NaN },
      { start: 0, end: Number.POSITIVE_INFINITY },
      { start: 0, end: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(() => courtyardsInRange(emptyHabitat(), [], now, range)).toThrow(RangeError);
  });
});

function addresses(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `resident-${String(index).padStart(4, "0")}`);
}

function world(...creatures: Creature[]): HabitatState {
  return {
    ...emptyHabitat(),
    creatures: Object.fromEntries(creatures.map((resident) => [resident.slug, resident])),
  };
}

function creature(slug: string): Creature {
  return {
    slug,
    name: slug,
    skin: "kid",
    seed: 0,
    workshop: {
      raisedAt,
      parcel: undefined,
      substrate: undefined,
      health: "up",
      boardedAt: undefined,
    },
    conversation: undefined,
    chores: [],
  };
}
