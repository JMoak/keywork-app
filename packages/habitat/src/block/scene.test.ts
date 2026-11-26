import { readFile } from "node:fs/promises";
import type { BusEnvelope } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { projectAll } from "../world/project.ts";
import { emptyHabitat, type HabitatState } from "../world/types.ts";
import type { HouseSpec, Kit, MillSpec, ProjectSpec, PropSpec, WorkshopSpec } from "./kit.ts";
import { kits, neonKit } from "./kits/index.ts";
import { lotOf, reserved, workshopCell } from "./layout.ts";
import type { BlockWorld, Item } from "./model.ts";
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
            [
              ...built.cast.map((member) => member.slug),
              ...built.walkers.flatMap(walkerSlug),
            ].sort(),
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
    expect(after.world.cast.map((member) => member.slug)).not.toContain(gone);
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

  it("gives each project a building at its stage on the lot behind its creature, named by its directory", () => {
    const sites = plotProjects(7, [1, 3, 10, 30, 100, 300, 300]);
    const big = sites.map((site, index) => (index === 1 ? { ...site, trackedFiles: 2001 } : site));
    const built = scene(sketchTown(2), noon, { [slugOf(0)]: big });
    expect(built.raised.map((spec) => spec.stage)).toEqual([
      "shack",
      "house",
      "house",
      "tower",
      "high-rise",
      "skyscraper",
      "skyscraper",
    ]);
    expect(built.raised.map((spec) => spec.name)).toEqual([
      "project-0",
      "project-1",
      "project-2",
      "project-3",
      "project-4",
      "project-5",
      "project-6",
    ]);
    expect(built.raised.map((spec) => spec.lit)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    const lot = itemsIn(built.world, lotOf(workshopCell(0)));
    expect(lot.filter((item) => item.target?.kind === "shed").length).toBeGreaterThanOrEqual(4);
    expect(itemsIn(built.world, workshopCell(0)).some((item) => item.target?.kind === "shed")).toBe(
      false,
    );
  });
});

interface Recorded {
  readonly world: BlockWorld;
  readonly workshops: Record<string, WorkshopSpec | undefined>;
  readonly raised: ProjectSpec[];
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
  const raised: ProjectSpec[] = [];
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
    project: (spec) => {
      raised.push(spec);
      return neonKit.project(spec);
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
  return { world, workshops, raised, house, mill, props };
}

function itemsIn(
  world: BlockWorld,
  address: { readonly cx: number; readonly cz: number },
): readonly Item[] {
  return world.cells.find((cell) => cell.cx === address.cx && cell.cz === address.cz)?.items ?? [];
}

function targets(world: BlockWorld, kind: "workshop"): string[] {
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
  return world.cast.find((member) => member.slug === slug)?.stands.cell;
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
