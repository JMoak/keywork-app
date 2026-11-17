import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import { prefersReducedMotion } from "../chrome/stamp.ts";
import { createRenderer, loadSkin, scaleFor } from "../panes/stead/habitat-render.ts";
import {
  devicePixelRatioOf,
  forcedColorsActive,
  forcedColorsQuery,
  type Palettes,
  paletteSourceOf,
  palettesOf,
  reducedMotionQuery,
  surfaceOf,
  watchMedia,
  watchTheme,
} from "../panes/stead/painter.ts";
import { skinLabel } from "./copy.ts";

export interface PortraitProps {
  readonly skin: string;
  readonly hueStop: number;
}

export const portraitFacing = "right";
export const portraitClip = "idle";

export function Portrait(props: PortraitProps) {
  let canvas: HTMLCanvasElement | undefined;
  const loaded = createMemo(() => loadSkin(props.skin));
  const renderer = createMemo(() => {
    const skin = loaded();
    return skin.ok ? createRenderer(skin.skin) : undefined;
  });
  const [frame, setFrame] = createSignal(0);
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());
  let palettes: Palettes | undefined;

  const paint = (): void => {
    const skin = loaded();
    const render = renderer();
    if (!skin.ok || render === undefined || canvas === undefined) return;
    const dpr = devicePixelRatioOf();
    const scale = scaleFor(dpr);
    const { width, height } = skin.skin.cell;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${(width * scale) / dpr}px`;
    canvas.style.height = `${(height * scale) / dpr}px`;
    const context = canvas.getContext("2d");
    if (context === null) return;
    palettes = palettesOf(
      paletteSourceOf(canvas),
      "day",
      undefined,
      forcedColorsActive(),
      palettes,
    );
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const shown = frame() % skin.skin.rows[portraitClip].frames;
    render(
      { clip: portraitClip, frame: shown, facing: portraitFacing },
      palettes.coat(props.hueStop),
      { scale },
    ).paint(surfaceOf(context), 0, 0);
  };
  createEffect(on([loaded, reducedMotion], () => setFrame(0)));
  createEffect(on([renderer, frame, reducedMotion, () => props.hueStop], paint));
  createEffect(
    on([loaded, frame, reducedMotion], () => {
      const skin = loaded();
      if (!skin.ok || reducedMotion()) return;
      const row = skin.skin.rows[portraitClip];
      const hold = row.ms[frame() % row.frames] ?? row.ms[0] ?? 600;
      const timer = setTimeout(() => setFrame((current) => (current + 1) % row.frames), hold);
      onCleanup(() => clearTimeout(timer));
    }),
  );
  onMount(() => {
    const stops = [
      watchTheme(paint),
      watchMedia(forcedColorsQuery, paint),
      watchMedia(reducedMotionQuery, () => setReducedMotion(prefersReducedMotion())),
      watchPixelRatio(paint),
    ];
    onCleanup(() => {
      for (const stop of stops) stop();
    });
  });

  return (
    <Show
      when={loaded().ok}
      fallback={<p class="kw-onboard-portrait-refused">skin {props.skin} refused</p>}
    >
      <canvas
        class="kw-onboard-portrait"
        ref={(element) => {
          canvas = element;
          paint();
        }}
        role="img"
        data-skin={props.skin}
        aria-label={`${skinLabel(props.skin)}, idle`}
      />
    </Show>
  );
}

function watchPixelRatio(paint: () => void): () => void {
  let stop: () => void = () => undefined;
  const changed = (): void => {
    stop();
    stop = watchMedia(`(resolution: ${devicePixelRatioOf()}dppx)`, changed);
    paint();
  };
  changed();
  window.addEventListener("resize", changed);
  return () => {
    stop();
    window.removeEventListener("resize", changed);
  };
}
