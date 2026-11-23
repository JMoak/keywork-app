import type { HabitatState, PowerTier, StepContext } from "@keywork-app/habitat";
import {
  type Appearance,
  type BlockPalette,
  type BlockScene,
  backdropOf,
  blockScene,
  type Camera,
  changesBetween,
  type DrawList,
  drawList,
  firefliesOf,
  forcedBlockPalette,
  type Hit,
  hitAt,
  type Kit,
  monumentFor,
  moves,
  type Partnership,
  type Picture,
  type PlaceRects,
  type ProjectSite,
  pathKey,
  placeOfTarget,
  placeRectsOf,
  projectorOf,
  type Quad,
  type Resident,
  rectOfPlace,
  reframed,
  resolveBlockPalette,
  restCamera,
  ringFor,
  risingCells,
  samePlace,
  shownShare,
  sideNameOf,
  type BlockWorld as Town,
  type TownChange,
  tickMs,
  type View,
  viewOf,
} from "@keywork-app/habitat/block";
import type { SteadPlace } from "@keywork-app/protocol";
import "./block.css";
import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import type { Rect } from "../../../layout/index.ts";
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
import type { SteadPlaceBoard } from "./board.ts";
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
import { SiteCard } from "./site-card.tsx";
import { herdOnTheStead, type Stances } from "./stances.ts";
import {
  type Arrival,
  arrivalOf,
  arrived,
  freshMs,
  paintArrival,
  snapshotOf,
} from "./transition.ts";
import { createTroupe } from "./troupe.ts";

export interface BlockWorldProps {
  readonly world: HabitatState;
  readonly focused: boolean;
  readonly hidden: boolean;
  readonly kit: Kit;
  readonly light?: Appearance | undefined;
  readonly holding?: boolean | undefined;
  readonly eye?: number | undefined;
  readonly corners?: boolean | undefined;
  readonly order?: readonly string[] | undefined;
  readonly projects?: Readonly<Record<string, readonly ProjectSite[]>> | undefined;
  readonly partnerships?: readonly Partnership[] | undefined;
  readonly board?: SteadPlaceBoard | undefined;
  readonly held?: SteadPlace | undefined;
  readonly label?: string | undefined;
  readonly children?: JSX.Element;
  readonly onPick?: ((hit: Hit) => void) | undefined;
  readonly onHover?: ((hit: Hit | undefined) => void) | undefined;
  readonly onControls?: ((controls: BlockWorldControls) => void) | undefined;
}

export interface BlockWorldControls {
  turn(steps: number): void;
  face(place: SteadPlace): void;
  onStage(place: SteadPlace): Rect | undefined;
  side(): string;
}

export interface DeviceSize {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export const sceneRefreshMs = 60_000;
export const wellShown = 0.5;

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

export function placeOnStage(
  rects: PlaceRects,
  place: SteadPlace,
  cssPerArt: number,
): Rect | undefined {
  const art = rectOfPlace(rects, place);
  if (art === undefined) return undefined;
  return {
    x: Math.round(art.x * cssPerArt),
    y: Math.round(art.y * cssPerArt),
    width: Math.round(art.width * cssPerArt),
    height: Math.round(art.height * cssPerArt),
  };
}

export function siteAt(
  projects: BlockWorldProps["projects"],
  place: SteadPlace | undefined,
): ProjectSite | undefined {
  if (place?.kind !== "project") return undefined;
  const directory = pathKey(place.directory);
  return projects?.[place.creature]?.find((site) => pathKey(site.id) === directory);
}

interface Layout {
  readonly rects: PlaceRects;
  readonly cssPerArt: number;
  readonly width: number;
  readonly height: number;
}

interface Carded {
  readonly site: ProjectSite;
  readonly building: Rect;
  readonly held: boolean;
}

export function BlockWorld(props: BlockWorldProps) {
  let stage: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  const herd = herdOnTheStead();
  const troupe = createTroupe();
  const [refreshedAt, setRefreshedAt] = createSignal(Date.now());
  const [themed, setThemed] = createSignal<Appearance>("night");
  const appearance = (): Appearance => props.light ?? themed();
  const [paintedOnce, setPaintedOnce] = createSignal(false);
  const withheld = createMemo(
    () => (props.holding === true || !paintedOnce() ? unwelcomed(props.world, Date.now()) : []),
    [],
    { equals: sameSlugs },
  );
  const [stances, setStances] = createSignal<Stances>({});
  const [side, setSide] = createSignal("front");
  const [layout, setLayout] = createSignal<Layout>(
    { rects: new Map(), cssPerArt: 1, width: 1, height: 1 },
    { equals: sameLayout },
  );
  const [pointedAt, setPointedAt] = createSignal<SteadPlace>();
  const scene = createMemo<BlockScene>(() =>
    blockScene(without(props.world, withheld()), {
      kit: props.kit,
      appearance: appearance(),
      now: refreshedAt(),
      projects: props.projects,
      partnerships: props.partnerships,
      monument: monumentFor(Object.keys(props.world.creatures).length),
      order: props.order,
      stances: stances(),
    }),
  );
  const eyeWanted = (): number =>
    props.eye ?? eyeFor(scene().residents.length, buildingsOf(scene().residents, props.projects));
  let motion: CameraMotion = stillMotion(0, eyeWanted(), props.corners === true);
  let palette: BlockPalette | undefined;
  let shown: { picture: Picture; theme: string } | undefined;
  let painted: Town | undefined;
  let paintedIn = "";
  let arrival: Arrival | undefined;
  let size: DeviceSize = { width: 1, height: 1, dpr: 1 };
  let lastInputAt = Number.NEGATIVE_INFINITY;
  let hovered: Hit | undefined;

  const readTheme = (): BlockPalette => {
    const source = paletteSourceOf(stage ?? document.documentElement);
    setThemed(source.appearance === "light" ? "day" : "night");
    const seen = appearance();
    const made = forcedColorsActive(stage)
      ? forcedBlockPalette(props.kit, seen)
      : resolveBlockPalette(props.kit, seen);
    palette = made;
    return made;
  };
  const paletteNow = (): BlockPalette =>
    palette?.key.startsWith(`${props.kit.id}|${appearance()}|`) ? palette : readTheme();
  const cache = textureCache(paletteNow);

  const herdContext = (tier: PowerTier, reduced: boolean): StepContext => ({
    visible: !props.hidden && !documentHidden(stage),
    focused: props.focused,
    fullscreen: false,
    doNotDisturb: false,
    tier,
    reducedMotion: reduced,
    quietHours: false,
    pointer: undefined,
    gestures: [],
  });

  const draw = (now: number, tier: PowerTier): FieldPicture => {
    const reduced = reducedMotionActive();
    setStances(herd.step(props.world, now, herdContext(tier, reduced)));
    motion = settled(lifted(motion, eyeWanted(), now, reduced), now);
    const world = scene().world;
    const colours = props.kit.colours[appearance()];
    const tick = tickAt(now, reduced);
    if (stage !== undefined) {
      size = deviceSizeOf(stage.clientWidth, stage.clientHeight, devicePixelRatioOf(stage));
    }
    const view = viewOf(world, size.width, size.height, motion.eye, { corners: motion.corner });
    const camera = cameraAt(motion, now);
    if (arrival !== undefined && arrived(arrival, now)) {
      arrival = undefined;
      shown = undefined;
    }
    arrival = reduced ? undefined : (arriving(world, camera, view, now) ?? arrival);
    const rest = restCamera(motion.quarter, motion.eye, motion.corner);
    const list = drawList(world, camera, view, tick, colours.haze, {
      standing: troupe.standing(world, rest, now, reduced),
      lifts:
        arrival === undefined ? undefined : risingCells(arrival.change, now - arrival.startedAt),
    });
    const picture: Picture = {
      list,
      backdrop: backdropOf(colours, view),
      lights: firefliesOf(colours, view, list.pivot.y, tick),
    };
    paint(picture, now);
    painted = world;
    paintedIn = paletteNow().key;
    welcome(world);
    if (!paintedOnce()) setPaintedOnce(true);
    const turning = moving(motion, now) || troupe.walking() || arrival !== undefined;
    const alive = !reduced && (moves(world) || picture.lights.length > 0);
    const ticking = turning ? now : alive ? (tick + 1) * tickMs : undefined;
    return { nextWakeAt: earliest(ticking, herd.nextThoughtAt()), still: !turning && !alive };
  };

  const arriving = (world: Town, camera: Camera, view: View, now: number): Arrival | undefined => {
    if (painted === undefined || painted === world || canvas === undefined) return undefined;
    if (paintedIn !== paletteNow().key) return undefined;
    const change = changesBetween(painted, world).find((each) => fresh(each, now));
    if (change === undefined) return undefined;
    const before = snapshotOf(canvas);
    if (before === undefined) return undefined;
    const settledEye = { angle: camera.angle, eye: motion.eye };
    const [x, y] = projectorOf(world, settledEye, view)(change.at.x, 0, change.at.z);
    const ring = ringFor(
      change,
      x,
      y,
      view.width / view.scale,
      view.height / view.scale,
      reframed(painted, world) || !sameView(shown?.picture.list.view, view),
    );
    return arrivalOf(change, ring, now, before);
  };

  const fresh = (change: TownChange, now: number): boolean => {
    const heard =
      change.kind === "creature"
        ? Date.parse(props.world.creatures[change.creature]?.workshop.raisedAt ?? "")
        : props.projects?.[change.creature]?.find((site) => site.id === change.project)?.heardAt;
    return heard !== undefined && now - heard < freshMs;
  };

  const paint = (picture: Picture, now: number): void => {
    if (canvas === undefined) return;
    const colours = paletteNow();
    if (
      arrival === undefined &&
      shown !== undefined &&
      shown.theme === colours.key &&
      samePicture(shown.picture, picture)
    ) {
      return;
    }
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    canvas.style.width = `${size.width / size.dpr}px`;
    canvas.style.height = `${size.height / size.dpr}px`;
    shown = { picture, theme: colours.key };
    setLayout({
      rects: placeRectsOf(picture.list),
      cssPerArt: picture.list.view.scale / size.dpr,
      width: size.width / size.dpr,
      height: size.height / size.dpr,
    });
    const context = canvas.getContext("2d");
    if (context === null) return;
    paintPicture(context, picture, colours, cache);
    if (arrival === undefined) return;
    const glow = colours.colourOf("lampHi", undefined) ?? colours.background;
    paintArrival(context, arrival, now, picture.list.view.scale, glow);
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
  const onStage = (place: SteadPlace): Rect | undefined => {
    const { rects, cssPerArt } = layout();
    return placeOnStage(rects, place, cssPerArt);
  };
  const onPage = (place: SteadPlace): Rect | undefined => {
    if (stage === undefined || props.hidden || documentHidden(stage)) return undefined;
    if (stage.ownerDocument !== document) return undefined;
    const within = onStage(place);
    if (within === undefined) return undefined;
    const frame = stage.getBoundingClientRect();
    return clipped(
      { x: frame.left + within.x, y: frame.top + within.y, ...sizeOf(within) },
      { x: frame.left, y: frame.top, width: frame.width, height: frame.height },
    );
  };
  const face = (place: SteadPlace): void => {
    const world = scene().world;
    const shown = (steps: number): number =>
      shownShare(world, restCamera(motion.quarter + steps, motion.eye, motion.corner), (item) =>
        samePlace(item.target === undefined ? undefined : placeOfTarget(item.target), place),
      );
    const here = shown(0);
    if (here >= wellShown) return;
    const [best] = [1, -1, 2]
      .map((steps) => ({ steps, share: shown(steps) }))
      .sort((a, b) => b.share - a.share);
    if (best !== undefined && best.share > here) turn(best.steps);
  };
  props.onControls?.({ turn, face, onStage, side });

  const carded = createMemo((): Carded | undefined => {
    const pointed = pointedAt();
    const place = pointed?.kind === "project" ? pointed : props.held;
    const site = siteAt(props.projects, place);
    const building = place === undefined || site === undefined ? undefined : onStage(place);
    return site === undefined || building === undefined
      ? undefined
      : { site, building, held: samePlace(place, props.held) };
  });
  const point = (hit: Hit | undefined): void => {
    hovered = hit;
    setPointedAt(hit === undefined ? undefined : placeOfTarget(hit.target));
    props.onHover?.(hit);
  };

  const hitUnder = (event: MouseEvent): Hit | undefined => {
    if (shown === undefined || canvas === undefined || event.target !== canvas) return undefined;
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
      props.board?.stand({ onPage }) ?? nothing,
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
  createEffect(on([() => props.kit, () => props.light], rethemed, { defer: true }));
  createEffect(
    on(
      () => props.corners === true,
      (corner) => {
        motion = cornered(motion, corner, Date.now(), reducedMotionActive());
        nudge();
      },
      { defer: true },
    ),
  );
  onCleanup(loop.stop);

  return (
    <div
      class="kw-stead-block"
      ref={stage}
      hidden={props.hidden}
      role="application"
      aria-roledescription="block world"
      aria-label={props.label ?? `the stead seen from the ${side()}; left and right arrows turn it`}
      data-side={side()}
      data-kit={props.kit.id}
      onPointerMove={(event) => {
        lastInputAt = Date.now();
        const hit = hitUnder(event);
        if (!sameHit(hit, hovered)) point(hit);
      }}
      onPointerLeave={() => point(undefined)}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || hovered === undefined) return;
        event.preventDefault();
        point(undefined);
      }}
      onClick={(event) => {
        const hit = hitUnder(event);
        if (hit !== undefined) props.onPick?.(hit);
      }}
    >
      <canvas class="kw-stead-block-canvas" ref={canvas} />
      {props.children}
      <Show when={carded()}>
        {(card) => (
          <SiteCard
            site={card().site}
            building={card().building}
            stage={layout()}
            held={card().held}
            now={refreshedAt()}
          />
        )}
      </Show>
    </div>
  );
}

const welcomed = new Set<string>();

function unwelcomed(world: HabitatState, now: number): string[] {
  return Object.values(world.creatures)
    .filter(
      (creature) =>
        !welcomed.has(creature.slug) &&
        creature.workshop.boardedAt === undefined &&
        now - Date.parse(creature.workshop.raisedAt) < freshMs,
    )
    .map((creature) => creature.slug);
}

function without(world: HabitatState, slugs: readonly string[]): HabitatState {
  if (slugs.length === 0) return world;
  const creatures = { ...world.creatures };
  for (const slug of slugs) delete creatures[slug];
  return { ...world, creatures };
}

function welcome(town: Town): void {
  for (const member of town.cast) welcomed.add(member.slug);
  for (const walker of town.walkers) {
    if (walker.target?.kind === "creature") welcomed.add(walker.target.creature);
  }
}

function sameSlugs(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((slug, index) => slug === other[index]);
}

function earliest(...wakes: readonly (number | undefined)[]): number | undefined {
  const known = wakes.filter((wake): wake is number => wake !== undefined);
  return known.length === 0 ? undefined : Math.min(...known);
}

function sizeOf(rect: Rect): Pick<Rect, "width" | "height"> {
  return { width: rect.width, height: rect.height };
}

function clipped(rect: Rect, frame: Rect): Rect | undefined {
  const left = Math.max(rect.x, frame.x);
  const top = Math.max(rect.y, frame.y);
  const right = Math.min(rect.x + rect.width, frame.x + frame.width);
  const bottom = Math.min(rect.y + rect.height, frame.y + frame.height);
  if (right <= left || bottom <= top) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function buildingsOf(
  residents: readonly Resident[],
  projects: BlockWorldProps["projects"],
): number {
  return residents.reduce((sum, resident) => sum + (projects?.[resident.slug]?.length ?? 0), 0);
}

function sameView(one: View | undefined, other: View): boolean {
  return (
    one !== undefined &&
    one.scale === other.scale &&
    one.width === other.width &&
    one.height === other.height
  );
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
    )
      return false;
  }
  return true;
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
