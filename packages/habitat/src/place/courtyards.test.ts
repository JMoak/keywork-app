import { describe, expect, it } from "vitest";
import { creatureReading } from "../creature/semantic.ts";
import {
  type Creature,
  emptyHabitat,
  emptyThread,
  type HabitatState,
  type HeldChore,
} from "../world/types.ts";
import {
  CourtyardCapacityError,
  courtyardCapacity,
  courtyardsOf,
  reconcileCourtyardOrder,
} from "./index.ts";

const raisedAt = "2026-11-05T12:00:00.000Z";
const now = Date.parse(raisedAt);

describe("courtyard addresses", () => {
  it("leaves an empty place empty and preserves unchanged order references", () => {
    const order: readonly string[] = [];
    expect(reconcileCourtyardOrder(emptyHabitat(), order)).toBe(order);
    expect(courtyardsOf(emptyHabitat(), order, now)).toEqual([]);
    const established = ["a", "b"];
    expect(reconcileCourtyardOrder(world(creature("b"), creature("a")), established)).toBe(
      established,
    );
  });

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

  it("retains a thousand unique addresses through growth, record reordering and removal", () => {
    const residents = Array.from({ length: 1000 }, (_, index) =>
      creature(`resident-${String(index).padStart(4, "0")}`),
    );
    const order = reconcileCourtyardOrder(world(...residents), []);
    const reversed = world(...residents.toReversed());
    expect(reconcileCourtyardOrder(reversed, order)).toBe(order);
    const changed = world(...residents.filter((_, index) => index % 2 === 0), creature("new"));
    const cells = courtyardsOf(changed, order, now);
    expect(cells).toHaveLength(1001);
    expect(new Set(cells.map((court) => court.address)).size).toBe(1001);
    expect(cells.filter((court) => court.kind === "vacant")).toHaveLength(500);
    expect(cells.at(-1)).toMatchObject({ slug: "new", index: 1000, address: "Court 1001" });
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

describe("courtyard readings", () => {
  it("reads the unchanged whole world, including children and cross-parcel threads", () => {
    const parent = {
      ...emptyThread("parent", raisedAt),
      creature: "a",
      children: ["child"],
    };
    const child = {
      ...emptyThread("child", raisedAt),
      kind: "child" as const,
      parent: "parent",
      creature: undefined,
      asks: { call: { callId: "call", tool: "bash", subject: "run", askedAt: raisedAt } },
    };
    const habitat = { ...world(creature("a")), threads: { parent, child } };
    const court = courtyardsOf(habitat, [], now)[0];
    expect(court?.kind).toBe("occupied");
    if (court?.kind !== "occupied") throw new Error("Missing occupied courtyard");
    expect(court.reading).toEqual(creatureReading(habitat, "a", now));
    expect(court.reading.state).toBe("porch");
    expect(court.reading.carrier?.thread).toBe("child");
    expect(habitat.threads).toEqual({ parent, child });
  });

  it("keeps held chores and decisions at the porch, matching the detailed creature", () => {
    const held: HeldChore = {
      creature: "a",
      routineId: "morning",
      need: "grants",
      reason: "Review grants",
      runId: null,
      since: raisedAt,
      digest: undefined,
    };
    const decided = {
      recordId: "decision",
      sessionId: "thread",
      creature: undefined,
      ruleClass: "read",
      tool: "read",
      at: raisedAt,
    };
    const habitat = {
      ...world(creature("a"), creature("b")),
      threads: { thread: { ...emptyThread("thread", raisedAt), creature: "b" } },
      porch: { inbox: undefined, chores: { morning: held }, decided: { decision: decided } },
    };
    expect(courtyardsOf(habitat, [], now)).toMatchObject([
      { reading: { state: "porch", chore: held } },
      { reading: { state: "porch", decided } },
    ]);
  });

  it("refreshes names, skins, seeds and semantic state without changing addresses", () => {
    const resident = {
      ...creature("a"),
      name: "New name",
      skin: "tessera",
      seed: 22,
      paused: raisedAt,
    };
    expect(courtyardsOf(world(resident), ["a"], now)[0]).toMatchObject({
      slug: "a",
      index: 0,
      address: "Court 1",
      creature: resident,
      reading: { state: "paused" },
    });
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
