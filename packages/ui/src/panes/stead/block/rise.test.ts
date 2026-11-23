import {
  blockScene,
  drawList,
  neonKit,
  placeRectsOf,
  raisedEye,
  restCamera,
  viewOf,
} from "@keywork-app/habitat/block";
import { noon, plotProjects, sketchTown, slugOf } from "@keywork-app/habitat/block/testing";
import type { SteadPlace } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { emergeStart } from "../../../surfaces/feel/arrange.ts";
import { arrivalPlan, riseTiming, windowFloor } from "../../../surfaces/feel/choreography.ts";
import type { Desk, ScreenRect, SurfaceShow } from "../../../surfaces/port.ts";
import { placeOnStage } from "./block-world.tsx";

describe("a pane set out from a place in the stead", () => {
  it("rises from that place's rectangle, a project from its building or else its creature's workshop, and from the console's edge when no stead shows it", () => {
    const builder = slugOf(0);
    const plain = slugOf(1);
    const project = plotProjects(1)[0]?.id ?? "";
    const town = blockScene(sketchTown(5), {
      kit: neonKit,
      appearance: "night",
      now: noon,
      projects: { [builder]: plotProjects(1) },
    }).world;
    const list = drawList(town, restCamera(0, raisedEye), viewOf(town, 1008, 580, raisedEye));
    const rects = placeRectsOf(list);
    const onStage = (place: SteadPlace) => placeOnStage(rects, place, 2);

    const workshop = onStage({ kind: "workshop", creature: plain });
    const porch = onStage({ kind: "porch" });
    const store = onStage({ kind: "store" });
    const mill = onStage({ kind: "mill" });
    const shed = onStage({ kind: "project", creature: builder, directory: project });
    for (const rect of [workshop, porch, store, mill, shed]) {
      expect(rect?.width).toBeGreaterThan(0);
      expect(rect?.height).toBeGreaterThan(0);
    }
    expect(
      new Set([workshop, porch, store, mill, shed].map((rect) => JSON.stringify(rect))).size,
    ).toBe(5);
    expect(shed).not.toEqual(onStage({ kind: "workshop", creature: builder }));
    expect(onStage({ kind: "project", creature: plain, directory: "C:/elsewhere" })).toEqual(
      workshop,
    );
    expect(onStage({ kind: "workshop", creature: "nobody" })).toBeUndefined();

    const seat: ScreenRect = { x: 900, y: 200, width: 480, height: 360 };
    const show: SurfaceShow = {
      id: "pane-7",
      bounds: seat,
      origin: "creature",
      focus: false,
      follows: true,
      backdrop: "#000000",
      title: "pane",
    };
    const place: ScreenRect = { x: 120.4, y: 610.6, width: 38, height: 44 };
    const moving = { reducedMotion: false, tier: "interact" } as const;
    const risen = arrivalPlan(desk, [show], [], moving, undefined, new Map([[show.id, place]]));
    const shown = risen.cues[0];
    expect(shown?.kind === "show" && shown.show.bounds).toEqual({
      x: 39,
      y: 573,
      width: windowFloor.width,
      height: windowFloor.height,
    });
    const steps = risen.cues.flatMap((cue) => (cue.kind === "glide" ? cue.glide.moves : []));
    expect(steps).toHaveLength(riseTiming.steps);
    expect(steps.at(-1)?.bounds).toEqual(seat);
    expect(steps.every(({ bounds }) => Object.values(bounds).every(Number.isInteger))).toBe(true);
    expect(
      steps.every(
        ({ bounds }) => bounds.width >= windowFloor.width && bounds.height >= windowFloor.height,
      ),
    ).toBe(true);
    expect(risen.cues.every((cue) => cue.kind !== "glide" || cue.glide.durationMs === 0)).toBe(
      true,
    );

    const fromTheConsole = arrivalPlan(desk, [show], [], moving);
    const emerged = fromTheConsole.cues[0];
    expect(emerged?.kind === "show" && emerged.show.bounds).toEqual(emergeStart(desk, seat));

    const still = arrivalPlan(
      desk,
      [show],
      [],
      { ...moving, reducedMotion: true },
      undefined,
      new Map([[show.id, place]]),
    );
    expect(still.cues).toEqual([{ atMs: 0, kind: "show", show }]);
  });
});

const workArea: ScreenRect = { x: 0, y: 0, width: 1920, height: 1040 };

const desk: Desk = {
  console: { x: 0, y: 0, width: 800, height: 1040 },
  consoleMaximized: false,
  workArea,
  displays: [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea, scaleFactor: 1 }],
  cursor: { x: 400, y: 400 },
};
