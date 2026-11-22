import { afterEach, describe, expect, it, vi } from "vitest";
import * as semantic from "../creature/semantic.ts";
import { type WorkshopFamily, workshopFamilyOf } from "../place/architecture.ts";
import { placeSlots } from "../pose/pose.ts";
import type { IndexedFrame } from "../skins/atlas.ts";
import { glass, lamplight } from "../skins/legend.ts";
import * as tiles from "../skins/world/tiles.ts";
import {
  type GardenPlanting,
  gardenPlantings,
  gardenTile,
} from "../skins/world/workshops/gardens.ts";
import { workshopDesign } from "../skins/world/workshops/index.ts";
import {
  type Creature,
  emptyHabitat,
  emptyThread,
  type HabitatState,
  type Mill,
  type Parcel,
} from "../world/types.ts";
import { anchorsFor, composeStead, type Hotspot, type SteadScene, tileScale } from "./stead.ts";
import { workshopFrame } from "./workshop.ts";

const raisedAt = "2026-11-05T11:59:00.000Z";
const day = Date.UTC(2026, 10, 5, 12);
const night = Date.UTC(2026, 10, 5, 23);

afterEach(() => vi.restoreAllMocks());

describe("shared miniature and detailed workshop art", () => {
  it.each(["gable"] as const)("starts %s without unrequested activity or a garden", (family) => {
    const design = workshopDesign(family);
    const quiet = workshopFrame(family);
    expect([quiet.width, quiet.height]).toEqual([48, 28]);
    for (let y = 0; y < quiet.height; y += 1) {
      for (let x = 0; x < quiet.width; x += 1)
        expect(pixel(quiet, x, y)).toBe(x < 32 ? pixel(design.facade, x, y) : 0);
    }
    expect(pixel(quiet, design.lamp.x, design.lamp.y)).toBe(glass);
    expect(pixel(quiet, design.loft.x, design.loft.y)).toBe(glass);
    const working = workshopFrame(family, { lamps: 1, lanterns: 1 });
    expect(pixel(working, design.lamp.x, design.lamp.y)).toBe(lamplight);
    expect(pixel(working, design.loft.x, design.loft.y)).toBe(lamplight);
    expect(pixel(design.facade, design.lamp.x, design.lamp.y)).toBe(glass);
  });

  it.each(["herbs"] as const)("attaches the requested %s garden at the ground", (garden) => {
    const frame = workshopFrame("gable", { garden });
    const planting = gardenTile(garden);
    const bare = workshopFrame("gable");
    const facade = workshopDesign("gable").facade;
    expect([frame.width, frame.height]).toEqual([48, 28]);
    for (let y = 0; y < frame.height; y += 1) {
      for (let x = 0; x < facade.width; x += 1) expect(pixel(frame, x, y)).toBe(pixel(bare, x, y));
      for (let x = 0; x < planting.width; x += 1)
        expect(pixel(frame, facade.width + x, y)).toBe(
          y < frame.height - planting.height
            ? 0
            : pixel(planting, x, y - (frame.height - planting.height)),
        );
    }
  });

  it("uses authored anchors for notes, chores, crates and a boarded doorway", () => {
    const design = workshopDesign("folded");
    const noted = workshopFrame("folded", { notes: 3, chores: 2, crates: 2 });
    expect(pixel(noted, design.notes.x, design.notes.y)).toBe(pixel(tiles.benchNote, 0, 0));
    expect(pixel(noted, design.board.x, design.board.y + 1)).toBe(pixel(tiles.chalkLine, 0, 0));
    expect(pixel(noted, design.crates.x + 4, design.crates.y)).toBe(pixel(tiles.doorCrate, 0, 0));
    const boarded = workshopFrame("folded", { boarded: true });
    expect(pixel(boarded, design.door.x - 1, design.door.y + 1)).toBe(pixel(tiles.boards, 0, 0));
    expect(pixel(boarded, design.door.x - 1, design.door.y + 4)).toBe(pixel(tiles.boards, 0, 0));
    expect(pixel(boarded, design.board.x - 1, design.facade.height - tiles.plaque.height - 1)).toBe(
      pixel(tiles.plaque, 0, 0),
    );
    expect(workshopFrame("folded", { notes: 999, chores: 999, crates: 999 })).toEqual(noted);
    expect(workshopFrame("folded", { notes: -1, chores: Number.NaN, crates: Infinity })).toEqual(
      workshopFrame("folded"),
    );
  });

  it("keeps every workshop, hotspot and anchor fixed while gardens are planted and removed", () => {
    const habitat = world(creature("a"), creature("b"), creature("c"));
    const options = {
      courtSlugs: ["a", "b", "c"],
      workshops: { a: "gable", b: "cairn", c: "root" } as const,
    };
    const bare = composeStead(habitat, day, options);
    for (const garden of gardenPlantings) {
      const planted = composeStead(habitat, day, { ...options, gardens: { a: garden, b: garden } });
      expect(planted.width).toBe(bare.width);
      expect(planted.hotspots).toEqual(bare.hotspots);
      expect(planted.anchors).toEqual(bare.anchors);
      expect(planted.bitmap.indices).not.toEqual(bare.bitmap.indices);
    }
    expect(composeStead(habitat, day, { ...options, gardens: {} })).toEqual(bare);
  });

  it("ignores invalid runtime garden values and inherited customization properties", () => {
    const bare = workshopFrame("gable");
    for (const invalid of ["constructor", "toString", "__proto__", {}, null])
      expect(workshopFrame("gable", { garden: invalid as GardenPlanting })).toEqual(bare);
    expect(workshopFrame("constructor" as WorkshopFamily)).toEqual(bare);
    const habitat = world(creature("constructor"), creature("toString"));
    const options = { courtSlugs: ["constructor", "toString"], workshops: {}, gardens: {} };
    expect(Object.keys(composeStead(habitat, day, options).anchors)).toEqual([
      "constructor",
      "toString",
    ]);
    const own = composeStead(habitat, day, {
      ...options,
      workshops: { constructor: "ceramic", toString: "tidal" } as const,
      gardens: { constructor: "constructor" as GardenPlanting },
    });
    expectPainted(own, workshopSpot(own, "constructor"), workshopFrame("ceramic"));
    expect(composeStead(emptyHabitat(), day, options).anchors).toEqual({});
  });

  it.each(["root"] as const)("reuses the exact %s composite in daylight and at night", (family) => {
    const resident = creature("a");
    const chore = {
      id: "daily",
      title: "Daily",
      nextAt: undefined,
      lastRanAt: undefined,
      running: undefined,
    };
    const working = {
      ...emptyThread("working", raisedAt),
      creature: "a",
      children: ["child"],
      queued: 2,
      turn: {
        startedAt: raisedAt,
        lastProgressAt: raisedAt,
        tool: undefined,
        stumbledAt: undefined,
      },
    };
    const habitat = {
      ...world({ ...resident, chores: [chore] }),
      threads: {
        working,
        child: { ...working, id: "child", kind: "child" as const, parent: "working", children: [] },
      },
    };
    for (const now of [day, night]) {
      const scene = composeStead(habitat, now, {
        courtSlugs: ["a"],
        workshops: { a: family },
        gardens: { a: "herbs" },
      });
      const reading = scene.readings.a;
      const miniature = workshopFrame(family, { ...reading, chores: 1, garden: "herbs" });
      const spot = workshopSpot(scene, "a");
      expect([spot.width, spot.height]).toEqual([
        miniature.width * tileScale,
        miniature.height * tileScale,
      ]);
      expectPainted(scene, spot, miniature);
      const design = workshopDesign(family);
      const anchors = anchorsFor(scene, "a");
      expect(anchors[placeSlots.door]).toBe(
        spot.x + (design.door.x + design.door.width / 2) * tileScale,
      );
      expect(anchors[placeSlots.board]).toBe(spot.x + (design.board.x + 1) * tileScale);
    }
  });
});

describe("bounded district scenes", () => {
  it("keeps sixteen selected workshops bounded as the world grows from twenty to a thousand", () => {
    const reading = vi.spyOn(semantic, "creatureReading");
    const widths: number[] = [];
    for (const count of [20, 100, 1000]) {
      const residents = Array.from({ length: count }, (_, index) => creature(`resident-${index}`));
      const habitat = world(...residents);
      const selected = residents.slice(0, 16).map((resident) => resident.slug);
      const workshops = Object.fromEntries(
        selected.map((slug, index) => [slug, workshopFamilyOf(index)]),
      );
      reading.mockClear();
      const scene = composeStead(habitat, day, { courtSlugs: selected, workshops });
      widths.push(scene.width);
      expect(Object.keys(scene.anchors)).toEqual(selected);
      expect(Object.keys(scene.readings)).toEqual(selected);
      expect(reading.mock.calls.map(([, slug]) => slug)).toEqual(selected);
      expect(reading.mock.calls.every(([state]) => state === habitat)).toBe(true);
      expect(scene.hotspots.filter((spot) => spot.target.kind === "workshop")).toHaveLength(16);
      expect(scene.width).toBeLessThan(3000);
    }
    expect(new Set(widths).size).toBe(1);
  });

  it("preserves selected order and ignores vacancies and duplicate selections", () => {
    const habitat = world(creature("a"), creature("b"), creature("c"));
    const scene = composeStead(habitat, day, { courtSlugs: ["c", "missing", "a", "c"] });
    expect(Object.keys(scene.anchors)).toEqual(["c", "a"]);
    expect(Object.keys(scene.readings)).toEqual(["c", "a"]);
    expect(workshopSpot(scene, "c").x).toBeLessThan(workshopSpot(scene, "a").x);
    expect(composeStead(habitat, day, { courtSlugs: [] }).anchors).toEqual({});
    expect(() =>
      composeStead(habitat, day, {
        courtSlugs: Array.from({ length: 17 }, (_, index) => `${index}`),
      }),
    ).toThrow(/up to 16/);
  });

  it("preserves full-world child readings and global porch activity outside the district", () => {
    const parent = {
      ...emptyThread("parent", raisedAt),
      creature: "a",
      children: ["child"],
    };
    const child = {
      ...emptyThread("child", raisedAt),
      creature: "b",
      kind: "child" as const,
      parent: "parent",
      turn: {
        startedAt: raisedAt,
        lastProgressAt: raisedAt,
        tool: undefined,
        stumbledAt: undefined,
      },
      asks: { call: { callId: "call", tool: "bash", subject: "run", askedAt: raisedAt } },
    };
    const habitat = { ...world(creature("a"), creature("b")), threads: { parent, child } };
    const scene = composeStead(habitat, day, { courtSlugs: ["a"], workshops: { a: "cairn" } });
    expect(scene.readings.a).toMatchObject({
      state: "porch",
      lanterns: 1,
      carrier: { thread: "child" },
    });
    expect(scene.readings.b).toBeUndefined();
    const hiddenOnly = { ...habitat, threads: { child: { ...child, parent: undefined } } };
    const folded = composeStead(hiddenOnly, day, { courtSlugs: ["a"] });
    expect(folded.readings.a?.state).toBe("idle");
    expect(folded.bitmap.indices).toContain(11);
    expect(Object.keys(habitat.creatures)).toEqual(["a", "b"]);
  });

  it("keeps global house lighting and storage counts while condensing storehouse artwork", () => {
    const residents = Array.from({ length: 1000 }, (_, index) => ({
      ...creature(`resident-${index}`),
      workshop: { ...creature(`resident-${index}`).workshop, parcel: `parcel-${index}` },
    }));
    const active = {
      ...emptyThread("hidden", raisedAt),
      creature: "resident-999",
      turn: {
        startedAt: raisedAt,
        lastProgressAt: raisedAt,
        tool: undefined,
        stumbledAt: undefined,
      },
    };
    const habitat = {
      ...world(...residents),
      threads: { hidden: active },
      parcels: Object.fromEntries(
        residents.map((_, index) => [`parcel-${index}`, parcel(`parcel-${index}`)]),
      ),
      storehouse: { ...emptyHabitat().storehouse, wings: 3 },
    };
    const selected = residents.slice(0, 16).map((resident) => resident.slug);
    const scene = composeStead(habitat, night, { courtSlugs: selected });
    const quiet = composeStead({ ...habitat, threads: {} }, night, { courtSlugs: selected });
    expect(scene.hotspots.filter((spot) => spot.target.kind === "parcel")).toHaveLength(4);
    expect(
      scene.hotspots.some(
        (spot) => spot.target.kind === "parcel" && spot.target.parcel === "parcel-999",
      ),
    ).toBe(false);
    expect(scene.hotspots.find((spot) => spot.target.kind === "storehouse")?.width).toBe(
      tiles.storehouse.width * tileScale,
    );
    expect(scene.infrastructure).toMatchObject({
      storehouseWings: 3,
      shownStorehouseWings: 1,
      totalParcels: 1000,
      shownParcels: 4,
    });
    expect(scene.bitmap.indices.filter((index) => index === lamplight).length).toBeGreaterThan(
      quiet.bitmap.indices.filter((index) => index === lamplight).length,
    );
    expect(scene.width).toBeLessThan(5000);
  });

  it("bounds scene allocation with ten thousand wings and mills across selected parcels", () => {
    const residents = Array.from({ length: 16 }, (_, index) => ({
      ...creature(`resident-${index}`),
      workshop: { ...creature(`resident-${index}`).workshop, parcel: `parcel-${index % 4}` },
    }));
    const courtSlugs = residents.map((resident) => resident.slug);
    const workshops = Object.fromEntries(
      courtSlugs.map((slug, index) => [slug, workshopFamilyOf(index)]),
    );
    const gardens = Object.fromEntries(courtSlugs.map((slug) => [slug, "herbs" as const]));
    const widths: number[] = [];
    for (const count of [2, 1000, 10000]) {
      const mills = Array.from({ length: count }, (_, index) =>
        mill(`mill-${index}`, `parcel-${index % 4}`),
      );
      const habitat = {
        ...world(...residents),
        parcels: Object.fromEntries(
          Array.from({ length: 4 }, (_, index) => [`parcel-${index}`, parcel(`parcel-${index}`)]),
        ),
        mills: Object.fromEntries(mills.map((mill) => [mill.id, mill])),
        storehouse: { ...emptyHabitat().storehouse, wings: count },
        landmarks: [
          {
            kind: "tree" as const,
            creature: undefined,
            at: "2025-01-01T00:00:00.000Z",
            evidence: "tree",
          },
          { kind: "lantern-post" as const, creature: undefined, at: raisedAt, evidence: "post" },
        ],
      };
      const scene = composeStead(habitat, night, { courtSlugs, workshops, gardens });
      widths.push(scene.width);
      expect(scene.width).toBe(4308);
      expect(scene.bitmap.indices.byteLength).toBe(310176);
      expect(scene.hotspots.filter((spot) => spot.target.kind === "mill")).toHaveLength(2);
      expect(scene.infrastructure).toEqual({
        storehouseWings: count,
        shownStorehouseWings: 1,
        storehouseShelves: 0,
        totalMills: count,
        shownMills: 2,
        busyMills: 0,
        loadedMills: 0,
        totalParcels: 4,
        shownParcels: 4,
      });
      expect(Object.keys(habitat.mills)).toHaveLength(count);
      expect(habitat.storehouse.wings).toBe(count);
    }
    expect(new Set(widths).size).toBe(1);
  });

  it("prioritizes busy and loaded mills while retaining their complete status counts", () => {
    const habitat = {
      ...world(creature("a")),
      mills: {
        idle: mill("idle", "local"),
        loaded: { ...mill("loaded", "local"), loaded: ["model"] },
        busy: { ...mill("busy", "local"), busy: true },
        other: mill("other", "local"),
      },
    };
    const scene = composeStead(habitat, day, { courtSlugs: ["a"] });
    expect(
      scene.hotspots.flatMap((spot) => (spot.target.kind === "mill" ? [spot.target.mill] : [])),
    ).toEqual(["busy", "loaded"]);
    expect(scene.infrastructure).toMatchObject({
      totalMills: 4,
      shownMills: 2,
      busyMills: 1,
      loadedMills: 1,
    });
    const legacy = composeStead(
      { ...habitat, storehouse: { ...habitat.storehouse, wings: 3 } },
      day,
    );
    expect(legacy.hotspots.filter((spot) => spot.target.kind === "mill")).toHaveLength(4);
    expect(legacy.hotspots.find((spot) => spot.target.kind === "storehouse")?.width).toBe(
      tiles.storehouse.width * tileScale * 3,
    );
    expect(legacy.infrastructure).toBeUndefined();
  });
});

function pixel(frame: IndexedFrame, x: number, y: number): number | undefined {
  return frame.indices[y * frame.width + x];
}

function workshopSpot(scene: SteadScene, slug: string): Hotspot {
  const spot = scene.hotspots.find(
    (spot) => spot.target.kind === "workshop" && spot.target.creature === slug,
  );
  if (spot === undefined) throw new Error(`Missing workshop for ${slug}`);
  return spot;
}

function expectPainted(scene: SteadScene, spot: Hotspot, frame: IndexedFrame): void {
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = pixel(frame, x, y);
      if (index === 0) continue;
      for (let dy = 0; dy < tileScale; dy += 1) {
        for (let dx = 0; dx < tileScale; dx += 1)
          expect(
            pixel(scene.bitmap, spot.x + x * tileScale + dx, spot.y + y * tileScale + dy),
          ).toBe(index);
      }
    }
  }
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

function parcel(id: string): Parcel {
  return {
    id,
    name: id,
    roles: ["host"],
    online: true,
    path: "direct",
    fencedAt: raisedAt,
    seenAt: raisedAt,
  };
}

function mill(id: string, parcel: string): Mill {
  return { id, parcel, name: id, loaded: [], busy: false, builtAt: raisedAt };
}
