import type { Skin } from "@keywork-app/habitat";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import { prefersReducedMotion } from "../chrome/stamp.ts";
import {
  createRenderer,
  loadSkin,
  type Palette,
  type PaletteSource,
  type Renderer,
} from "../panes/stead/habitat-render.ts";
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
  watchSize,
  watchTheme,
} from "../panes/stead/painter.ts";
import { requestFrame } from "../surfaces/runtime/realm.ts";
import {
  type CreaturePose,
  type Cue,
  createPerformance,
  type PlacedShard,
  type Scene,
  type Span,
} from "./choreography.ts";
import {
  eggCentre,
  eggColours,
  eggGroundLine,
  eggHeight,
  eggSprite,
  lightColour,
  paintRoles,
  type RoleColours,
  toneOf,
} from "./egg.ts";
import type { Phase } from "./onboarding.ts";

export interface StageCanvasProps {
  readonly phase: Phase;
  readonly coat: number | undefined;
  readonly skin: string | undefined;
  readonly label: string;
  readonly random?: (() => number) | undefined;
  onMeasure?(measures: StageMeasures): void;
}

export interface StageMeasures {
  readonly floor: number;
  readonly figureTop: number;
  readonly figureWidth: number;
}

export interface StageLayout {
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
  readonly centre: number;
  readonly ground: number;
}

export const figureRoom = Math.round((eggHeight * 4) / 3);
export const figureShare = 0.46;
export const sceneRoom = 150;
export const groundDepth = 14;
export const wordsRoomPx = 150;
export const facing = "right";

export function stageLayout(width: number, height: number, wordsRoom: number): StageLayout {
  const zoom = Math.max(
    1,
    Math.floor(Math.min((height * figureShare) / figureRoom, width / sceneRoom)),
  );
  const composed = (figureRoom + groundDepth) * zoom + wordsRoom;
  const top = Math.max(0, (height - composed) / 2);
  return {
    zoom,
    width,
    height,
    centre: Math.floor(width / 2 / zoom) * zoom,
    ground: Math.round(top / zoom + figureRoom) * zoom,
  };
}

export function StageCanvas(props: StageCanvasProps) {
  let canvas: HTMLCanvasElement | undefined;
  let scratch: HTMLCanvasElement | undefined;
  let backdrop: Backdrop | undefined;
  let palettes: Palettes | undefined;
  let measured = "";
  let cancelNext: () => void = nothing;
  const [reduced, setReduced] = createSignal(prefersReducedMotion());
  const show = createPerformance(props.random ?? Math.random, reduced);
  const look = createMemo(() => lookOf(props.skin));
  const cue = createMemo(() => cueOf(props.phase));

  const paint = (): void => {
    cancelNext();
    const held = canvas;
    if (held === undefined) return;
    const layout = fit(held);
    const worn = look();
    const scene = show.sceneAt(performance.now(), {
      rows: worn?.skin.rows,
      halfWidth: Math.ceil((worn?.skin.cell.width ?? 0) / 2),
      reach: Math.ceil(layout.width / 2 / layout.zoom),
    });
    describe(held, scene, props.coat);
    props.onMeasure?.(measuresOf(layout, devicePixelRatioOf(held)));
    draw(held, layout, scene, worn);
    cancelNext = waitFor(held, scene.rests, paint);
  };

  const fit = (held: HTMLCanvasElement): StageLayout => {
    const dpr = devicePixelRatioOf(held);
    const room = held.parentElement ?? held;
    const width = Math.floor(room.clientWidth * dpr);
    const height = Math.floor(room.clientHeight * dpr);
    const size = `${width}x${height}`;
    if (size !== measured) {
      measured = size;
      held.width = width;
      held.height = height;
      held.style.width = `${width / dpr}px`;
      held.style.height = `${height / dpr}px`;
    }
    return stageLayout(width, height, wordsRoomPx * dpr);
  };

  const draw = (
    held: HTMLCanvasElement,
    layout: StageLayout,
    scene: Scene,
    worn: Look | undefined,
  ): void => {
    const context = held.getContext("2d");
    if (context === null || layout.width === 0 || layout.height === 0) return;
    const forced = forcedColorsActive(held);
    const source = paletteSourceOf(held);
    palettes = palettesOf(source, "day", undefined, forced, palettes);
    const coat = props.coat === undefined ? undefined : palettes.coat(props.coat);
    const light = lightColour(forced);
    context.imageSmoothingEnabled = false;
    backdrop = backdropFor(held, layout, palettes, source, forced, backdrop);
    context.drawImage(backdrop.canvas, 0, 0);
    drawLight(context, layout, scene.light, light);
    if (coat === undefined) return;
    const shell = eggColours(coat, source, forced);
    drawShards(context, layout, scene.shards, shell);
    if (scene.egg !== undefined) {
      const left = layout.centre + (scene.egg.shift - eggCentre) * layout.zoom;
      const top = layout.ground - (eggGroundLine + scene.egg.lift) * layout.zoom;
      paintRoles(surfaceOf(context), eggSprite(scene.egg.frame), shell, layout.zoom, left, top);
    }
    if (scene.creature !== undefined && worn !== undefined) {
      scratch ??= held.ownerDocument.createElement("canvas");
      drawCreature(context, scratch, layout, worn, scene.creature, coat, light);
    }
  };

  createEffect(
    on(cue, (heard, before) => {
      const resumed = heard === "met" && before === undefined;
      if (heard !== undefined && !resumed) show.cue(heard, performance.now());
      paint();
    }),
  );
  createEffect(
    on(look, (_now, before) => {
      if (before !== undefined && props.phase.kind === "meet") {
        show.cue("turned", performance.now());
      }
      paint();
    }),
  );
  createEffect(on([() => props.coat, reduced], paint, { defer: true }));
  onMount(() => {
    const held = canvas;
    if (held === undefined) return;
    const stops = [
      watchTheme(paint, held),
      watchMedia(forcedColorsQuery, paint, held),
      watchMedia(reducedMotionQuery, () => setReduced(prefersReducedMotion()), held),
      watchSize(held.parentElement ?? held, paint),
    ];
    onCleanup(() => {
      for (const stop of stops) stop();
    });
  });
  onCleanup(() => cancelNext());

  return (
    <canvas
      class="kw-hatch-canvas"
      role="img"
      aria-label={props.label}
      ref={(element) => {
        canvas = element;
      }}
    />
  );
}

interface Look {
  readonly skin: Skin;
  readonly render: Renderer;
}

const nothing = (): void => undefined;
const frameMs = 16;
const glow = { reach: 112, rise: 74, levels: 5, dithersFrom: 0.6 } as const;
const groundRows = [
  { rows: 1, role: "ground highlight" },
  { rows: groundDepth - 3, role: "ground base" },
  { rows: 2, role: "ground shadow" },
] as const;

interface Backdrop {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
}

function lookOf(id: string | undefined): Look | undefined {
  const loaded = id === undefined ? undefined : loadSkin(id);
  return loaded?.ok ? { skin: loaded.skin, render: createRenderer(loaded.skin) } : undefined;
}

function cueOf(phase: Phase): Cue | undefined {
  if (phase.kind === "egg") return "egg";
  if (phase.kind === "hatching") return phase.beat;
  return phase.kind === "meet" ? "met" : undefined;
}

function describe(canvas: HTMLCanvasElement, scene: Scene, coat: number | undefined): void {
  const shows =
    scene.creature !== undefined ? "creature" : scene.egg !== undefined ? "egg" : "nothing";
  canvas.dataset.shows = coat === undefined ? "nothing" : shows;
  canvas.dataset.frame = scene.creature?.clip ?? scene.egg?.frame ?? "";
}

function measuresOf(layout: StageLayout, dpr: number): StageMeasures {
  return {
    floor: (layout.ground + groundDepth * layout.zoom) / dpr,
    figureTop: (layout.ground - figureRoom * layout.zoom) / dpr,
    figureWidth: (figureRoom * layout.zoom) / dpr,
  };
}

function waitFor(canvas: HTMLCanvasElement, rests: number, paint: () => void): () => void {
  if (!Number.isFinite(rests)) return nothing;
  if (rests <= frameMs) return requestFrame(canvas, paint);
  const timer = setTimeout(paint, rests);
  return () => clearTimeout(timer);
}

function backdropFor(
  stage: HTMLCanvasElement,
  layout: StageLayout,
  palettes: Palettes,
  source: PaletteSource,
  forced: boolean,
  held: Backdrop | undefined,
): Backdrop {
  const key = [layout.width, layout.height, layout.zoom, layout.ground, palettes.key].join(":");
  if (held?.key === key) return held;
  const canvas = held?.canvas ?? stage.ownerDocument.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const context = canvas.getContext("2d");
  if (context !== null) paintBackdrop(context, layout, palettes, source, forced);
  return { key, canvas };
}

function paintBackdrop(
  context: CanvasRenderingContext2D,
  layout: StageLayout,
  palettes: Palettes,
  source: PaletteSource,
  forced: boolean,
): void {
  const { zenith, horizon } = palettes.sky;
  context.fillStyle = zenith;
  context.fillRect(0, 0, layout.width, layout.height);
  if (!forced)
    paintGlow(context, layout, (level) => source.mix(zenith, horizon, level / glow.levels));
  let row = layout.ground;
  for (const strip of groundRows) {
    context.fillStyle = toneOf(palettes.world, strip.role);
    context.fillRect(0, row, layout.width, strip.rows * layout.zoom);
    row += strip.rows * layout.zoom;
  }
}

function paintGlow(
  context: CanvasRenderingContext2D,
  layout: StageLayout,
  colourOf: (level: number) => string,
): void {
  const colours = Array.from({ length: glow.levels + 1 }, (_, level) => colourOf(level));
  for (let up = 0; up < glow.rise; up += 1) {
    let from = -glow.reach;
    while (from < glow.reach) {
      const level = glowAt(from, up);
      let to = from + 1;
      while (to < glow.reach && glowAt(to, up) === level) to += 1;
      if (level > 0) {
        context.fillStyle = colours[level] ?? "";
        context.fillRect(
          layout.centre + from * layout.zoom,
          layout.ground - (up + 1) * layout.zoom,
          (to - from) * layout.zoom,
          layout.zoom,
        );
      }
      from = to;
    }
  }
}

function glowAt(across: number, up: number): number {
  const far = Math.hypot((across + 0.5) / glow.reach, (up + 0.5) / glow.rise);
  const strength = Math.max(0, 1 - far) * glow.levels;
  const level = Math.floor(strength);
  const dithered = strength - level >= glow.dithersFrom && (across + up) % 2 === 0;
  return Math.min(glow.levels, level + (dithered ? 1 : 0));
}

function drawLight(
  context: CanvasRenderingContext2D,
  layout: StageLayout,
  spans: readonly Span[],
  light: string,
): void {
  context.fillStyle = light;
  for (const span of spans) {
    const left = layout.centre + span.from * layout.zoom;
    context.fillRect(left, layout.ground, (span.to - span.from) * layout.zoom, layout.zoom);
  }
}

function drawShards(
  context: CanvasRenderingContext2D,
  layout: StageLayout,
  shards: readonly PlacedShard[],
  colours: RoleColours,
): void {
  for (const shard of shards) {
    const left = layout.centre + shard.left * layout.zoom;
    const top = layout.ground + shard.top * layout.zoom;
    paintRoles(surfaceOf(context), shard.sprite, colours, layout.zoom, left, top, shard.thin);
  }
}

function drawCreature(
  context: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  layout: StageLayout,
  look: Look,
  pose: CreaturePose,
  coat: Palette,
  light: string,
): void {
  const { cell, groundLine, rows } = look.skin;
  const frame = Math.min(pose.frame, rows[pose.clip].frames - 1);
  const rendered = look.render({ clip: pose.clip, frame, facing }, coat, { scale: layout.zoom });
  const left = layout.centre - Math.floor(cell.width / 2) * layout.zoom;
  const top = layout.ground - (groundLine + pose.lift) * layout.zoom;
  if (!pose.asLight) {
    rendered.paint(surfaceOf(context), left, top);
    return;
  }
  const shape = scratch.getContext("2d");
  if (shape === null) return;
  scratch.width = rendered.width;
  scratch.height = rendered.height;
  rendered.paint(surfaceOf(shape), 0, 0);
  shape.globalCompositeOperation = "source-in";
  shape.fillStyle = light;
  shape.fillRect(0, 0, scratch.width, scratch.height);
  context.drawImage(scratch, left, top);
}
