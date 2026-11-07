import type { Skin } from "@keywork-app/habitat";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import {
  createRenderer,
  loadSkin,
  type Renderer,
  resolvePalette,
  scaleFor,
} from "../stead/habitat-render.ts";
import {
  devicePixelRatioOf,
  forcedColorsActive,
  forcedColorsQuery,
  paletteSourceOf,
  reducedMotionActive,
  reducedMotionQuery,
  surfaceOf,
  watchMedia,
  watchTheme,
} from "../stead/painter.ts";
import { skinRefusedWord } from "./copy.ts";

export const portraitSize = 2;
export const portraitClip = "idle";

export interface PortraitProps {
  skin: string;
  hueStop: number;
  name: string;
}

export interface Portrait {
  readonly skin: Skin;
  readonly render: Renderer;
}

export function portraitOf(id: string): Portrait | undefined {
  const loaded = loadSkin(id);
  return loaded.ok ? { skin: loaded.skin, render: createRenderer(loaded.skin) } : undefined;
}

export function idleFrameAfter(skin: Skin, frame: number): { frame: number; ms: number } {
  const row = skin.rows[portraitClip];
  const next = (frame + 1) % row.frames;
  return { frame: next, ms: row.ms[next] ?? row.ms[0] ?? 500 };
}

export function PortraitView(props: PortraitProps) {
  let canvas: HTMLCanvasElement | undefined;
  const portrait = createMemo(() => portraitOf(props.skin));
  const [frame, setFrame] = createSignal(0);
  const [still, setStill] = createSignal(reducedMotionActive());
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopBreathing = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const breathe = (): void => {
    stopBreathing();
    const held = portrait();
    if (held === undefined || still()) return;
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (hidden) return;
    const next = idleFrameAfter(held.skin, frame());
    timer = setTimeout(() => {
      setFrame(next.frame);
      breathe();
    }, next.ms);
  };

  const paint = (): void => {
    const held = portrait();
    if (held === undefined || canvas === undefined) return;
    const dpr = devicePixelRatioOf();
    const scale = scaleFor(dpr, portraitSize);
    const width = held.skin.cell.width * scale;
    const height = held.skin.cell.height * scale;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    canvas.style.width = `${width / dpr}px`;
    canvas.style.height = `${height / dpr}px`;
    const context = canvas.getContext("2d");
    if (context === null) return;
    context.imageSmoothingEnabled = false;
    const forcedColors = forcedColorsActive();
    const palette = resolvePalette(paletteSourceOf(canvas), {
      hueStop: props.hueStop,
      forcedColors,
    });
    const surface = surfaceOf(context);
    surface.clearRect(0, 0, width, height);
    held
      .render({ clip: portraitClip, frame: frame(), facing: "right" }, palette, { scale })
      .paint(surface, 0, 0);
  };

  createEffect(on([portrait, frame, () => props.hueStop], paint, { defer: true }));
  createEffect(
    on(
      [portrait, still],
      () => {
        setFrame(0);
        breathe();
      },
      { defer: true },
    ),
  );
  onMount(() => {
    paint();
    breathe();
    const stops = [
      watchTheme(paint),
      watchMedia(forcedColorsQuery, paint),
      watchMedia(reducedMotionQuery, () => setStill(reducedMotionActive())),
      listen(document, "visibilitychange", breathe),
    ];
    onCleanup(() => {
      for (const stop of stops) stop();
    });
  });
  onCleanup(stopBreathing);

  return (
    <Show
      when={portrait()}
      fallback={
        <span class="kw-creature-portrait-missing" role="img" aria-label={props.name}>
          {skinRefusedWord}
        </span>
      }
    >
      {(held) => (
        <canvas
          ref={canvas}
          class="kw-creature-portrait"
          role="img"
          aria-label={`${props.name}, ${portraitClip}`}
          data-skin={held().skin.id}
          data-clip={portraitClip}
          data-frame={frame()}
          data-still={still() ? "" : undefined}
        />
      )}
    </Show>
  );
}

function listen(target: Document, type: string, react: () => void): () => void {
  target.addEventListener(type, react);
  return () => target.removeEventListener(type, react);
}
