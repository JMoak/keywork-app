import type { PoseName, Skin } from "@keywork-app/habitat";
import { aspects, front } from "@keywork-app/habitat/block";
import { gazeTurns } from "@keywork-app/habitat/skins";
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
import { pinMedal } from "./medal.ts";
import { aspectAtRise } from "./risen.ts";

export const portraitSize = 2;
export const portraitClip = "idle";
export const turnedClip = "look";

export interface PortraitProps {
  skin: string;
  hueStop: number;
  name: string;
  size?: number | undefined;
  medal?: boolean | undefined;
}

export interface Portrait {
  readonly skin: Skin;
  readonly render: Renderer;
}

export function portraitOf(id: string): Portrait | undefined {
  const loaded = loadSkin(id);
  return loaded.ok ? { skin: loaded.skin, render: createRenderer(loaded.skin) } : undefined;
}

export interface PortraitPose {
  readonly clip: PoseName;
  readonly frame: number;
  readonly word: string;
}

export function turnedPose(aspect: number | undefined): PortraitPose | undefined {
  const side = aspect === undefined || aspect === front ? undefined : aspects[aspect];
  if (aspect === undefined || side === undefined) return undefined;
  return {
    clip: turnedClip,
    frame: gazeTurns.indexOf(aspect),
    word: `from the ${side.replace("-", " ")}`,
  };
}

export function idleFrameAfter(skin: Skin, frame: number): { frame: number; ms: number } {
  const row = skin.rows[portraitClip];
  const next = (frame + 1) % row.frames;
  return { frame: next, ms: row.ms[next] ?? row.ms[0] ?? 500 };
}

export function PortraitView(props: PortraitProps) {
  let canvas: HTMLCanvasElement | undefined;
  const portrait = createMemo(() => portraitOf(props.skin));
  const seen = aspectAtRise(props.skin, props.name);
  const turned = turnedPose(seen);
  const [frame, setFrame] = createSignal(0);
  const [still, setStill] = createSignal(turned !== undefined || reducedMotionActive());
  const pose = (): PortraitPose =>
    turned ?? { clip: portraitClip, frame: frame(), word: portraitClip };
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
    const scale = scaleFor(dpr, props.size ?? portraitSize);
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
    const { clip, frame: shown } = pose();
    const drawn = held.render({ clip, frame: shown, facing: "right" }, palette, { scale });
    drawn.paint(surface, 0, 0);
    if (props.medal === true) pinMedal(surface, drawn.indexed, palette, scale, seen);
  };

  createEffect(
    on([portrait, frame, () => props.hueStop, () => props.size, () => props.medal], paint, {
      defer: true,
    }),
  );
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
      watchMedia(reducedMotionQuery, () => setStill(turned !== undefined || reducedMotionActive())),
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
          aria-label={`${props.name}, ${pose().word}`}
          data-skin={held().skin.id}
          data-clip={pose().clip}
          data-frame={pose().frame}
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
