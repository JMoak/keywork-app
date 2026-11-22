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
import type { MonumentTier } from "./kit.ts";
import { monumentFor } from "./layout.ts";
import type { Decoration, Partnership, ProjectSite } from "./scene.ts";

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

export const sketchForms = ["kid", "cairn", "tessera", "folio", "purl", "hush", "knot"] as const;

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
    form: sketchForms[(index * 3 + (index > 6 ? 1 : 0)) % 7] ?? "kid",
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
  floors: readonly number[] = [],
): readonly ProjectSite[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `/work/project-${index}`,
    floors: floors[index] ?? 1,
    lit: index % 2 === 0,
  }));
}

export const pageGround = { night: "#1a1b26", day: "#e9ebf3" } as const;

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
