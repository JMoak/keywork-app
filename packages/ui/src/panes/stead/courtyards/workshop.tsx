import type { Courtyard, WorkshopFamily } from "@keywork-app/habitat";
import {
  courtyardFrame,
  courtyardPalette,
  courtyardSettingOf,
  type GardenKind,
  paintIndexed,
} from "@keywork-app/habitat/render";
import { createEffect, createMemo, on } from "solid-js";
import { devicePixelRatioOf, forcedColorsActive, paletteSourceOf, surfaceOf } from "../painter.ts";
import { courtyardPaintScale } from "./painting.ts";

export interface CourtyardWorkshopProps {
  readonly court: Courtyard;
  readonly family: WorkshopFamily;
  readonly garden?: GardenKind | undefined;
  readonly appearance: number;
}

export function CourtyardWorkshop(props: CourtyardWorkshopProps) {
  let canvas: HTMLCanvasElement | undefined;
  const visual = createMemo(
    () =>
      [
        props.court.index,
        props.family,
        props.garden,
        props.court.reading.lamps,
        props.court.reading.lanterns,
        props.court.reading.notes,
        props.court.creature.chores.length,
        props.court.reading.crates,
        props.court.creature.workshop.boardedAt !== undefined,
      ] as const,
    undefined,
    { equals: (a, b) => a.every((value, index) => value === b[index]) },
  );
  const frame = createMemo(() => {
    const [address, family, garden, lamps, lanterns, notes, chores, crates, boarded] = visual();
    return courtyardFrame(address, family, {
      garden,
      lamps,
      lanterns,
      notes,
      chores,
      crates,
      boarded,
    });
  });
  const paint = (): void => {
    if (canvas === undefined) return;
    const held = frame();
    const dpr = devicePixelRatioOf();
    const scale = courtyardPaintScale(dpr);
    canvas.width = held.width * scale;
    canvas.height = held.height * scale;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.imageSmoothingEnabled = false;
    const palette = courtyardPalette(
      paletteSourceOf(canvas),
      props.court.index,
      forcedColorsActive(),
    );
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
      data-setting={courtyardSettingOf(props.court.index)}
      data-garden={props.garden}
      data-boarded={props.court.creature.workshop.boardedAt !== undefined ? "" : undefined}
      data-still=""
    />
  );
}
