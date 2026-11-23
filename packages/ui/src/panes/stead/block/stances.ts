import type { Creature, HabitatState, StepContext } from "@keywork-app/habitat";
import type { Stance } from "@keywork-app/habitat/block";
import { emptyHerd, gatherHerd, type Herd, type SkinLoader, stepHerd } from "../herd.ts";

export type Stances = Readonly<Record<string, Stance>>;

export interface HerdOnTheStead {
  step(world: HabitatState, now: number, context: StepContext): Stances;
  nextThoughtAt(): number | undefined;
}

export function herdOnTheStead(load?: SkinLoader): HerdOnTheStead {
  let herd: Herd = emptyHerd;
  let held: Stances = {};
  return {
    step: (world, now, context) => {
      herd = stepHerd(gatherHerd(herd, world, now, load), world, now, () => context);
      const next = Object.fromEntries(
        herd.members.map((member) => [member.slug, stanceOf(member.creature)]),
      );
      held = sameStances(held, next) ? held : next;
      return held;
    },
    nextThoughtAt: () => {
      const thoughts = herd.members.flatMap((member) => member.creature.nextThoughtAt ?? []);
      return thoughts.length === 0 ? undefined : Math.min(...thoughts);
    },
  };
}

export function stanceOf(creature: Creature): Stance {
  switch (creature.body.clip.name) {
    case "nap":
      return "nap";
    case "sit":
      return "sit";
    default:
      return "idle";
  }
}

function sameStances(one: Stances, other: Stances): boolean {
  const slugs = Object.keys(one);
  return (
    slugs.length === Object.keys(other).length && slugs.every((slug) => one[slug] === other[slug])
  );
}
