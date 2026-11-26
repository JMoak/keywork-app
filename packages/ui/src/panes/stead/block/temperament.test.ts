import {
  blockScene,
  type DrawList,
  drawList,
  firstKit,
  raisedEye,
  restCamera,
  type Temperament,
  temperaments,
  viewOf,
} from "@keywork-app/habitat/block";
import { noon, sketchTown } from "@keywork-app/habitat/block/testing";
import { describe, expect, it } from "vitest";
import { samePicture, tickAt } from "./block-world.tsx";
import { createTroupe } from "./troupe.ts";

const moments = [0, 125, 250, 500, 750, 1000, 1500, 2250, 3000, 4500, 6000];

describe("temperament in the town", () => {
  it("changes nothing drawn when motion is reduced, though it shows in every frame otherwise", () => {
    const still = (temperament: Temperament): DrawList[] => afterATurn(temperament, true);
    const moving = (temperament: Temperament): DrawList[] => afterATurn(temperament, false);
    for (const temperament of temperaments) {
      expect(alike(still(temperament), still("brisk")), `${temperament}, reduced`).toBe(true);
      if (temperament === "brisk") continue;
      expect(alike(moving(temperament), moving("brisk")), `${temperament}, moving`).toBe(false);
    }
  });
});

function afterATurn(temperament: Temperament, reduced: boolean): DrawList[] {
  const town = sketchTown(5);
  const { world } = blockScene(town, {
    kit: firstKit,
    appearance: "night",
    now: noon,
    temperaments: Object.fromEntries(
      Object.keys(town.creatures).map((slug) => [slug, temperament]),
    ),
  });
  const view = viewOf(world, 1008, 580, raisedEye);
  const troupe = createTroupe();
  troupe.standing(world, restCamera(0, raisedEye), noon, reduced);
  const turned = restCamera(1, raisedEye);
  return moments.map((after) =>
    drawList(world, turned, view, tickAt(noon + after, reduced), 0, {
      standing: troupe.standing(world, turned, noon + after, reduced),
    }),
  );
}

function alike(one: readonly DrawList[], other: readonly DrawList[]): boolean {
  return one.every((list, at) => {
    const beside = other[at];
    return (
      beside !== undefined &&
      samePicture({ list, backdrop: [], lights: [] }, { list: beside, backdrop: [], lights: [] })
    );
  });
}
