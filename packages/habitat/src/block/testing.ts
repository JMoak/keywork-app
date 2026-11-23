import { day, hour, minute } from "../clock/clock.ts";
import { mulberry32 } from "../clock/random.ts";
import {
  type Creature,
  emptyHabitat,
  emptyThread,
  type Gate,
  type HabitatState,
  type Landmark,
  type Shelf,
  type Thread,
} from "../world/types.ts";
import { critterParts, figureFor, figureNames } from "./figures.ts";
import type { Appearance, Construction, Kit, MonumentTier, ProjectStage } from "./kit.ts";
import { bearingOf } from "./kits/sketch/style.ts";
import { monumentFor } from "./layout.ts";
import {
  type BlockWorld,
  type Box,
  type Cell,
  cellCenter,
  cellPitch,
  halfCell,
  type Item,
  identityRamp,
  movedPart,
  type Part,
} from "./model.ts";
import {
  type Decoration,
  heroSlab,
  lowestReach,
  type Partnership,
  type ProjectSite,
} from "./scene.ts";

export const noon = Date.UTC(2026, 10, 22, 12, 0, 0);
export const night = Date.UTC(2026, 10, 22, 23, 0, 0);

export type SketchState = "work" | "porch" | "walk" | "nap" | "idle" | "blocked";

export const sketchStates: readonly SketchState[] = [
  "work",
  "porch",
  "walk",
  "work",
  "nap",
  "work",
  "walk",
  "work",
  "idle",
  "work",
  "blocked",
  "walk",
  "work",
  "nap",
  "work",
  "walk",
];

export const sketchForms = figureNames;

export const sketchPairs: readonly (readonly [number, number, 1 | 2 | 3])[] = [
  [0, 1, 3],
  [1, 2, 2],
  [0, 3, 2],
  [3, 4, 3],
  [2, 5, 1],
  [4, 6, 2],
  [5, 7, 3],
  [6, 8, 1],
  [7, 9, 2],
  [8, 10, 3],
  [9, 11, 1],
  [10, 12, 2],
  [11, 13, 3],
  [12, 14, 1],
  [13, 15, 2],
  [0, 5, 2],
  [3, 9, 1],
];

export interface SketchCreature {
  readonly shelf: number;
  readonly lanterns: number;
  readonly chores: number;
  readonly crates: number;
  readonly child: boolean;
  readonly form: string;
  readonly ivy: number;
  readonly state: SketchState;
}

export function slugOf(index: number): string {
  return `c${String(index).padStart(2, "0")}`;
}

export function sketchCreature(index: number): SketchCreature {
  const random = mulberry32(1000 + index * 77);
  const shelf = Math.min(6, ((random() * 4) | 0) + (index < 4 ? 3 : index < 9 ? 1 : 0));
  for (let skipped = 0; skipped < 5; skipped += 1) random();
  const lanterns = (random() * 4) | 0;
  const chores = 1 + ((random() * 3) | 0);
  const crates = (random() * 3) | 0;
  const child = random() < 0.3;
  return {
    shelf,
    lanterns,
    chores,
    crates,
    child,
    form: sketchForms[(index * 4 + (index > 8 ? 1 : 0)) % sketchForms.length] ?? "cairn",
    ivy: index < 3 ? 3 : index < 7 ? 2 : index < 11 ? 1 : 0,
    state: sketchStates[index % sketchStates.length] ?? "idle",
  };
}

export function sketchTown(count: number, at: number = noon): HabitatState {
  const base = emptyHabitat(0);
  const creatures: Record<string, Creature> = {};
  const threads: Record<string, Thread> = {};
  const gates: Record<string, Gate> = {};
  for (let index = 0; index < count; index += 1) {
    const slug = slugOf(index);
    const traits = sketchCreature(index);
    creatures[slug] = {
      slug,
      name: slug,
      skin: traits.form,
      seed: index,
      workshop: {
        raisedAt: iso(at - ageDays(traits.ivy) * day + index * minute),
        parcel: "house",
        substrate: "host",
        health: "up",
        boardedAt: undefined,
      },
      conversation: undefined,
      chores: Array.from({ length: traits.chores }, (_, chore) => ({
        id: `${slug}-chore-${chore}`,
        title: `chore ${chore}`,
        nextAt: iso(at + 14 * hour),
        lastRanAt: undefined,
        running: undefined,
      })),
    };
    for (const thread of threadsFor(slug, traits, at)) threads[thread.id] = thread;
    for (let gate = 0; gate < traits.lanterns; gate += 1) {
      const id = `${slug}-gate-${gate}`;
      gates[id] = {
        id,
        creature: slug,
        parcel: "elsewhere",
        caps: ["exec"],
        openedAt: iso(at - day),
        expiresAt: undefined,
        latchedAt: undefined,
        walks: 0,
        lastWalkAt: undefined,
      };
    }
  }
  const shelves: Shelf[] = Array.from({ length: Math.min(12, 2 + count) }, (_, index) => ({
    thread: `shelf-${index}`,
    creature: undefined,
    title: `delivered ${index}`,
    deliveredAt: iso(at - day),
    changes: 1,
  }));
  const landmarks: Landmark[] = [
    { kind: "tree", creature: slugOf(0), at: iso(at - 200 * day), evidence: "thread" },
    { kind: "weathervane", creature: slugOf(0), at: iso(at - 100 * day), evidence: "routine" },
    ...(count >= 4
      ? [{ kind: "well" as const, creature: slugOf(3), at: iso(at - 50 * day), evidence: "night" }]
      : []),
  ];
  return {
    ...base,
    asOf: iso(at - minute),
    creatures,
    threads,
    gates,
    parcels: {
      house: {
        id: "house",
        name: "home",
        roles: ["house"],
        online: true,
        path: undefined,
        fencedAt: iso(at - 300 * day),
        seenAt: iso(at - minute),
      },
    },
    mills:
      count >= 3
        ? {
            mill: {
              id: "mill",
              parcel: "house",
              name: "local models",
              loaded: ["small"],
              busy: true,
              builtAt: iso(at - 30 * day),
            },
          }
        : {},
    storehouse: { shelves, folded: 0, wings: 1 },
    landmarks,
  };
}

export function sketchPartnerships(count: number): Partnership[] {
  return sketchPairs.flatMap(([a, b, grade]) =>
    a < count && b < count ? [{ between: [slugOf(a), slugOf(b)] as const, grade }] : [],
  );
}

export function sketchDecorations(count: number): Record<string, Decoration> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      slugOf(index),
      { garland: index < 6, banner: index < 2 ? 2 : index < 5 ? 1 : 0, star: index < 2 },
    ]),
  );
}

export function sketchMonument(count: number): MonumentTier {
  return monumentFor(count);
}

export function plotProjects(
  count: number,
  conversations: readonly number[] = [],
): readonly ProjectSite[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `/work/project-${index}`,
    floors: 1,
    lit: index % 2 === 0,
    conversations: conversations[index] ?? 1,
  }));
}

export const pageGround = { night: "#1a1b26", day: "#e9ebf3" } as const;

export interface LadderPlot {
  readonly stage: ProjectStage;
  readonly cell: readonly [number, number];
  readonly at: readonly [number, number];
  readonly name?: string;
}

export const ladderCreature = 5;
export const ladderFigureAt = { x: -14, z: 18 } as const;

export const ladderPlots: readonly LadderPlot[] = [
  { stage: "shack", cell: [0, 0], at: [4, 4] },
  { stage: "shed", cell: [0, 0], at: [18, 2] },
  { stage: "house", cell: [1, 0], at: [-14, 0] },
  { stage: "tower", cell: [1, 0], at: [12, 0], name: "docs" },
  { stage: "high-rise", cell: [2, 0], at: [0, 0], name: "engine" },
  { stage: "skyscraper", cell: [3, 0], at: [0, 0], name: "stead-site" },
];

export const ladderFraming = { tight: 0, slab: 12 } as const;

export function ladderWorld(kit: Kit, appearance: Appearance): BlockWorld {
  const colours = kit.colours[appearance];
  const ramp = identityRamp(ladderCreature);
  const seed = bearingOf(ladderCreature).seed;
  const items = new Map<string, Item[]>();
  const into = (cx: number, cz: number, item: Item): void => {
    items.set(`${cx},${cz}`, [...(items.get(`${cx},${cz}`) ?? []), item]);
  };
  let reach = lowestReach;
  for (const plot of ladderPlots) {
    const [cx, cz] = plot.cell;
    const centre = cellCenter(cx, cz);
    const dx = centre.x + plot.at[0];
    const dz = centre.z + plot.at[1];
    const built = kit.project({
      stage: plot.stage,
      seed,
      order: ladderCreature,
      lit: true,
      name: plot.name,
    });
    reach = Math.max(reach, built.reach);
    into(cx, cz, placedItem("project", built, dx, dz, ramp));
    for (const annex of built.annexes ?? []) {
      into(cx, cz, {
        what: annex.what,
        x: dx + annex.x,
        z: dz + annex.z,
        parts: annex.parts.map((part) => movedPart(part, dx, dz)),
        ramp,
      });
    }
  }
  into(0, 0, {
    what: "creature",
    x: ladderFigureAt.x,
    z: ladderFigureAt.z,
    parts: critterParts(figureFor("folio"), "idle", ladderCreature).map((part) =>
      movedPart(part, ladderFigureAt.x, ladderFigureAt.z),
    ),
    ramp,
  });
  const cells: Cell[] = [0, 1, 2, 3].map((cx) => ({
    cx,
    cz: 0,
    land: true,
    fog: 0,
    ground: kit
      .ground({
        cx,
        cz: 0,
        worn: undefined,
        roads: noRoads,
        glow: [],
        night: colours.night,
        pooled: colours.pool !== undefined,
        shadow: colours.shadow,
      })
      .parts.flatMap((part): Box[] => {
        const moved = movedPart(part, cx * cellPitch, 0);
        return "box" in moved ? [moved.box] : [];
      }),
    items: items.get(`${cx},0`) ?? [],
  }));
  return {
    cells,
    walkers: [],
    cast: [],
    bounds: {
      minX: -halfCell,
      maxX: 3 * cellPitch + halfCell,
      minZ: -halfCell,
      maxZ: halfCell,
      height: reach,
      slab: heroSlab,
    },
  };
}

const noRoads = {
  north: 0,
  south: 0,
  west: 0,
  east: 0,
  northWest: 0,
  northEast: 0,
  southWest: 0,
  southEast: 0,
} as const;

function placedItem(what: string, built: Construction, dx: number, dz: number, ramp: string): Item {
  const moved = (part: Part): Part => movedPart(part, dx, dz);
  const first = built.parts.find((part) => "box" in part);
  const anchor =
    first !== undefined && "box" in first
      ? { x: (first.box.x0 + first.box.x1) / 2, z: (first.box.z0 + first.box.z1) / 2 }
      : { x: 0, z: 0 };
  return {
    what,
    x: dx + anchor.x,
    z: dz + anchor.z,
    parts: built.parts.map(moved),
    ...(built.crown === undefined
      ? {}
      : {
          crown: built.crown.map((crowned) => ({
            x: crowned.x + dx,
            z: crowned.z + dz,
            part: moved(crowned.part),
          })),
        }),
    ramp,
  };
}

function threadsFor(slug: string, traits: SketchCreature, at: number): Thread[] {
  const old = (id: string): Thread => ({
    ...emptyThread(`${slug}-${id}`, iso(at - 3 * day)),
    creature: slug,
  });
  const delivered = Array.from({ length: traits.shelf }, (_, index) => ({
    ...old(`delivered-${index}`),
    viewedAt: iso(at - 3 * day),
  }));
  const stale = Array.from({ length: traits.crates }, (_, index) => ({
    ...old(`crate-${index}`),
    back: { at: iso(at - 8 * day), preview: "done", changes: [] },
  }));
  const recent = iso(at - 2 * minute);
  const running = (id: string): Thread => ({
    ...emptyThread(`${slug}-${id}`, recent),
    creature: slug,
    turn: {
      startedAt: iso(at - 10 * minute),
      lastProgressAt: recent,
      tool: undefined,
      stumbledAt: undefined,
    },
  });
  const now: Thread[] = [];
  switch (traits.state) {
    case "work":
      now.push(running("now"));
      if (traits.child) now.push({ ...running("loft"), kind: "child" });
      break;
    case "porch":
      now.push({
        ...emptyThread(`${slug}-now`, recent),
        creature: slug,
        asks: { ask: { callId: "ask", tool: "bash", subject: "ls", askedAt: recent } },
      });
      break;
    case "walk":
      now.push(running("now"));
      now.push({
        ...emptyThread(`${slug}-carried`, recent),
        creature: slug,
        back: { at: recent, preview: "done", changes: [] },
      });
      if (traits.child) now.push({ ...running("loft"), kind: "child" });
      break;
    case "blocked":
      now.push({
        ...emptyThread(`${slug}-now`, recent),
        creature: slug,
        failure: { at: recent, eventId: 1, message: "it broke" },
        failures: 1,
      });
      break;
    case "idle":
      now.push({ ...emptyThread(`${slug}-now`, iso(at - 30 * minute)), creature: slug });
      break;
    case "nap":
      break;
  }
  return [...delivered, ...stale, ...now];
}

function ageDays(ivy: number): number {
  return [1, 10, 40, 100][ivy] ?? 1;
}

function iso(at: number): string {
  return new Date(at).toISOString();
}
