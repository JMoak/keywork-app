import type { HabitatState } from "@keywork-app/habitat";
import {
  doingOf,
  figureFor,
  type Kit,
  type Resident as Plot,
  residentsOf as plotsOf,
} from "@keywork-app/habitat/block";
import { resolveSkinId } from "../panes/stead/habitat-render.ts";
import { creatureSnapshot } from "./feed.ts";
import type { SemanticState, TeamDoing, TeamMember, TeamSnapshot } from "./port.ts";

export const narrowestPitch = 30;
export const elbowRoom = 2;

export const tellings: Readonly<Record<TeamDoing, string>> = {
  porch: "needs you",
  blocked: "blocked",
  walk: "back with work",
  work: "working",
  sit: "paused",
  nap: "asleep",
  idle: "resting",
};

export function teamOf(world: HabitatState, kit: Kit, now: number): TeamSnapshot {
  const standing = plotsOf(world, kit).flatMap((plot) => memberAt(plot, world, now));
  const eyeLandsOn = standing.find((member) => member.doing === "porch")?.slug;
  const members = standing.map((member) => ({ ...member, first: member.slug === eyeLandsOn }));
  return { kit: kit.id, pitch: pitchFor(members), members };
}

export function pitchFor(members: readonly Pick<TeamMember, "skin">[]): number {
  const widest = Math.max(0, ...members.map((member) => figureWidth(member.skin)));
  return Math.max(narrowestPitch, widest + elbowRoom);
}

export function figureWidth(skin: string | undefined): number {
  return Math.max(0, ...figureFor(skin).rows.map((row) => row.length));
}

function memberAt(plot: Plot, world: HabitatState, now: number): TeamMember[] {
  const creature = world.creatures[plot.slug];
  if (creature === undefined || creature.workshop.boardedAt !== undefined) return [];
  const seen = creatureSnapshot(
    world,
    { slug: creature.slug, name: creature.name, hueStop: undefined },
    now,
  );
  const doing = doingFor(seen.state, world, creature.slug, now);
  const waitsHere = doing === "porch" ? seen.threadId : undefined;
  return [
    {
      slug: creature.slug,
      name: creature.name,
      skin: resolveSkinId(creature.skin, creature.seed ?? 0),
      identity: plot.identity,
      order: plot.order,
      doing,
      telling: tellings[doing],
      threadId: waitsHere ?? creature.conversation ?? seen.threadId,
      first: false,
    },
  ];
}

function doingFor(state: SemanticState, world: HabitatState, slug: string, now: number): TeamDoing {
  switch (state) {
    case "porch":
      return "porch";
    case "blocked":
      return "blocked";
    case "back":
      return "walk";
    case "working":
      return "work";
    case "paused":
      return "sit";
    case "idle":
      return doingOf(world, slug, undefined, now);
  }
}
