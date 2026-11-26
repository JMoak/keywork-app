import {
  honourChangeOf,
  honourKey,
  honourRoutes,
  honoursAfter,
  type ServerFeed,
} from "@keywork-app/client";
import {
  type BannerTier,
  cellPitch,
  type Decoration,
  type MonumentTier,
  monumentFor,
  type Point,
  reserved,
  type Target,
  type ToolTier,
  type BlockWorld as Town,
  type TownChange,
} from "@keywork-app/habitat/block";
import {
  type Honour,
  type HonourChange,
  type HonourKind,
  isServedRefusal,
  type SteadHonourKind,
  type SteadPlace,
  steadHonourKinds,
} from "@keywork-app/protocol";
import { batch, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { hostFetch } from "../../../host/transport.ts";
import { createFleetingNotice } from "../../overview/rows.tsx";
import type { ShellSeams } from "../../registry.ts";
import { earnedLines, honourTitle, type NameOf } from "./honour-words.ts";
import { freshMs } from "./transition.ts";

export type Standing = "new" | "proven" | "decorated";

export type Tier = 0 | 1 | 2 | 3;

export const provenFrom = 3;
export const decoratedFrom = 7;

export interface WorldStanding {
  readonly decorations: Readonly<Record<string, Decoration>>;
  readonly tools: Readonly<Record<string, ToolTier>>;
  readonly medals: Readonly<Record<string, boolean>>;
  readonly monument: MonumentTier;
}

export interface HonourSeams {
  readHonours(): Promise<readonly Honour[] | undefined>;
  readonly feed: Pick<ServerFeed, "subscribe">;
}

export interface Earned {
  readonly honour: Honour;
  readonly heardAt: number;
}

export interface Honours {
  rows(): readonly Honour[];
  earned(): readonly Earned[];
}

export interface SteadStanding {
  world(): WorldStanding;
  ofTheStead(): readonly Honour[];
  places(): readonly SteadPlace[];
  arriving(town: Town, now: number, busy: boolean): TownChange | undefined;
  said(): string | undefined;
  titleOf(honour: Honour): string;
}

export const greenPlace: SteadPlace = { kind: "green" };

export function standingOf(held: number): Standing {
  return held >= decoratedFrom ? "decorated" : held >= provenFrom ? "proven" : "new";
}

export function highestTier(held: readonly Honour[], kind: HonourKind): Tier {
  const reached = Math.max(0, ...held.filter((each) => each.kind === kind).map(tierOf));
  return reached >= 3 ? 3 : reached === 2 ? 2 : reached === 1 ? 1 : 0;
}

export function decorationOf(held: readonly Honour[]): Decoration {
  const standing = standingOf(held.length);
  return {
    garland: standing !== "new",
    banner: banners[standing],
    star: standing === "decorated",
    ribbon: highestTier(held, "run"),
  };
}

export function worldStandingOf(honours: readonly Honour[]): WorldStanding {
  const held = Object.entries(byCreature(honours));
  return {
    decorations: Object.fromEntries(held.map(([slug, own]) => [slug, decorationOf(own)])),
    tools: Object.fromEntries(held.map(([slug, own]) => [slug, highestTier(own, "range")])),
    medals: Object.fromEntries(
      held.flatMap(([slug, own]) => (standingOf(own.length) === "decorated" ? [[slug, true]] : [])),
    ),
    monument: monumentFor(steadKindsIn(honours)),
  };
}

export function steadsOwn(honours: readonly Honour[]): Honour[] {
  return honours
    .filter((honour) => honour.holder === null)
    .sort((a, b) => Date.parse(a.earnedAt) - Date.parse(b.earnedAt));
}

export function honourSeamsOf(shell: Pick<ShellSeams, "host" | "workspace" | "feed">): HonourSeams {
  const fetch = hostFetch(shell.host, shell.workspace);
  const { creatureHonours } = honourRoutes((method, path) => fetch(path, { method }));
  return {
    readHonours: async () => {
      const listed = await creatureHonours();
      return isServedRefusal(listed) ? undefined : listed;
    },
    feed: shell.feed,
  };
}

export function createHonours(seams: HonourSeams, now: () => number = Date.now): Honours {
  const [rows, setRows] = createSignal<readonly Honour[]>([]);
  const [earned, setEarned] = createSignal<readonly Earned[]>([]);
  let beforeTheListing: HonourChange[] | undefined = [];
  let disposed = false;

  const hear = ({ change, honour }: HonourChange): void => {
    const others = earned().filter(
      (each) => honourKey(each.honour) !== honourKey(honour) && now() - each.heardAt < freshMs,
    );
    setEarned(change === "earned" ? [...others, { honour, heardAt: now() }] : others);
  };
  const follow = (change: HonourChange, live: boolean): void => {
    if (live) hear(change);
    if (beforeTheListing === undefined) setRows((held) => honoursAfter(held, change));
    else beforeTheListing.push(change);
  };
  const seat = (listed: readonly Honour[] | undefined): void => {
    const early = beforeTheListing ?? [];
    beforeTheListing = undefined;
    if (!disposed) setRows(early.reduce(honoursAfter, [...(listed ?? [])]));
  };

  onCleanup(
    seams.feed.subscribe((envelopes) => {
      batch(() => {
        for (const envelope of envelopes) {
          const change = honourChangeOf(envelope);
          if (change !== undefined) follow(change, envelope.payload.replay !== true);
        }
      });
    }),
  );
  void Promise.resolve()
    .then(() => seams.readHonours())
    .then(seat, () => seat(undefined));
  onCleanup(() => {
    disposed = true;
  });
  return { rows, earned };
}

export function createSteadStanding(
  seams: HonourSeams,
  nameOf: NameOf,
  now: () => number = Date.now,
): SteadStanding {
  const honours = createHonours(seams, now);
  const world = createMemo(() => worldStandingOf(honours.rows()));
  const ofTheStead = createMemo(() => steadsOwn(honours.rows()));
  const notice = createFleetingNotice();
  const rung = new Set<string>();
  const told = new Set<string>();

  createEffect(() => {
    const untold = honours.earned().filter((each) => !told.has(keyOf(each)));
    for (const each of untold) told.add(keyOf(each));
    if (untold.length === 0) return;
    const earned = untold.map((each) => each.honour);
    notice.say(earnedLines(earned, nameOf));
  });

  return {
    world,
    ofTheStead,
    places: () => (world().monument > 0 ? [greenPlace] : []),
    said: notice.text,
    titleOf: (honour) => honourTitle(honour, nameOf),
    arriving: (town, at, busy) => {
      if (busy) return undefined;
      for (const each of honours.earned()) {
        if (rung.has(keyOf(each)) || at - each.heardAt >= freshMs) continue;
        const where = whereItHappened(town, each.honour.holder);
        if (where === undefined) continue;
        rung.add(keyOf(each));
        return { kind: "honour", holder: each.honour.holder ?? undefined, at: where };
      }
      return undefined;
    },
  };
}

export function whereItHappened(town: Town, holder: string | null): Point | undefined {
  for (const cell of town.cells) {
    for (const item of cell.items) {
      const target = item.target;
      if (holder === null ? target?.kind === "monument" : workshopOf(target, holder)) {
        return { x: item.x, z: item.z };
      }
    }
  }
  return holder === null ? middleOfTheGreen : undefined;
}

const banners: Readonly<Record<Standing, BannerTier>> = { new: 0, proven: 1, decorated: 2 };

const middleOfTheGreen: Point = {
  x: reserved.green.cx * cellPitch,
  z: reserved.green.cz * cellPitch,
};

function tierOf(honour: Honour): number {
  return honour.tier;
}

function keyOf(earned: Earned): string {
  return `${honourKey(earned.honour)}@${earned.heardAt}`;
}

function workshopOf(target: Target | undefined, slug: string): boolean {
  return target?.kind === "workshop" && target.creature === slug;
}

function byCreature(honours: readonly Honour[]): Record<string, Honour[]> {
  const held: Record<string, Honour[]> = {};
  for (const honour of honours) {
    if (honour.holder === null) continue;
    held[honour.holder] = [...(held[honour.holder] ?? []), honour];
  }
  return held;
}

function steadKindsIn(honours: readonly Honour[]): SteadHonourKind[] {
  return honours.flatMap((honour) =>
    honour.holder === null && isSteadKind(honour.kind) ? [honour.kind] : [],
  );
}

function isSteadKind(kind: HonourKind): kind is SteadHonourKind {
  return (steadHonourKinds as readonly string[]).includes(kind);
}
