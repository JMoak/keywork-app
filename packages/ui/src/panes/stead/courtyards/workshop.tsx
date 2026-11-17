import type { Courtyard, WorkshopFamily } from "@keywork-app/habitat";
import {
  type GardenKind,
  paintIndexed,
  resolvePalette,
  scaleFor,
  workshopFrame,
} from "@keywork-app/habitat/render";
import { createEffect, createMemo, on } from "solid-js";
import { devicePixelRatioOf, forcedColorsActive, paletteSourceOf, surfaceOf } from "../painter.ts";

export interface CourtyardWorkshopProps {
  readonly court: Courtyard;
  readonly family: WorkshopFamily;
  readonly garden?: GardenKind | undefined;
  readonly appearance: number;
}

export function CourtyardWorkshop(props: CourtyardWorkshopProps) {
  let canvas: HTMLCanvasElement | undefined;
  const frame = createMemo(() =>
    workshopFrame(props.family, {
      lamps: props.court.reading.lamps,
      lanterns: props.court.reading.lanterns,
      notes: props.court.reading.notes,
      chores: props.court.creature.chores.length,
      crates: props.court.reading.crates,
      boarded: props.court.creature.workshop.boardedAt !== undefined,
      garden: props.garden,
    }),
  );
  const paint = (): void => {
    if (canvas === undefined) return;
    const held = frame();
    const dpr = devicePixelRatioOf();
    const scale = scaleFor(dpr);
    canvas.width = held.width * scale;
    canvas.height = held.height * scale;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.imageSmoothingEnabled = false;
    const palette = resolvePalette(paletteSourceOf(canvas), {
      world: true,
      forcedColors: forcedColorsActive(),
    });
    paintIndexed(surfaceOf(context), held, palette, scale);
  };

  createEffect(on([frame, () => props.appearance], paint));

  return (
    <canvas
      ref={(element) => {
        canvas = element;
        paint();
      }}
      class="kw-courtyard-workshop"
      data-workshop={props.family}
      data-garden={props.garden}
      data-boarded={props.court.creature.workshop.boardedAt !== undefined ? "" : undefined}
      data-still=""
    />
  );
}
