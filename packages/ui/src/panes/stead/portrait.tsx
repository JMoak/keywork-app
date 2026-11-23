import { createEffect, createMemo, on, Show } from "solid-js";
import { portraitClip, portraitOf } from "../creature/portrait.tsx";
import { resolvePalette, scaleFor } from "./habitat-render.ts";
import { devicePixelRatioOf, forcedColorsActive, paletteSourceOf, surfaceOf } from "./painter.ts";

export interface CourtyardPortraitProps {
  readonly skin: string;
  readonly hueStop: number;
  readonly appearance: number;
}

export function CourtyardPortrait(props: CourtyardPortraitProps) {
  let canvas: HTMLCanvasElement | undefined;
  const portrait = createMemo(() => portraitOf(props.skin));
  const paint = (): void => {
    const held = portrait();
    if (held === undefined || canvas === undefined) return;
    const dpr = devicePixelRatioOf(canvas);
    const scale = scaleFor(dpr, 1);
    const width = held.skin.cell.width * scale;
    const height = held.skin.cell.height * scale;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width / dpr}px`;
    canvas.style.height = `${height / dpr}px`;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.imageSmoothingEnabled = false;
    const palette = resolvePalette(paletteSourceOf(canvas), {
      hueStop: props.hueStop,
      forcedColors: forcedColorsActive(canvas),
    });
    held
      .render({ clip: portraitClip, frame: 0, facing: "right" }, palette, { scale })
      .paint(surfaceOf(context), 0, 0);
  };

  createEffect(on([portrait, () => props.hueStop, () => props.appearance], paint));

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
