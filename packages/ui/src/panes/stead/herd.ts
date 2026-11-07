import {
  type Creature,
  createCreature,
  type HabitatState,
  type MotionPrefs,
  type Pose,
  poseOf,
  type Skin,
  type StepContext,
  step,
} from "@keywork-app/habitat";
import { hueStop } from "../../chrome/pane-frame.tsx";
import {
  createRenderer,
  defaultSkinId,
  type FigurePose,
  type LoadedSkin,
  loadSkin,
  type Renderer,
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
): Herd {
  const slugs = Object.keys(world.creatures).sort();
  const seated = new Set([
    ...herd.members.map((member) => member.slug),
    ...herd.refused.map((refused) => refused.slug),
  ]);
  const arriving = slugs.filter((slug) => !seated.has(slug));
  if (arriving.length === 0) return herd;
  const members = [...herd.members];
  const refused = [...herd.refused];
  for (const slug of arriving) {
    const resident = world.creatures[slug];
    if (resident === undefined) continue;
    const loaded = load(resident.skin ?? defaultSkinId);
    if (!loaded.ok) {
      refused.push({ slug, id: loaded.id, faults: loaded.faults });
      continue;
    }
    members.push({
      slug,
      name: resident.name,
      hueStop: coatOf(resident, slugs.indexOf(slug)),
      skin: loaded.skin,
      render: createRenderer(loaded.skin),
      creature: createCreature(slug, now, {
        rows: loaded.skin.rows,
        place: "bench",
        offsetMinutes: world.house.offsetMinutes,
      }),
    });
  }
  members.sort((a, b) => a.slug.localeCompare(b.slug));
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

export function posesOf(herd: Herd, prefs: MotionPrefs): Map<string, Pose> {
  return new Map(herd.members.map((member) => [member.slug, poseOf(member.creature, prefs)]));
}

export function figurePoseOf(pose: Pose): FigurePose {
  return {
    clip: pose.clip,
    frame: pose.frame,
    facing: pose.facing,
    x: pose.x,
    lift: pose.lift,
    blink: pose.blink,
    gaze: pose.gaze === undefined ? undefined : { direction: pose.gaze.direction },
    glyph: pose.glyph,
  };
}

export function earliestWake(wakes: Iterable<number | undefined>): number | undefined {
  let earliest: number | undefined;
  for (const wake of wakes) {
    if (wake === undefined) continue;
    if (earliest === undefined || wake < earliest) earliest = wake;
  }
  return earliest;
}
