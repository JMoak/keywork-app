import type { HabitatState, PowerTier } from "@keywork-app/habitat";
import {
  type Appearance,
  type BlockPalette,
  type BlockScene,
  backdropOf,
  blockScene,
  type DrawList,
  drawList,
  firefliesOf,
  firstKit,
  forcedBlockPalette,
  type Hit,
  hitAt,
  type Kit,
  kitNamed,
  kits,
  levelEye,
  monumentFor,
  moves,
  type Picture,
  type ProjectSite,
  type Quad,
  raisedEye,
  resolveBlockPalette,
  sideNameOf,
  tickMs,
  viewOf,
} from "@keywork-app/habitat/block";
import "./block.css";
import { createEffect, createMemo, createSignal, For, on, onCleanup, onMount } from "solid-js";
import { inWindowOf, nothing } from "../../../surfaces/runtime/realm.ts";
import { browserFieldHost, type FieldPicture, steadField } from "../field.ts";
import {
  devicePixelRatioOf,
  forcedColorsActive,
  forcedColorsQuery,
  paletteSourceOf,
  reducedMotionActive,
  reducedMotionQuery,
  watchMedia,
  watchSize,
  watchTheme,
} from "../painter.ts";
import {
  type CameraMotion,
  cameraAt,
  cornered,
  eyeFor,
  lifted,
  moving,
  restAngle,
  settled,
  stillMotion,
  turned,
} from "./motion.ts";
import { paintPicture, textureCache } from "./paint.ts";

export interface BlockWorldProps {
  readonly world: HabitatState;
  readonly focused: boolean;
  readonly hidden: boolean;
  readonly projects?: Readonly<Record<string, readonly ProjectSite[]>> | undefined;
  readonly onPick?: ((hit: Hit) => void) | undefined;
  readonly onHover?: ((hit: Hit | undefined) => void) | undefined;
  readonly onControls?: ((controls: BlockWorldControls) => void) | undefined;
}

export interface BlockWorldControls {
  turn(steps: number): void;
}

export interface DeviceSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export const sceneRefreshMs = 60_000;

export function deviceSizeOf(cssWidth: number, cssHeight: number, dpr: number): DeviceSize {
  return {
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr)),
    dpr,
  };
}

export function artPointOf(
  list: DrawList,
  size: DeviceSize,
  cssX: number,
  cssY: number,
): { x: number; y: number } {
  return { x: (cssX * size.dpr) / list.view.scale, y: (cssY * size.dpr) / list.view.scale };
}

export function samePicture(a: Picture | undefined, b: Picture): boolean {
  if (a === undefined) return false;
  if (a.list.quads.length !== b.list.quads.length || a.lights.length !== b.lights.length) {
    return false;
  }
  if (a.list.view.width !== b.list.view.width || a.list.view.height !== b.list.view.height) {
    return false;
  }
  return (
    a.list.quads.every((quad, index) => sameQuad(quad, b.list.quads[index])) &&
    a.lights.every((light, index) => {
      const other = b.lights[index];
      return (
        other !== undefined &&
        light.x === other.x &&
        light.y === other.y &&
        light.alpha === other.alpha
      );
    })
  );
}

export function tickAt(now: number, reduced: boolean): number {
  return reduced ? 0 : Math.floor(now / tickMs);
}

export function BlockWorld(props: BlockWorldProps) {
  let stage: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const [refreshedAt, setRefreshedAt] = createSignal(Date.now());
  const [kitId, setKitId] = createSignal(firstKit.id);
  const [appearance, setAppearance] = createSignal<Appearance>("night");
  const [manualEye, setManualEye] = createSignal<number>();
  const [side, setSide] = createSignal("front");
  const kit = (): Kit => kitNamed(kitId()) ?? firstKit;
  const scene = createMemo<BlockScene>(() =>
    blockScene(props.world, {
      kit: kit(),
      appearance: appearance(),
      now: refreshedAt(),
      projects: props.projects,
      monument: monumentFor(Object.keys(props.world.creatures).length),
    }),
  );
  const eyeWanted = (): number => manualEye() ?? eyeFor(scene().residents.length);
  let motion: CameraMotion = stillMotion(0, eyeWanted());
  let palette: BlockPalette | undefined;
  let shown: { picture: Picture; theme: string } | undefined;
  let size: DeviceSize = { width: 1, height: 1, dpr: 1 };
  let lastInputAt = Number.NEGATIVE_INFINITY;
  let hovered: Hit | undefined;

  const readTheme = (): BlockPalette => {
    const source = paletteSourceOf(stage ?? document.documentElement);
    const seen: Appearance = source.appearance === "light" ? "day" : "night";
    setAppearance(seen);
    const made = forcedColorsActive(stage)
      ? forcedBlockPalette(kit(), seen)
      : resolveBlockPalette(kit(), seen, source.read("--kw-background"));
    palette = made;
    return made;
  };
  const paletteNow = (): BlockPalette =>
    palette?.key.startsWith(`${kit().id}|`) ? palette : readTheme();
  const cache = textureCache(paletteNow);

  const draw = (now: number, _tier: PowerTier): FieldPicture => {
    const reduced = reducedMotionActive();
    motion = settled(lifted(motion, eyeWanted(), now, reduced), now);
    const world = scene().world;
    const colours = kit().colours[appearance()];
    const tick = tickAt(now, reduced);
    if (stage !== undefined) {
      size = deviceSizeOf(stage.clientWidth, stage.clientHeight, devicePixelRatioOf(stage));
    }
    const view = viewOf(world, size.width, size.height, motion.eye);
    const list = drawList(world, cameraAt(motion, now), view, tick, colours.haze);
    const picture: Picture = {
      list,
      backdrop: backdropOf(colours, view),
      lights: firefliesOf(colours, view, list.pivot.y, tick),
    };
    paint(picture);
    const turning = moving(motion, now);
    const alive = !reduced && (moves(world) || picture.lights.length > 0);
    const next = turning ? now : alive ? (tick + 1) * tickMs : undefined;
    return { nextWakeAt: next, still: !turning && !alive };
  };

  const paint = (picture: Picture): void => {
    if (canvas === undefined) return;
    const colours = paletteNow();
    if (shown !== undefined && shown.theme === colours.key && samePicture(shown.picture, picture)) {
      return;
    }
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    canvas.style.width = `${size.width / size.dpr}px`;
    canvas.style.height = `${size.height / size.dpr}px`;
    const context = canvas.getContext("2d");
    if (context === null) return;
    paintPicture(context, picture, colours, cache);
    shown = { picture, theme: colours.key };
  };

  const loop = steadField(
    browserFieldHost(() => stage),
    {
      hidden: () => props.hidden || documentHidden(stage),
      resting: () => !props.focused,
      lastInputAt: () => lastInputAt,
    },
    draw,
  );

  const nudge = (): void => {
    lastInputAt = Date.now();
    setSide(motion.corner ? "corner" : sideNameOf(restAngle(motion)));
    loop.request();
  };
  const turn = (steps: number): void => {
    motion = turned(motion, steps, Date.now(), reducedMotionActive());
    nudge();
  };
  const toggleCorner = (): void => {
    motion = cornered(motion, !motion.corner, Date.now(), reducedMotionActive());
    nudge();
  };
  props.onControls?.({ turn });

  const hitUnder = (event: MouseEvent): Hit | undefined => {
    if (shown === undefined || canvas === undefined) return undefined;
    const rect = canvas.getBoundingClientRect();
    const point = artPointOf(
      shown.picture.list,
      size,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
    return hitAt(shown.picture.list, point.x, point.y);
  };

  const rethemed = (): void => {
    readTheme();
    loop.request();
  };

  onMount(() => {
    readTheme();
    loop.redraw();
    const stops = [
      watchTheme(rethemed, stage),
      watchMedia(forcedColorsQuery, rethemed, stage),
      watchMedia(reducedMotionQuery, () => loop.request(), stage),
      stage === undefined ? nothing : watchSize(stage, () => loop.request()),
      watchVisibility(stage, () => loop.request()),
    ];
    const refresh = setInterval(() => {
      if (!props.hidden && !documentHidden(stage)) setRefreshedAt(Date.now());
    }, sceneRefreshMs);
    onCleanup(() => {
      clearInterval(refresh);
      for (const stop of stops) stop();
    });
  });
  createEffect(
    on([scene, () => props.hidden, () => props.focused], () => loop.request(), { defer: true }),
  );
  onCleanup(loop.stop);

  return (
    <div class="kw-stead-block-frame" hidden={props.hidden}>
      <div class="kw-stead-block-controls" data-native-activation>
        <For each={kits}>
          {(each) => (
            <button
              type="button"
              aria-pressed={kitId() === each.id}
              onClick={() => {
                setKitId(each.id);
                readTheme();
                nudge();
              }}
            >
              {each.name}
            </button>
          )}
        </For>
        <button
          type="button"
          aria-pressed={eyeWanted() === levelEye}
          onClick={() => {
            setManualEye(levelEye);
            nudge();
          }}
        >
          Level eye
        </button>
        <button
          type="button"
          aria-pressed={eyeWanted() === raisedEye}
          onClick={() => {
            setManualEye(raisedEye);
            nudge();
          }}
        >
          Raised eye
        </button>
        <button type="button" aria-pressed={side() === "corner"} onClick={toggleCorner}>
          Rest on corners
        </button>
      </div>
      <div
        class="kw-stead-block"
        ref={stage}
        role="application"
        aria-roledescription="block world"
        aria-label={`the stead seen from the ${side()}; left and right arrows turn it`}
        data-side={side()}
        data-kit={kitId()}
        onPointerMove={(event) => {
          lastInputAt = Date.now();
          const hit = hitUnder(event);
          if (!sameHit(hit, hovered)) {
            hovered = hit;
            props.onHover?.(hit);
          }
        }}
        onPointerLeave={() => {
          hovered = undefined;
          props.onHover?.(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || hovered === undefined) return;
          event.preventDefault();
          hovered = undefined;
          props.onHover?.(undefined);
        }}
        onClick={(event) => {
          const hit = hitUnder(event);
          if (hit !== undefined) props.onPick?.(hit);
        }}
      >
        <canvas class="kw-stead-block-canvas" ref={canvas} />
      </div>
    </div>
  );
}

function sameQuad(a: Quad, b: Quad | undefined): boolean {
  return (
    b !== undefined &&
    paintKey(a) === paintKey(b) &&
    a.ramp === b.ramp &&
    a.light === b.light &&
    a.fog === b.fog &&
    a.haze === b.haze &&
    a.width === b.width &&
    a.height === b.height &&
    a.matrix.every((value, index) => value === b.matrix[index])
  );
}

function paintKey(quad: Quad): string {
  return "texture" in quad.paint ? quad.paint.texture.key : `fill ${quad.paint.fill}`;
}

function sameHit(a: Hit | undefined, b: Hit | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function documentHidden(pane: Node | undefined): boolean {
  return (
    typeof document !== "undefined" &&
    (pane?.ownerDocument ?? document).visibilityState === "hidden"
  );
}

function watchVisibility(pane: Node | undefined, react: () => void): () => void {
  return inWindowOf(pane ?? document, (realm) => {
    realm.document.addEventListener("visibilitychange", react);
    return () => realm.document.removeEventListener("visibilitychange", react);
  });
}
