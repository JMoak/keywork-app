import { describe, expect, it } from "vitest";
import { minute } from "../clock/clock.ts";
import { emptyThread, type HabitatState, type Thread } from "../world/types.ts";
import { type Leisure, leisureMemory, seatedAt } from "./green.ts";
import type { PropSpec } from "./kit.ts";
import { neonKit } from "./kits/index.ts";
import { reserved, workshopCell } from "./layout.ts";
import type { BlockWorld } from "./model.ts";
import { blockScene, type ProjectSite } from "./scene.ts";
import { noon, sketchTown, slugOf } from "./testing.ts";

const worker = slugOf(0);
const asker = slugOf(1);
const other = slugOf(3);

describe("the council on the green", () => {
  it("sits exactly while two or more creatures work in one folder, lamp lit, and leaves a creature with a question at the porch", () => {
    const alone = town({ projects: { [worker]: [lamps(true)], [other]: [lamps(false)] } });
    expect(seatedAt(alone.world, "council")).toEqual([]);
    expect(alone.lampLit).toBe(false);

    const apart = town({ projects: { [worker]: [lamps(true)], [other]: [orchard(true)] } });
    expect(seatedAt(apart.world, "council")).toEqual([]);
    expect(apart.lampLit).toBe(false);

    const together = town({
      projects: { [worker]: [lamps(true)], [other]: [orchard(false), lamps(true)] },
    });
    expect(seatedAt(together.world, "council")).toEqual([worker, other]);
    expect(standsOn(together.world, worker)).toEqual(reserved.green);
    expect(standsOn(together.world, other)).toEqual(reserved.green);
    expect(together.lampLit).toBe(true);

    const asking = town({
      projects: { [worker]: [lamps(true)], [asker]: [lamps(true)], [other]: [lamps(true)] },
    });
    expect(seatedAt(asking.world, "council")).toEqual([worker, other]);
    expect(standsOn(asking.world, asker)).toEqual(reserved.house);

    const risen = town({ projects: { [worker]: [lamps(true)], [other]: [lamps(false)] } });
    expect(risen.lampLit).toBe(false);
    expect(standsOn(risen.world, worker)).toEqual(workshopCell(0));
    expect(standsOn(risen.world, other)).toEqual(workshopCell(3));
  });

  it("gathers the idle only after all have been idle two minutes, lamp unlit, lets one leave for work while the rest stay, and sends the last one home", () => {
    const [first, second, third] = [slugOf(0), slugOf(1), slugOf(2)];
    const leisure = leisureMemory();
    const idle = withThreads(nobodyBusy(3), [resting(second, noon - minute)]);

    const tooSoon = town({ state: idle, now: noon, leisure });
    expect(seatedAt(tooSoon.world, "ease")).toEqual([]);

    const gathered = town({ state: idle, now: noon + minute, leisure });
    expect(seatedAt(gathered.world, "ease")).toEqual([first, second, third]);
    expect(standsOn(gathered.world, second)).toEqual(reserved.green);
    expect(gathered.lampLit).toBe(false);

    const oneAtWork = withThreads(idle, [working(first, noon + minute)]);
    const stayed = town({ state: oneAtWork, now: noon + 2 * minute, leisure });
    expect(seatedAt(stayed.world, "ease")).toEqual([second, third]);
    expect(standsOn(stayed.world, first)).toEqual(workshopCell(0));
    expect(stayed.lampLit).toBe(false);

    const twoAtWork = withThreads(oneAtWork, [working(second, noon + 2 * minute)]);
    const alone = town({ state: twoAtWork, now: noon + 3 * minute, leisure });
    expect(seatedAt(alone.world, "ease")).toEqual([]);
    expect(standsOn(alone.world, third)).toEqual(workshopCell(2));

    const notAllIdle = town({ state: oneAtWork, now: noon + 9 * minute, leisure });
    expect(seatedAt(notAllIdle.world, "ease")).toEqual([]);
  });
});

interface Told {
  readonly state?: HabitatState;
  readonly now?: number;
  readonly projects?: Record<string, readonly ProjectSite[]>;
  readonly leisure?: Leisure;
}

function town({ state = sketchTown(5), now = noon, projects = {}, leisure }: Told): {
  world: BlockWorld;
  lampLit: boolean | undefined;
} {
  const props: PropSpec[] = [];
  const kit = {
    ...neonKit,
    prop: (spec: PropSpec) => {
      props.push(spec);
      return neonKit.prop(spec);
    },
  };
  const world = blockScene(state, { kit, appearance: "night", now, projects, leisure }).world;
  const council = props.find((spec) => spec.kind === "council");
  return { world, lampLit: council?.kind === "council" ? council.lit : undefined };
}

function nobodyBusy(count: number): HabitatState {
  return { ...sketchTown(count), threads: {} };
}

function withThreads(state: HabitatState, threads: readonly Thread[]): HabitatState {
  return {
    ...state,
    threads: { ...state.threads, ...Object.fromEntries(threads.map((each) => [each.id, each])) },
  };
}

function resting(creature: string, since: number): Thread {
  return { ...emptyThread(`${creature}-rest`, iso(since)), creature };
}

function working(creature: string, since: number): Thread {
  return {
    ...emptyThread(`${creature}-work`, iso(since)),
    creature,
    turn: {
      startedAt: iso(since),
      lastProgressAt: iso(since),
      tool: undefined,
      stumbledAt: undefined,
    },
  };
}

function lamps(lit: boolean): ProjectSite {
  return { id: "/work/lamps", floors: 1, lit };
}

function orchard(lit: boolean): ProjectSite {
  return { id: "/work/orchard", floors: 1, lit };
}

function standsOn(world: BlockWorld, slug: string): { cx: number; cz: number } | undefined {
  return world.cast.find((member) => member.slug === slug)?.stands.cell;
}

function iso(at: number): string {
  return new Date(at).toISOString();
}
