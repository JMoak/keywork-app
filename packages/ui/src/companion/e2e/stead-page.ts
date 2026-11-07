import { coldStart, type PowerTier, type StepContext } from "@keywork-app/habitat";
import { type SceneContext, steadDrawer } from "../../panes/stead/draw.ts";
import { browserFieldHost, type FieldPicture, steadField } from "../../panes/stead/field.ts";
import { defaultSkinId } from "../../panes/stead/habitat-render.ts";
import { emptyHerd, type Herd } from "../../panes/stead/herd.ts";
import { reducedMotionActive } from "../../panes/stead/painter.ts";

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
  offsetMinutes: -new Date(mountedAt).getTimezoneOffset(),
});

const stage = document.createElement("div");
const canvas = document.createElement("canvas");
canvas.style.imageRendering = "pixelated";
stage.append(canvas);
document.body.append(stage);

let herd: Herd = emptyHerd;
let paints = 0;
const drawer = steadDrawer();

const hidden = (): boolean => document.visibilityState === "hidden";

const contextAt = (tier: PowerTier): SceneContext => ({
  visible: !hidden(),
  focused: false,
  fullscreen: false,
  doNotDisturb: false,
  tier,
  reducedMotion: reducedMotionActive(),
  quietHours: false,
});

const draw = (now: number, tier: PowerTier): FieldPicture => {
  const context = contextAt(tier);
  const stepContext: StepContext = { ...context, pointer: undefined, gestures: [] };
  const drawing = drawer.draw({
    world,
    herd,
    mountedAt,
    now,
    context,
    memberContext: () => stepContext,
    stageWidth: stage.clientWidth,
    canvas,
  });
  herd = drawing.herd;
  if (drawing.painted) paints += 1;
  return drawing.picture;
};

const field = steadField(
  browserFieldHost(),
  { hidden, resting: () => true, lastInputAt: () => Number.NEGATIVE_INFINITY },
  draw,
);
document.addEventListener("visibilitychange", field.request);
field.redraw();

const steadPage: SteadPage = {
  skins: () => herd.members.map((member) => world.creatures[member.slug]?.skin ?? defaultSkinId),
  refused: () => herd.refused.length,
  tier: () => field.tier(),
  wakes: () => field.wakes(),
  paints: () => paints,
  painted: () => ({ width: canvas.width, height: canvas.height }),
  visible: () => !hidden(),
};
(window as unknown as { steadPage: SteadPage }).steadPage = steadPage;
