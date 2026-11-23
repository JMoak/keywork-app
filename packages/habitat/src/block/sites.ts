import { parseTs } from "../clock/clock.ts";
import { type HabitatState, type SessionId, type Slug, threadsOf } from "../world/types.ts";
import { type ProjectStage, projectStages } from "./kit.ts";
import type { ProjectSite } from "./scene.ts";

export interface ConversationPlace {
  readonly directory: string;
  readonly startedAt: string;
}

export type ConversationPlaces = Readonly<Record<SessionId, ConversationPlace>>;

export type TrackedFiles = Readonly<Record<string, number>>;

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
  state: HabitatState,
  places: ConversationPlaces,
  trackedFiles: TrackedFiles = {},
): Record<Slug, ProjectSite[]> {
  return Object.fromEntries(
    Object.keys(state.creatures)
      .sort()
      .map((slug) => [slug, sitesOf(state, slug, places, trackedFiles)] as const)
      .filter(([, sites]) => sites.length > 0),
  );
}

export function directoriesIn(places: ConversationPlaces): string[] {
  return [...new Set(Object.values(places).map((place) => place.directory))].sort();
}

interface Worked {
  readonly since: number;
  readonly latest: number;
  readonly conversations: number;
  readonly lit: boolean;
}

function sitesOf(
  state: HabitatState,
  slug: Slug,
  places: ConversationPlaces,
  trackedFiles: TrackedFiles,
): ProjectSite[] {
  const worked = new Map<string, Worked>();
  for (const thread of threadsOf(state, slug)) {
    const place = places[thread.id];
    if (place === undefined) continue;
    const held = worked.get(place.directory);
    const startedAt = parseTs(place.startedAt);
    worked.set(place.directory, {
      since: Math.min(held?.since ?? startedAt, startedAt),
      latest: Math.max(held?.latest ?? startedAt, startedAt),
      conversations: (held?.conversations ?? 0) + 1,
      lit: (held?.lit ?? false) || thread.turn !== undefined,
    });
  }
  return [...worked.entries()]
    .sort(([a, first], [b, second]) => first.since - second.since || a.localeCompare(b))
    .map(([directory, site]) => ({
      id: directory,
      floors: floorsFor(site.conversations),
      lit: site.lit,
      conversations: site.conversations,
      trackedFiles: trackedFiles[directory],
      since: site.since,
      latest: site.latest,
    }));
}
