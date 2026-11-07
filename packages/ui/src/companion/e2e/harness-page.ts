import { referenceRows } from "@keywork-app/habitat";
import { defaultSkinId } from "@keywork-app/habitat/skins";
import { createMirror, followSnapshot, seedOf, shownPose } from "../beats.ts";
import { insideWithHysteresis } from "../hit-test.ts";
import {
  type CompanionConditions,
  companionPortFromWindow,
  type HitMask,
  restingConditions,
  type Tier,
} from "../port.ts";
import { deviceScaleFor, hitMaskOf, tokensFromStyle } from "../renderer.ts";
import { companionRenderer } from "../skinned-renderer.ts";
import { effectiveTier, tierScheduler } from "../tier-scheduler.ts";

export interface HarnessPage {
  clicks: number;
  skin: string;
  tier(): Tier;
  wakeups(): number;
  interactive(): boolean;
  conditions(): CompanionConditions;
}

const port = companionPortFromWindow();
if (port === undefined) throw new Error("the companion preload is missing");
const renderer = companionRenderer(defaultSkinId);
if (renderer === undefined) throw new Error(`the ${defaultSkinId} skin was refused by the loader`);

const canvas = document.createElement("canvas");
canvas.style.position = "absolute";
canvas.style.left = "24px";
canvas.style.top = "24px";
canvas.style.imageRendering = "pixelated";
document.body.append(canvas);

let conditions: CompanionConditions = restingConditions;
let hovering = false;
let interactive = false;
let mask: HitMask | undefined;
let clicks = 0;
let totalWakeups = 0;
const rows = renderer.rows ?? referenceRows;
const ambient = { reducedMotion: false, tier: "ambient" } as const;
let mirror = createMirror(performance.now(), seedOf(undefined));

const tokens = () => tokensFromStyle(() => "", undefined, true);

const scheduler = tierScheduler(
  {
    now: () => performance.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    requestAnimationFrame: (fn) => window.requestAnimationFrame(fn),
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle as number),
    random: () => Math.random(),
  },
  (now) => {
    mirror = followSnapshot(mirror, undefined, now, ambient, rows);
    const pose = shownPose(mirror.body, rows, ambient);
    const frame = renderer({ clip: pose.clip, frame: pose.frame, facing: pose.facing }, tokens(), {
      deviceScale: deviceScaleFor(conditions.scale, window.devicePixelRatio),
    });
    if (canvas.width !== frame.width || canvas.height !== frame.height) {
      canvas.width = frame.width;
      canvas.height = frame.height;
      canvas.style.width = `${frame.width / window.devicePixelRatio}px`;
      canvas.style.height = `${frame.height / window.devicePixelRatio}px`;
    }
    const context = canvas.getContext("2d");
    if (context !== null) frame.paint(context);
    const rect = canvas.getBoundingClientRect();
    mask = hitMaskOf(
      frame,
      1 / window.devicePixelRatio,
      { x: rect.left, y: rect.top },
      {
        width: window.innerWidth,
        height: window.innerHeight,
      },
    );
    return pose.nextWakeAt;
  },
);

const applyTier = (): void => {
  scheduler.setTier(
    effectiveTier(conditions.ceiling, hovering ? "interact" : "ambient"),
    conditions.onBattery,
  );
  scheduler.setStill(conditions.still);
};

const setInteractive = (inside: boolean): void => {
  if (inside === interactive) return;
  interactive = inside;
  port.setInteractive(inside);
};

document.addEventListener("pointermove", (event) => {
  if (mask === undefined) return;
  const inside = insideWithHysteresis(mask, { x: event.clientX, y: event.clientY }, interactive);
  setInteractive(inside);
  if (inside !== hovering) {
    hovering = inside;
    applyTier();
  }
});
document.addEventListener("pointerleave", () => {
  setInteractive(false);
  hovering = false;
  applyTier();
});
document.addEventListener("pointerdown", () => {
  clicks += 1;
});

port.onConditions((next) => {
  conditions = next;
  applyTier();
});

applyTier();
port.ready();

const harnessPage: HarnessPage = {
  get clicks() {
    return clicks;
  },
  set clicks(value: number) {
    clicks = value;
  },
  skin: defaultSkinId,
  tier: () => scheduler.tier(),
  wakeups: () => {
    totalWakeups += scheduler.takeWakeups();
    return totalWakeups;
  },
  interactive: () => interactive,
  conditions: () => conditions,
};
(window as unknown as { harnessPage: HarnessPage }).harnessPage = harnessPage;
