import type { CreatureWorksite, CreatureWorksiteChange } from "@keywork-app/protocol";
import { parseTs } from "../clock/clock.ts";
import type { Slug } from "../world/types.ts";
import { familyFlags, type ProjectStage, projectStages } from "./kit.ts";
import { pathKey } from "./places.ts";
import type { ProjectSite } from "./scene.ts";

export type TrackedFiles = Readonly<Record<string, number>>;

export type HeardAt = ReadonlyMap<string, number>;

export type LotOrder = Readonly<Record<Slug, readonly string[]>>;

export const floorCap = 20;
export const stageConversations = [1, 3, 10, 30, 100, 300] as const;
export const bigRepository = 2000;

export function stageFor(conversations: number, trackedFiles?: number): ProjectStage {
  const reached = stageConversations.filter((needed) => conversations >= needed).length;
  const lifted = (trackedFiles ?? 0) > bigRepository ? 1 : 0;
  const stage = Math.min(projectStages.length - 1, Math.max(0, reached - 1) + lifted);
  return projectStages[stage] ?? "shack";
}

export function floorsFor(conversations: number): number {
  const doublings = 31 - Math.clz32(Math.max(1, Math.floor(conversations)));
  return Math.min(floorCap, Math.max(1, doublings));
}

export function projectSitesOf(
  worksites: readonly CreatureWorksite[],
  trackedFiles: TrackedFiles = {},
  heardAt: HeardAt = neverHeard,
  order: LotOrder = lotOrderAfter(noLots, worksites),
): Record<Slug, ProjectSite[]> {
  const flags = familyFlagsOf(worksites);
  const sites: Record<Slug, ProjectSite[]> = {};
  for (const worksite of worksites) {
    const family = familyOf(worksite);
    const lot = sites[worksite.creature] ?? [];
    sites[worksite.creature] = lot;
    lot.push({
      id: worksite.directory,
      floors: floorsFor(worksite.conversations),
      lit: worksite.active,
      conversations: worksite.conversations,
      trackedFiles: trackedFiles[worksite.directory],
      since: parseTs(worksite.since),
      latest: parseTs(worksite.latest),
      root: family === undefined ? undefined : worksite.root,
      family: family === undefined ? undefined : flags.get(family),
      heardAt: heardAt.get(worksiteKey(worksite)),
      spot: spotOn(order, worksite),
    });
  }
  for (const lot of Object.values(sites)) lot.sort((a, b) => (a.spot ?? 0) - (b.spot ?? 0));
  return sites;
}

export function lotOrderAfter(
  stored: LotOrder,
  worksites: readonly CreatureWorksite[],
  whole = true,
): LotOrder {
  const worked = new Map<Slug, string[]>();
  for (const worksite of worksites) {
    const lot = worked.get(worksite.creature) ?? [...(stored[worksite.creature] ?? [])];
    worked.set(worksite.creature, lot);
    const directory = pathKey(worksite.directory);
    if (!lot.includes(directory)) lot.push(directory);
  }
  const kept = Object.entries(stored).filter(([creature]) => !whole && !worked.has(creature));
  const after: LotOrder = Object.fromEntries([...kept, ...worked]);
  return sameLotOrder(stored, after) ? stored : after;
}

export function sameLotOrder(one: LotOrder, other: LotOrder): boolean {
  const creatures = Object.keys(one);
  return (
    creatures.length === Object.keys(other).length &&
    creatures.every((creature) => {
      const lot = one[creature] ?? [];
      const held = other[creature];
      return (
        held !== undefined &&
        held.length === lot.length &&
        lot.every((directory, spot) => directory === held[spot])
      );
    })
  );
}

export function inOrderOfFounding(worksites: readonly CreatureWorksite[]): CreatureWorksite[] {
  return [...worksites].sort(
    (a, b) =>
      parseTs(a.since) - parseTs(b.since) ||
      pathKey(a.directory).localeCompare(pathKey(b.directory)),
  );
}

export function worksitesAfter(
  held: readonly CreatureWorksite[],
  { change, worksite }: CreatureWorksiteChange,
): CreatureWorksite[] {
  const key = worksiteKey(worksite);
  const at = held.findIndex((each) => worksiteKey(each) === key);
  if (change === "dropped") return held.filter((_, index) => index !== at);
  return at < 0 ? [...held, worksite] : held.map((each, index) => (index === at ? worksite : each));
}

export function worksiteKey(worksite: Pick<CreatureWorksite, "creature" | "directory">): string {
  return `${worksite.creature} ${pathKey(worksite.directory)}`;
}

export function directoriesIn(worksites: readonly CreatureWorksite[]): string[] {
  return [...new Set(worksites.map((worksite) => worksite.directory))].sort();
}

export function familyFlagsOf(worksites: readonly CreatureWorksite[]): ReadonlyMap<string, number> {
  const founded = new Map<string, number>();
  for (const worksite of worksites) {
    const family = familyOf(worksite);
    if (family === undefined) continue;
    const since = parseTs(worksite.since);
    founded.set(family, Math.min(founded.get(family) ?? since, since));
  }
  const oldestFirst = [...founded].sort(
    ([a, first], [b, second]) => first - second || a.localeCompare(b),
  );
  return new Map(oldestFirst.map(([family], order) => [family, order % familyFlags]));
}

const neverHeard: HeardAt = new Map();
const noLots: LotOrder = {};

function spotOn(order: LotOrder, worksite: CreatureWorksite): number | undefined {
  const spot = order[worksite.creature]?.indexOf(pathKey(worksite.directory)) ?? -1;
  return spot < 0 ? undefined : spot;
}

function familyOf(worksite: CreatureWorksite): string | undefined {
  const root = pathKey(worksite.root);
  return root === pathKey(worksite.directory) ? undefined : root;
}
