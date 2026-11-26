import type { HabitatState } from "@keywork-app/habitat";
import type { SteadPlace } from "@keywork-app/protocol";
import { noteRise } from "../../creature/risen.ts";
import { resolveSkinId } from "../habitat-render.ts";

export function noteHowItFaced(
  place: SteadPlace,
  world: HabitatState,
  seen: ((creature: string) => number | undefined) | undefined,
): void {
  if (place.kind !== "workshop") return;
  const creature = world.creatures[place.creature];
  const aspect = seen?.(place.creature);
  if (creature === undefined || aspect === undefined) return;
  noteRise(resolveSkinId(creature.skin, creature.seed ?? 0), creature.name, aspect);
}
