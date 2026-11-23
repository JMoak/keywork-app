import {
  type Creature,
  createCreature,
  type HabitatState,
  type Skin,
  type StepContext,
  step,
} from "@keywork-app/habitat";
import { hueStop } from "../../chrome/pane-frame.tsx";
import {
  createRenderer,
  type LoadedSkin,
  loadSkin,
  type Renderer,
  resolveSkinId,
} from "./habitat-render.ts";

export interface Member {
  readonly slug: string;
  readonly name: string;
  readonly hueStop: number;
  readonly skin: Skin;
  readonly render: Renderer;
  readonly creature: Creature;
}

export interface RefusedSkin {
  readonly slug: string;
  readonly id: string;
  readonly faults: readonly string[];
}

export interface Herd {
  readonly members: readonly Member[];
  readonly refused: readonly RefusedSkin[];
}

export type SkinLoader = (id: string) => LoadedSkin;

export const emptyHerd: Herd = { members: [], refused: [] };

export function coatOf(
  resident: { readonly seed?: number | undefined } | undefined,
  rank: number,
): number {
  return hueStop(resident?.seed ?? rank);
}

export function gatherHerd(
  herd: Herd,
  world: HabitatState,
  now: number,
  load: SkinLoader = loadSkin,
  visible?: readonly string[],
): Herd {
  const allSlugs = Object.keys(world.creatures).sort();
  const ranks = new Map(allSlugs.map((slug, rank) => [slug, rank]));
  const slugs =
    visible === undefined
      ? allSlugs
      : [...new Set(visible)].filter((slug) => world.creatures[slug] !== undefined).sort();
  const seated = new Map(herd.members.map((member) => [member.slug, member]));
  const unavailable = new Map(herd.refused.map((refused) => [refused.slug, refused]));
  const members: Member[] = [];
  const refused: RefusedSkin[] = [];
  for (const slug of slugs) {
    const resident = world.creatures[slug];
    if (resident === undefined) continue;
    const id = resolveSkinId(resident.skin, resident.seed ?? 0);
    const previous = seated.get(slug);
    const hue = coatOf(resident, ranks.get(slug) ?? 0);
    if (previous?.skin.id === id) {
      members.push(
        previous.name === resident.name && previous.hueStop === hue
          ? previous
          : { ...previous, name: resident.name, hueStop: hue },
      );
      continue;
    }
    const missing = unavailable.get(slug);
    if (missing?.id === id) {
      refused.push(missing);
      continue;
    }
    const loaded = load(id);
    if (!loaded.ok) {
      refused.push({ slug, id: loaded.id, faults: loaded.faults });
      continue;
    }
    members.push({
      slug,
      name: resident.name,
      hueStop: hue,
      skin: loaded.skin,
      render: createRenderer(loaded.skin),
      creature:
        previous === undefined
          ? createCreature(slug, now, {
              rows: loaded.skin.rows,
              place: "bench",
              offsetMinutes: world.house.offsetMinutes,
            })
          : { ...previous.creature, rows: loaded.skin.rows },
    });
  }
  if (
    members.length === herd.members.length &&
    refused.length === herd.refused.length &&
    members.every((member, index) => member === herd.members[index]) &&
    refused.every((missing, index) => missing === herd.refused[index])
  )
    return herd;
  return { members, refused };
}

export function stepHerd(
  herd: Herd,
  world: HabitatState,
  now: number,
  contextFor: (member: Member) => StepContext,
): Herd {
  return {
    ...herd,
    members: herd.members.map((member) => ({
      ...member,
      creature: step(member.creature, world, now, contextFor(member)),
    })),
  };
}
