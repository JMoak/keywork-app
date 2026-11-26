import type { PowerTier } from "@keywork-app/habitat";
import {
  type Appearance,
  type ArtRect,
  type BlockPalette,
  backdropOf,
  type Camera,
  drawList,
  drawnLands,
  firefliesOf,
  forcedBlockPalette,
  type JourneyPlan,
  journeyFrame,
  journeyMs,
  type Kit,
  type Land,
  type LandList,
  landAt,
  landRectsOf,
  type MapChange,
  type MapScene,
  mapChangesBetween,
  mapScene,
  type Picture,
  type Point,
  projectorOf,
  type Ring,
  raisedEye,
  resolveBlockPalette,
  restCamera,
  shiftedList,
  standingFor,
  tickMs,
  type View,
  viewOf,
  type Way,
} from "@keywork-app/habitat/block";
import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from "solid-js";
import type { Rect } from "../../../layout/index.ts";
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
import { type DeviceSize, deviceSizeOf, type TownLook, tickAt } from "./block-world.tsx";
import { LandCard } from "./land-card.tsx";
import "./map.css";
import {
  type CameraMotion,
  cameraAt,
  cornered,
  moving,
  settled,
  stillMotion,
  turned,
} from "./motion.ts";
import { paintPicture, textureCache } from "./paint.ts";
import { type Arrival, arrivalOf, arrived, paintArrival, snapshotOf } from "./transition.ts";

export interface MapWorldProps {
  readonly kit: Kit;
  readonly light?: Appearance | undefined;
  readonly lands: readonly Land[];
  readonly look: () => TownLook | undefined;
  readonly side: string;
  readonly focused: boolean;
  readonly creatures: number;
  readonly product: string;
  readonly onControls?: ((controls: MapControls) => void) | undefined;
  readonly onPress: (land: Land) => void;
  readonly onLeft: () => void;
}

export interface MapControls {
  step(by: number): void;
  press(): void;
  stepIn(): void;
}

export const nearbyRing = { from: 5, to: 130, ms: 800 } as const;
export const wholeRing = { from: 44, reach: 1.25 } as const;

interface Journey extends JourneyPlan {
  readonly startedAt: number;
  readonly arrival: Arrival<Way>;
}

interface Layout {
  readonly rects: ReadonlyMap<string, ArtRect>;
  readonly cssPerArt: number;
  readonly width: number;
  readonly height: number;
}

export function MapWorld(props: MapWorldProps) {
  let stage: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const [themed, setThemed] = createSignal<Appearance>("night");
  const appearance = (): Appearance => props.light ?? themed();
  const [cursor, setCursor] = createSignal<string>();
  const [pointed, setPointed] = createSignal<string>();
  const [layout, setLayout] = createSignal<Layout>({
    rects: new Map(),
    cssPerArt: 1,
    width: 1,
    height: 1,
  });
  const scene = createMemo<MapScene | undefined>(() => {
    const look = props.look();
    if (look === undefined) return undefined;
    return mapScene({
      kit: props.kit,
      appearance: appearance(),
      town: look.world,
      lands: props.lands,
    });
  });
  const opening = props.look()?.motion;
  let motion: CameraMotion = stillMotion(
    opening?.quarter ?? 0,
    raisedEye,
    opening?.corner === true,
  );
  let palette: BlockPalette | undefined;
  let size: DeviceSize = { width: 1, height: 1, dpr: 1 };
  let journey: Journey | undefined;
  let leaving = false;
  let arrival: Arrival<MapChange> | undefined;
  let painted: MapScene | undefined;
  let drawn: LandList | undefined;
  let lastInputAt = Number.NEGATIVE_INFINITY;
  const before = document.createElement("canvas");

  const readTheme = (): BlockPalette => {
    const source = paletteSourceOf(stage ?? document.documentElement);
    setThemed(source.appearance === "light" ? "day" : "night");
    const made = forcedColorsActive(stage)
      ? forcedBlockPalette(props.kit, appearance())
      : resolveBlockPalette(props.kit, appearance());
    palette = made;
    return made;
  };
  const paletteNow = (): BlockPalette =>
    palette?.key.startsWith(`${props.kit.id}|${appearance()}|`) ? palette : readTheme();
  const cache = textureCache(paletteNow);

  const draw = (now: number, _tier: PowerTier): FieldPicture => {
    const reduced = reducedMotionActive();
    const look = props.look();
    const map = scene();
    if (stage !== undefined) {
      size = deviceSizeOf(stage.clientWidth, stage.clientHeight, devicePixelRatioOf(stage));
    }
    if (look === undefined || map === undefined || canvas === undefined) {
      return { nextWakeAt: undefined, still: true };
    }
    motion = settled(followed(motion, look.motion, now, reduced), now);
    if (journey === undefined && !painted && !reduced) journey = begun("back", look, map, now);
    if (journey !== undefined) {
      if (reduced) journey = finished(journey);
      else return travel(journey, look, map, now);
    }
    const view = viewOf(map.world, size.width, size.height, raisedEye, { corners: motion.corner });
    const camera = cameraAt(motion, now);
    if (arrival !== undefined && arrived(arrival, now)) arrival = undefined;
    if (!reduced) arrival = arriving(map, camera, view, now) ?? arrival;
    if (reduced) arrival = undefined;
    const tick = tickAt(now, reduced);
    const colours = props.kit.colours[appearance()];
    drawn = drawnLands(map.world, map.owners, camera, view, tick, colours.haze, {
      standing: standingFor(map.world, restCamera(motion.quarter, raisedEye, motion.corner)),
    });
    const picture: Picture = {
      list: drawn.list,
      backdrop: backdropOf(colours, view),
      lights: firefliesOf(colours, view, drawn.list.pivot.y, tick),
    };
    paintOnto(canvas, picture);
    if (arrival !== undefined) paintRing(arrival, arrival.ring, now, view.scale);
    painted = map;
    settleLayout(drawn);
    const turning = moving(motion, now) || arrival !== undefined;
    const alive = !reduced && picture.lights.length > 0;
    return {
      nextWakeAt: turning ? now : alive ? (tick + 1) * tickMs : undefined,
      still: !turning && !alive,
    };
  };

  const begun = (way: Way, look: TownLook, map: MapScene, now: number): Journey => {
    const corners = { corners: look.motion.corner };
    return {
      way,
      startedAt: now,
      townScale: viewOf(look.world, size.width, size.height, look.motion.eye, corners).scale,
      mapScale: viewOf(map.world, size.width, size.height, raisedEye, corners).scale,
      townEye: look.motion.eye,
      arrival: arrivalOf(way, journeyRing, now, before),
    };
  };

  const finished = (held: Journey): undefined => {
    if (held.way === "in") props.onLeft();
    return undefined;
  };

  const travel = (held: Journey, look: TownLook, map: MapScene, now: number): FieldPicture => {
    const frame = journeyFrame(held, now - held.startedAt);
    if (frame.over) {
      journey = finished(held);
      painted = map;
      return { nextWakeAt: now, still: false };
    }
    const colours = props.kit.colours[appearance()];
    const camera: Camera = { angle: cameraAt(motion, now).angle, eye: frame.eye };
    const corners = { corners: motion.corner };
    const scaled = (view: View): View => ({ ...view, scale: frame.scale });
    const mapView = scaled(viewOf(map.world, size.width, size.height, frame.eye, corners));
    const townView = scaled(viewOf(look.world, size.width, size.height, frame.eye, corners));
    const onMap = projectorOf(map.world, camera, mapView);
    const onTown = projectorOf(look.world, camera, townView);
    const [mx, my] = onMap(0, 0, 0);
    const [tx, ty] = onTown(0, 0, 0);
    const dx = Math.round((tx - mx) * (1 - frame.shift));
    const dy = Math.round((ty - my) * (1 - frame.shift));
    const tick = tickAt(now, false);
    const mapList = shiftedList(
      drawnLands(map.world, map.owners, camera, mapView, tick, colours.haze).list,
      dx,
      dy,
    );
    const townList = shiftedList(
      drawList(look.world, camera, townView, tick, colours.haze),
      dx - (tx - mx),
      dy - (ty - my),
    );
    const mapPicture: Picture = {
      list: mapList,
      backdrop: backdropOf(colours, mapView),
      lights: firefliesOf(colours, mapView, mapList.pivot.y, tick),
    };
    const townPicture: Picture = {
      list: townList,
      backdrop: backdropOf(colours, townView),
      lights: firefliesOf(colours, townView, townList.pivot.y, tick),
    };
    const [after, outside] =
      held.way === "back" ? [mapPicture, townPicture] : [townPicture, mapPicture];
    if (canvas !== undefined) paintOnto(canvas, after);
    paintOnto(before, outside);
    const centre = onMap(middle(map).x, 0, middle(map).z);
    const across = Math.max(size.width, size.height) * wholeRing.reach;
    paintRing(
      held.arrival,
      {
        x: centre[0] + dx,
        y: centre[1] + dy,
        from: (wholeRing.from * held.mapScale) / frame.scale,
        to: across / frame.scale,
        local: false,
        delayMs: 0,
        ms: journeyMs,
      },
      now,
      frame.scale,
    );
    if (layout().rects.size > 0) setLayout({ ...layout(), rects: new Map() });
    return { nextWakeAt: now, still: false };
  };

  const arriving = (
    map: MapScene,
    camera: Camera,
    view: View,
    now: number,
  ): Arrival<MapChange> | undefined => {
    if (painted === undefined || painted === map || canvas === undefined) return undefined;
    if (homeOf(painted) !== homeOf(map)) return undefined;
    const change = mapChangesBetween(painted, map)[0];
    if (change === undefined) return undefined;
    const snapshot = snapshotOf(canvas);
    if (snapshot === undefined) return undefined;
    const [x, y] = projectorOf(map.world, camera, view)(change.at.x, 0, change.at.z);
    const reframed = drawn !== undefined && drawn.list.view.scale !== view.scale;
    const across = (Math.max(view.width, view.height) / view.scale) * wholeRing.reach;
    const ring: Ring = reframed
      ? { x, y, from: nearbyRing.from, to: across, local: false, delayMs: 0, ms: journeyMs }
      : { x, y, ...nearbyRing, local: true, delayMs: 0 };
    return arrivalOf(change, ring, now, snapshot);
  };

  const paintOnto = (target: HTMLCanvasElement, picture: Picture): void => {
    if (target.width !== size.width) target.width = size.width;
    if (target.height !== size.height) target.height = size.height;
    if (target === canvas) {
      target.style.width = `${size.width / size.dpr}px`;
      target.style.height = `${size.height / size.dpr}px`;
    }
    const context = target.getContext("2d");
    if (context !== null) paintPicture(context, picture, paletteNow(), cache);
  };

  const paintRing = (held: Arrival<unknown>, ring: Ring, now: number, scale: number): void => {
    const context = canvas?.getContext("2d");
    if (context === null || context === undefined) return;
    const colours = paletteNow();
    const glow = colours.colourOf("lampHi", undefined) ?? colours.background;
    paintArrival(context, { ...held, ring }, now, scale, glow);
  };

  const settleLayout = (list: LandList): void => {
    const next: Layout = {
      rects: landRectsOf(list),
      cssPerArt: list.list.view.scale / size.dpr,
      width: size.width / size.dpr,
      height: size.height / size.dpr,
    };
    if (!sameLayout(layout(), next)) setLayout(next);
  };

  const loop = steadField(
    browserFieldHost(() => stage),
    {
      hidden: () => documentHidden(stage),
      resting: () => !props.focused,
      lastInputAt: () => lastInputAt,
    },
    draw,
  );

  const landNamed = (id: string | undefined): Land | undefined =>
    id === undefined ? undefined : props.lands.find((land) => land.id === id);
  const press = (land: Land | undefined): void => {
    if (land === undefined) return;
    setCursor(land.id);
    if (land.kind === "home") stepIn();
    else props.onPress(land);
  };
  const stepIn = (): void => {
    const look = props.look();
    const map = scene();
    if (leaving || look === undefined || map === undefined) return;
    leaving = true;
    lastInputAt = Date.now();
    if (reducedMotionActive()) {
      props.onLeft();
      return;
    }
    journey = begun("in", look, map, Date.now());
    loop.request();
  };
  const step = (by: number): void => {
    const all = props.lands;
    if (all.length === 0) return;
    const at = all.findIndex((land) => land.id === cursor());
    const next = at < 0 ? (by > 0 ? 0 : all.length - 1) : (at + by + all.length) % all.length;
    setCursor(all[next]?.id);
  };
  props.onControls?.({ step, press: () => press(landNamed(cursor()) ?? props.lands[0]), stepIn });

  const carded = createMemo(() => {
    const id = pointed() ?? cursor();
    const land = landNamed(id);
    const rect = id === undefined ? undefined : onStage(layout(), id);
    return land === undefined || rect === undefined
      ? undefined
      : { land, rect, held: id === cursor() };
  });
  const cursorRect = (): Rect | undefined => {
    const id = cursor();
    return id === undefined || !props.focused ? undefined : onStage(layout(), id);
  };

  const landUnder = (event: MouseEvent): Land | undefined => {
    if (drawn === undefined || canvas === undefined || event.target !== canvas) return undefined;
    if (journey !== undefined) return undefined;
    const rect = canvas.getBoundingClientRect();
    const scale = drawn.list.view.scale;
    const x = ((event.clientX - rect.left) * size.dpr) / scale;
    const y = ((event.clientY - rect.top) * size.dpr) / scale;
    return landNamed(landAt(drawn, x, y));
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
      stage === undefined ? () => undefined : watchSize(stage, () => loop.request()),
    ];
    onCleanup(() => {
      for (const stop of stops) stop();
    });
  });
  createEffect(
    on([scene, () => props.side, () => props.focused], () => loop.request(), { defer: true }),
  );
  createEffect(on([() => props.kit, () => props.light], rethemed, { defer: true }));
  onCleanup(loop.stop);

  return (
    <div
      class="kw-stead-block kw-stead-map"
      ref={stage}
      role="application"
      aria-roledescription="map"
      aria-label={`the map of your machines seen from the ${props.side}; left and right arrows turn it, m steps into the town`}
      data-side={props.side}
      data-kit={props.kit.id}
      data-lands={props.lands.length}
      data-hit={pointed() === undefined ? undefined : ""}
      onPointerMove={(event) => {
        lastInputAt = Date.now();
        setPointed(landUnder(event)?.id);
      }}
      onPointerLeave={() => setPointed(undefined)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || pointed() === undefined) return;
        event.preventDefault();
        setPointed(undefined);
      }}
      onClick={(event) => press(landUnder(event))}
    >
      <canvas class="kw-stead-block-canvas" ref={canvas} />
      <Show when={cursorRect()}>
        {(rect) => (
          <span
            class="kw-stead-cursor"
            data-land={cursor()}
            aria-hidden="true"
            style={{
              left: `${rect().x - 3}px`,
              top: `${rect().y - 3}px`,
              width: `${rect().width + 6}px`,
              height: `${rect().height + 6}px`,
            }}
          />
        )}
      </Show>
      <Show when={carded()}>
        {(card) => (
          <LandCard
            land={card().land}
            rect={card().rect}
            stage={layout()}
            held={card().held}
            creatures={props.creatures}
            product={props.product}
          />
        )}
      </Show>
    </div>
  );
}

const journeyRing: Ring = { x: 0, y: 0, from: 0, to: 0, local: false, delayMs: 0, ms: journeyMs };

function followed(
  motion: CameraMotion,
  town: CameraMotion,
  now: number,
  reduced: boolean,
): CameraMotion {
  const turnedToo =
    town.quarter === motion.quarter
      ? motion
      : turned(motion, town.quarter - motion.quarter, now, reduced);
  return cornered(turnedToo, town.corner, now, reduced);
}

function onStage(layout: Layout, id: string): Rect | undefined {
  const art = layout.rects.get(id);
  if (art === undefined) return undefined;
  return {
    x: Math.round(art.x * layout.cssPerArt),
    y: Math.round(art.y * layout.cssPerArt),
    width: Math.round(art.width * layout.cssPerArt),
    height: Math.round(art.height * layout.cssPerArt),
  };
}

function middle(map: MapScene): Point {
  return map.marks.get(homeOf(map) ?? "")?.centre ?? { x: 0, z: 0 };
}

function homeOf(map: MapScene): string | undefined {
  return map.lands.find((land) => land.kind === "home")?.id;
}

function sameLayout(one: Layout, other: Layout): boolean {
  if (one.cssPerArt !== other.cssPerArt || one.rects.size !== other.rects.size) return false;
  if (one.width !== other.width || one.height !== other.height) return false;
  for (const [key, rect] of one.rects) {
    const held = other.rects.get(key);
    if (
      held === undefined ||
      held.x !== rect.x ||
      held.y !== rect.y ||
      held.width !== rect.width ||
      held.height !== rect.height
    ) {
      return false;
    }
  }
  return true;
}

function documentHidden(pane: Node | undefined): boolean {
  return (
    typeof document !== "undefined" &&
    (pane?.ownerDocument ?? document).visibilityState === "hidden"
  );
}
