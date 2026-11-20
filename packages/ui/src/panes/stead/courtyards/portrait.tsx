import { courtyardLayout } from "@keywork-app/habitat/render";
import { createEffect, createMemo, on, Show } from "solid-js";
import { portraitClip, portraitOf } from "../../creature/portrait.tsx";
import { resolvePalette } from "../habitat-render.ts";
import { devicePixelRatioOf, forcedColorsActive, paletteSourceOf, surfaceOf } from "../painter.ts";
import { courtyardPaintScale } from "./painting.ts";

export interface CourtyardPortraitProps {
  readonly skin: string;
  readonly hueStop: number;
  readonly appearance: number;
  readonly inScene?: boolean;
}

export function CourtyardPortrait(props: CourtyardPortraitProps) {
  let canvas: HTMLCanvasElement | undefined;
  const skin = createMemo(() => props.skin);
  const hueStop = createMemo(() => props.hueStop);
  const inScene = createMemo(() => props.inScene === true);
  const portrait = createMemo(() => portraitOf(skin()));
  const paint = (): void => {
    const held = portrait();
    if (held === undefined || canvas === undefined) return;
    const dpr = devicePixelRatioOf();
    const scale = courtyardPaintScale(dpr);
    const width = held.skin.cell.width * scale;
    const height = held.skin.cell.height * scale;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = props.inScene
      ? `${(held.skin.cell.width / courtyardLayout.width) * 100}%`
      : `${width / dpr}px`;
    canvas.style.height = props.inScene
      ? `${(held.skin.cell.height / courtyardLayout.height) * 100}%`
      : `${height / dpr}px`;
    canvas.style.left = props.inScene
      ? `${((courtyardLayout.resident.x - held.skin.cell.width / 2) / courtyardLayout.width) * 100}%`
      : "";
    canvas.style.top = props.inScene
      ? `${((courtyardLayout.resident.y - held.skin.groundLine) / courtyardLayout.height) * 100}%`
      : "";
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.imageSmoothingEnabled = false;
    const palette = resolvePalette(paletteSourceOf(canvas), {
      hueStop: props.hueStop,
      material: held.skin.material,
      forcedColors: forcedColorsActive(),
    });
    held
      .render({ clip: portraitClip, frame: 0, facing: props.inScene ? "left" : "right" }, palette, {
        scale,
      })
      .paint(surfaceOf(context), 0, 0);
  };

  createEffect(on([portrait, hueStop, () => props.appearance, inScene], paint));

  return (
    <Show
      when={portrait()}
      fallback={<span class="kw-courtyard-missing">Artwork unavailable</span>}
    >
      {(held) => (
        <canvas
          ref={(element) => {
            canvas = element;
            paint();
          }}
          class="kw-courtyard-portrait"
          data-skin={held().skin.id}
          data-clip={portraitClip}
          data-frame="0"
          data-still=""
        />
      )}
    </Show>
  );
}
