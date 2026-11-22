import { readFile } from "node:fs/promises";
import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { projectAll } from "../world/project.ts";
import { emptyHabitat, type HabitatState } from "../world/types.ts";
import type { HouseSpec, Kit, MillSpec, PropSpec, ShedSpec, WorkshopSpec } from "./kit.ts";
import { kits, lanternKit, neonKit } from "./kits/index.ts";
import { greenSpots, monumentFor, reserved, restsOnTheGreen, workshopCell } from "./layout.ts";
import { type BlockWorld, cellPitch, type Item } from "./model.ts";
import { blockScene, type ProjectSite, wallsAround } from "./scene.ts";
import { noon, plotProjects, sketchCreature, sketchTown, slugOf } from "./testing.ts";

const whileAsking = Date.parse("2026-11-06T06:23:10.000Z");
const afterTheTurn = Date.parse("2026-11-06T06:24:10.000Z");

describe("the block world as a reading of the habitat", () => {
  it("follows bea through first light: a lamp while she works, the bell while she asks, the crate she carries when back", async () => {
    const stream = await recorded("first-light");
    const upTo = (id: number): HabitatState =>
      projectAll(
        emptyHabitat(),
        stream.filter((envelope) => envelope.id <= id),
      );

    const working = scene(upTo(3), whileAsking);
    expect(working.workshops.bea).toMatchObject({ lit: true, boarded: false });
    expect(working.house?.ringing).toBe(false);
    expect(figureCell(working.world, "bea")).toEqual(workshopCell(0));

    const asking = scene(upTo(5), whileAsking);
    expect(asking.house?.ringing).toBe(true);
    expect(figureCell(asking.world, "bea")).toEqual(reserved.house);

    const back = scene(upTo(13), afterTheTurn);
    expect(back.workshops.bea).toMatchObject({ lit: false });
    expect(back.world.walkers.map((walker) => walker.target)).toEqual([
      { kind: "creature", creature: "bea" },
    ]);
    expect(itemsIn(back.world, workshopCell(0)).filter((item) => item.what === "crate")).toEqual(
      [],
    );
  });

  it("builds a world at every moment of every recorded run, one workshop and one creature each", async () => {
    for (const name of ["first-light", "first-light-run-2", "first-light-run-4"]) {
      const stream = await recorded(name);
      for (let upTo = 0; upTo <= stream.length; upTo += 1) {
        const state = projectAll(emptyHabitat(), stream.slice(0, upTo));
        const at = Date.parse(stream[Math.max(0, upTo - 1)]?.ts ?? "2026-11-06T06:00:00.000Z");
        for (const kit of kits) {
          const built = blockScene(state, { kit, appearance: "night", now: at }).world;
          const slugs = Object.keys(state.creatures).sort();
          expect(targets(built, "workshop").sort(), `${name} after ${upTo}`).toEqual(slugs);
          expect(
            [...targets(built, "creature"), ...built.walkers.flatMap(walkerSlug)].sort(),
            `${name} after ${upTo}`,
          ).toEqual(slugs);
        }
      }
    }
  });

  it("reads storeys, shelf, lanterns, chores, crates and ivy from what each creature has done", () => {
    const built = scene(sketchTown(16), noon);
    for (let index = 0; index < 16; index += 1) {
      const traits = sketchCreature(index);
      const spec = built.workshops[slugOf(index)];
      expect(spec, slugOf(index)).toMatchObject({
        delivered: traits.shelf,
        storeys: 1 + (traits.shelf >= 3 ? 1 : 0) + (traits.shelf >= 6 ? 1 : 0),
        gates: traits.lanterns,
        chores: traits.chores,
        ivy: traits.ivy,
        lit: traits.state === "work" || traits.state === "walk",
      });
      const crates = itemsIn(built.world, workshopCell(index)).filter(
        (item) => item.what === "crate",
      );
      expect(crates.length, slugOf(index)).toBe(traits.crates);
    }
    expect(built.workshops[slugOf(0)]?.walls).toEqual(wallsAround("pz"));
    expect(built.workshops[slugOf(2)]?.walls).toEqual(wallsAround("nz"));
  });

  it("boards up a deleted creature's workshop where it stood and shows no creature for it", () => {
    const town = sketchTown(3);
    const gone = slugOf(0);
    const held = town.creatures[gone];
    if (held === undefined) throw new Error("the town has no first creature");
    const boarded: HabitatState = {
      ...town,
      creatures: {
        ...town.creatures,
        [gone]: { ...held, workshop: { ...held.workshop, boardedAt: "2026-11-22T10:00:00.000Z" } },
      },
    };
    const before = scene(town, noon);
    const after = scene(boarded, noon);
    expect(after.workshops[gone]).toMatchObject({ boarded: true, lit: false });
    expect(targets(after.world, "creature")).not.toContain(gone);
    expect(workshopItem(after.world, gone)?.x).toBe(workshopItem(before.world, gone)?.x);
  });

  it("turns the mill's sails while a model is loaded, faster while busy, only on the house land", () => {
    const town = sketchTown(5);
    const mill = town.mills.mill;
    if (mill === undefined) throw new Error("the town has no mill");
    const withMill = (change: Partial<typeof mill>): HabitatState => ({
      ...town,
      mills: { mill: { ...mill, ...change } },
    });
    expect(scene(withMill({ busy: true }), noon).mill?.turning).toBe("quick");
    expect(scene(withMill({ busy: false }), noon).mill?.turning).toBe("drift");
    expect(scene(withMill({ loaded: [], busy: false }), noon).mill?.turning).toBe("still");
    expect(scene(withMill({ parcel: "elsewhere" }), noon).mill).toBeUndefined();
  });

  it("lights the house and its smoke by night, as the theme's night says", () => {
    const night = scene(sketchTown(5), noon, {}, "night");
    const day = scene(sketchTown(5), noon, {}, "day");
    expect(night.house).toMatchObject({ lit: true, smoke: true, night: true });
    expect(day.house).toMatchObject({ lit: false, smoke: false, night: false });
  });

  it("gives each project a building with its floors, stacking the last two as the sketch does", () => {
    const projects: Record<string, readonly ProjectSite[]> = {
      [slugOf(0)]: plotProjects(7, [1, 3, 8, 20, 1, 1, 1]),
    };
    const built = scene(sketchTown(2), noon, projects);
    expect(built.sheds.map((spec) => spec.floors)).toEqual([1, 3, 8, 20, 1, 1, 1]);
    expect(built.sheds.map((spec) => spec.roofed)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
      true,
    ]);
    expect(built.sheds.map((spec) => spec.spot.y0)).toEqual([0, 0, 0, 0, 0, 12, 12]);
  });

  it("carries each project's tracked files into its building's spec without drawing from it", () => {
    const counted: Record<string, readonly ProjectSite[]> = {
      [slugOf(0)]: [
        { id: "/work/lamps", floors: 2, lit: true, conversations: 4, trackedFiles: 812 },
        { id: "/work/notes", floors: 1, lit: false, conversations: 1, trackedFiles: undefined },
      ],
    };
    const uncounted: Record<string, readonly ProjectSite[]> = {
      [slugOf(0)]: (counted[slugOf(0)] ?? []).map((site) => ({ ...site, trackedFiles: 3 })),
    };
    const built = scene(sketchTown(2), noon, counted);
    expect(built.sheds.map((spec) => spec.trackedFiles)).toEqual([812, undefined]);
    const quads = (projects: Record<string, readonly ProjectSite[]>) =>
      JSON.stringify(scene(sketchTown(2), noon, projects).world.cells);
    expect(quads(uncounted)).toBe(quads(counted));
  });

  it("rests the sketch's napping and idle cast as the sketch does: four and eight on the green, thirteen by its door", () => {
    const built = scene(sketchTown(16), noon).world;
    expect(figureCell(built, slugOf(4))).toEqual(reserved.green);
    expect(figureCell(built, slugOf(8))).toEqual(reserved.green);
    expect(figureCell(built, slugOf(13))).toEqual(workshopCell(13));
    expect(greenStanding(built).map((spot) => spot.slug)).toEqual([slugOf(4), slugOf(8)]);
    expect(greenStanding(built).map((spot) => spot.at)).toEqual(greenSpots.slice(0, 2));
  });

  it("rests every idle creature by its own door but one in four by seed, on five green spots that never overlap", () => {
    const town = sketchTown(28);
    const built = scene({ ...town, threads: {}, gates: {} }, noon).world;
    const seeds = Array.from({ length: 28 }, (_, index) => index);
    const chosen = seeds.filter(restsOnTheGreen).slice(0, greenSpots.length);
    expect(greenStanding(built).map((spot) => spot.slug)).toEqual(chosen.map(slugOf));
    expect(greenStanding(built).map((spot) => spot.at)).toEqual(greenSpots);
    for (const seed of seeds.filter((each) => !chosen.includes(each))) {
      expect(figureCell(built, slugOf(seed)), slugOf(seed)).toEqual(workshopCell(seed));
    }
    expect(new Set(greenSpots.map((spot) => `${spot.x},${spot.z}`)).size).toBe(greenSpots.length);
  });

  it("raises the green's monument by creature count: a stone from three, a gold statue from eight", () => {
    expect([0, 1, 2, 3, 7, 8, 16].map(monumentFor)).toEqual([0, 0, 0, 1, 1, 2, 2]);
  });

  it("draws decorations and the green's monument only when they are given", () => {
    const plain = scene(sketchTown(5), noon);
    expect(
      Object.values(plain.workshops).every(
        (spec) => spec?.garland === false && spec.banner === 0 && !spec.star,
      ),
    ).toBe(true);
    expect(itemsIn(plain.world, reserved.green).some((item) => item.what === "monument")).toBe(
      false,
    );
    const decorated = blockScene(sketchTown(5), {
      kit: lanternKit,
      appearance: "night",
      now: noon,
      decorations: { [slugOf(1)]: { garland: true, banner: 2, star: true } },
      monument: 2,
    });
    expect(itemsIn(decorated.world, reserved.green).some((item) => item.what === "monument")).toBe(
      true,
    );
  });
});

interface Recorded {
  readonly world: BlockWorld;
  readonly workshops: Record<string, WorkshopSpec | undefined>;
  readonly sheds: ShedSpec[];
  readonly house: HouseSpec | undefined;
  readonly mill: MillSpec | undefined;
  readonly props: PropSpec[];
}

function scene(
  state: HabitatState,
  now: number,
  projects: Record<string, readonly ProjectSite[]> = {},
  appearance: "night" | "day" = "night",
): Recorded {
  const workshops: Record<string, WorkshopSpec | undefined> = {};
  const sheds: ShedSpec[] = [];
  const props: PropSpec[] = [];
  let house: HouseSpec | undefined;
  let mill: MillSpec | undefined;
  const order = Object.values(state.creatures)
    .sort(
      (a, b) =>
        a.workshop.raisedAt.localeCompare(b.workshop.raisedAt) || a.slug.localeCompare(b.slug),
    )
    .map((creature) => creature.slug);
  let next = 0;
  const kit: Kit = {
    ...neonKit,
    workshop: (spec) => {
      workshops[order[next] ?? "?"] = spec;
      next += 1;
      return neonKit.workshop(spec);
    },
    shed: (spec) => {
      sheds.push(spec);
      return neonKit.shed(spec);
    },
    house: (spec) => {
      house = spec;
      return neonKit.house(spec);
    },
    mill: (spec) => {
      mill = spec;
      return neonKit.mill(spec);
    },
    prop: (spec) => {
      props.push(spec);
      return neonKit.prop(spec);
    },
  };
  const world = blockScene(state, { kit, appearance, now, projects }).world;
  return { world, workshops, sheds, house, mill, props };
}

function itemsIn(
  world: BlockWorld,
  address: { readonly cx: number; readonly cz: number },
): readonly Item[] {
  return world.cells.find((cell) => cell.cx === address.cx && cell.cz === address.cz)?.items ?? [];
}

function targets(world: BlockWorld, kind: "workshop" | "creature"): string[] {
  return world.cells.flatMap((cell) =>
    cell.items.flatMap((item) =>
      item.target?.kind === kind && "creature" in item.target ? [item.target.creature] : [],
    ),
  );
}

function walkerSlug(walker: BlockWorld["walkers"][number]): string[] {
  return walker.target !== undefined && "creature" in walker.target ? [walker.target.creature] : [];
}

function figureCell(world: BlockWorld, slug: string): { cx: number; cz: number } | undefined {
  const cell = world.cells.find((each) =>
    each.items.some((item) => item.target?.kind === "creature" && item.target.creature === slug),
  );
  return cell === undefined ? undefined : { cx: cell.cx, cz: cell.cz };
}

function greenStanding(world: BlockWorld): { slug: string; at: { x: number; z: number } }[] {
  const center = { x: reserved.green.cx * cellPitch, z: reserved.green.cz * cellPitch };
  return itemsIn(world, reserved.green).flatMap((item) =>
    item.target?.kind === "creature"
      ? [{ slug: item.target.creature, at: { x: item.x - center.x, z: item.z - center.z } }]
      : [],
  );
}

function workshopItem(world: BlockWorld, slug: string): Item | undefined {
  return world.cells
    .flatMap((cell) => cell.items)
    .find((item) => item.target?.kind === "workshop" && item.target.creature === slug);
}

async function recorded(name: string): Promise<BusEnvelope[]> {
  const text = await readFile(new URL(`../world/fixtures/${name}.jsonl`, import.meta.url), "utf8");
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}
