import { coldStart, type PowerTier } from "@keywork-app/habitat";
import {
  backdropOf,
  blockScene,
  drawList,
  figureFor,
  firefliesOf,
  firstKit,
  moves,
  type Picture,
  resolveBlockPalette,
  restCamera,
  tickMs,
  viewOf,
} from "@keywork-app/habitat/block";
import { eyeFor } from "../../panes/stead/block/motion.ts";
import { paintPicture, textureCache } from "../../panes/stead/block/paint.ts";
import { browserFieldHost, type FieldPicture, steadField } from "../../panes/stead/field.ts";
import { defaultSkinId } from "../../panes/stead/habitat-render.ts";
import { paletteSourceOf, reducedMotionActive } from "../../panes/stead/painter.ts";

export interface SteadPage {
  skins(): string[];
  refused(): number;
  tier(): PowerTier;
  wakes(): number;
  paints(): number;
  painted(): { width: number; height: number };
  visible(): boolean;
}

const mountedAt = Date.now();
const world = coldStart({
  at: new Date(mountedAt).toISOString(),
  sessions: [],
  creatures: [{ slug: "kid", name: "kid", skin: defaultSkinId }],
  offsetMinutes: new Date(mountedAt).getTimezoneOffset(),
});

const stage = document.createElement("div");
stage.style.width = "100%";
stage.style.height = "100%";
const canvas = document.createElement("canvas");
canvas.style.imageRendering = "pixelated";
stage.append(canvas);
document.body.append(stage);

let paints = 0;
let shownKey = "";

const kit = firstKit;
const source = paletteSourceOf(document.documentElement);
const appearance = source.appearance === "light" ? "day" : "night";
const palette = resolveBlockPalette(kit, appearance, source.read("--kw-background"));
const cache = textureCache(() => palette);
const scene = blockScene(world, { kit, appearance, now: mountedAt });

const hidden = (): boolean => document.visibilityState === "hidden";

const draw = (now: number, _tier: PowerTier): FieldPicture => {
  const reduced = reducedMotionActive();
  const tick = reduced ? 0 : Math.floor(now / tickMs);
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(stage.clientWidth * dpr));
  const height = Math.max(1, Math.round(stage.clientHeight * dpr));
  const eye = eyeFor(scene.residents.length);
  const view = viewOf(scene.world, width, height, eye);
  const colours = kit.colours[appearance];
  const list = drawList(scene.world, restCamera(0, eye), view, tick, colours.haze);
  const picture: Picture = {
    list,
    backdrop: backdropOf(colours, view),
    lights: firefliesOf(colours, view, list.pivot.y, tick),
  };
  const key = `${width}x${height}|${tick}`;
  const context = canvas.getContext("2d");
  if (key !== shownKey && context !== null) {
    canvas.width = width;
    canvas.height = height;
    paintPicture(context, picture, palette, cache);
    shownKey = key;
    paints += 1;
  }
  const alive = !reduced && (moves(scene.world) || picture.lights.length > 0);
  return { nextWakeAt: alive ? (tick + 1) * tickMs : undefined, still: !alive };
};

const field = steadField(
  browserFieldHost(),
  { hidden, resting: () => true, lastInputAt: () => Number.NEGATIVE_INFINITY },
  draw,
);
document.addEventListener("visibilitychange", field.request);
field.redraw();

const steadPage: SteadPage = {
  skins: () => Object.values(world.creatures).map((creature) => creature.skin ?? defaultSkinId),
  refused: () =>
    Object.values(world.creatures).filter(
      (creature) => figureFor(creature.skin).name !== creature.skin,
    ).length,
  tier: () => field.tier(),
  wakes: () => field.wakes(),
  paints: () => paints,
  painted: () => ({ width: canvas.width, height: canvas.height }),
  visible: () => !hidden(),
};
(window as unknown as { steadPage: SteadPage }).steadPage = steadPage;
