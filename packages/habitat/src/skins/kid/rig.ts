import { type Placement, place } from "./cell.ts";
import {
  apron,
  armAcross,
  armDown,
  armDust,
  armHalf,
  armHip,
  armHug,
  armLap,
  armOut,
  armRaise,
  armReach,
  armSwing,
  armUp,
  beard,
  type EyeState,
  ear,
  earFlick,
  eyes,
  type GoggleState,
  goggles,
  hammerBelt,
  hammerGround,
  hammerHeld,
  hammerSwing,
  head,
  horn,
  legsHaunch,
  legsSit,
  legsStand,
  legsTiptoe,
  pocketFull,
  torso,
  walkLegs,
} from "./parts.ts";
import type { Part } from "./sprite.ts";

export type ArmPose =
  | "down"
  | "swing"
  | "tucked"
  | "raise"
  | "up"
  | "out"
  | "across"
  | "half"
  | "hug"
  | "lap"
  | "reach"
  | "hip"
  | "dust"
  | "none";

export type LegPose =
  | "stand"
  | "tiptoe"
  | "sit"
  | "haunch"
  | "none"
  | { readonly walk: 0 | 1 | 2 | 3; readonly mirror: boolean };

export type HammerPlace = "belt" | "hand" | "swing" | "ground" | "none";

export interface KidConfig {
  readonly dx: number;
  readonly dy: number;
  readonly lift: number;
  readonly sway: number;
  readonly squash: number;
  readonly breath: number;
  readonly headDx: number;
  readonly headDy: number;
  readonly eyes: EyeState;
  readonly gazeDx: number;
  readonly gazeDy: number;
  readonly goggles: GoggleState;
  readonly glint: 0 | 1 | 2;
  readonly ears: "rest" | "flick";
  readonly earDy: number;
  readonly hammer: HammerPlace;
  readonly left: ArmPose;
  readonly right: ArmPose;
  readonly leftDx: number;
  readonly leftDy: number;
  readonly rightDx: number;
  readonly rightDy: number;
  readonly legs: LegPose;
  readonly pocket: "flat" | "full";
  readonly apronDy: number;
}

export const modelConfig: KidConfig = {
  dx: 0,
  dy: 0,
  lift: 0,
  sway: 0,
  squash: 0,
  breath: 0,
  headDx: 0,
  headDy: 0,
  eyes: "open",
  gazeDx: 0,
  gazeDy: 0,
  goggles: "up",
  glint: 0,
  ears: "rest",
  earDy: 0,
  hammer: "belt",
  left: "down",
  right: "down",
  leftDx: 0,
  leftDy: 0,
  rightDx: 0,
  rightDy: 0,
  legs: "stand",
  pocket: "flat",
  apronDy: 0,
};

export interface KidExtras {
  readonly behind?: readonly Placement[];
  readonly held?: readonly Placement[];
  readonly front?: readonly Placement[];
}

export interface Offset {
  readonly dx: number;
  readonly dy: number;
}

export function kid(overrides: Partial<KidConfig> = {}, extras: KidExtras = {}): Placement[] {
  const config = { ...modelConfig, ...overrides };
  const rows = config.breath - config.squash;
  const cols = config.squash;
  const feet: Offset = { dx: config.dx, dy: -config.lift };
  const body: Offset = { dx: feet.dx + config.sway, dy: feet.dy + config.dy };
  const shoulders: Offset = { dx: body.dx, dy: body.dy - rows };
  const top: Offset = { dx: shoulders.dx + config.headDx, dy: shoulders.dy + config.headDy };
  const ears: Offset = { dx: top.dx, dy: top.dy + config.earDy };
  const leftArm: Offset = { dx: shoulders.dx + config.leftDx, dy: shoulders.dy + config.leftDy };
  const rightArm: Offset = { dx: shoulders.dx - config.rightDx, dy: shoulders.dy + config.rightDy };
  const waist: Offset = { dx: body.dx, dy: body.dy + config.apronDy };
  const gaze: Offset = { dx: top.dx + config.gazeDx, dy: top.dy + config.gazeDy };
  const legs = legPlacements(config.legs, feet);
  const face = [
    place(eyes[config.eyes], { ...gaze, outline: false }),
    place(goggles(config.goggles, config.glint), top),
  ];
  return [
    ...(extras.behind ?? []),
    ...(config.hammer === "ground" ? [place(hammerGround, { ...feet, layer: "behind" })] : []),
    ...legs.filter((leg) => leg.layer === "skin"),
    place(torso, { ...body, rows, cols, layer: "skin" }),
    place(horn, { ...top, layer: "skin" }),
    place(horn, { ...top, mirror: true, layer: "skin" }),
    place(config.ears === "flick" ? earFlick : ear, { ...ears, layer: "skin" }),
    place(ear, { ...ears, mirror: true, layer: "skin" }),
    place(head, { ...top, layer: "skin" }),
    place(beard, { ...top, layer: "skin" }),
    ...armPlacements(config.left, leftArm, false, "skin"),
    ...armPlacements(config.right, rightArm, true, "skin"),
    place(apron, { ...waist, rows, cols }),
    ...(config.pocket === "full" ? [place(pocketFull, waist)] : []),
    ...(config.hammer === "belt" ? [place(hammerBelt, waist)] : []),
    ...legs.filter((leg) => leg.layer === "front"),
    ...(config.goggles === "fogged" ? face.reverse() : face),
    ...(extras.held ?? []),
    ...armPlacements(config.left, leftArm, false, "front"),
    ...armPlacements(config.right, rightArm, true, "front"),
    ...hammerInHand(config.hammer, config.left, leftArm),
    ...(extras.front ?? []),
  ];
}

export function handOf(pose: ArmPose, at: Offset): Offset {
  const hand = hands[pose] ?? hands.reach;
  return { dx: hand.dx + at.dx, dy: hand.dy + at.dy };
}

const hands: Readonly<Partial<Record<ArmPose, Offset>>> & { reach: Offset } = {
  reach: { dx: 7, dy: 37 },
  raise: { dx: 11, dy: 10 },
  up: { dx: 10, dy: 25 },
};

const armParts: Readonly<
  Record<Exclude<ArmPose, "none">, { part: Part; layer: "skin" | "front"; dx: number }>
> = {
  down: { part: armDown, layer: "skin", dx: 0 },
  swing: { part: armSwing, layer: "skin", dx: 0 },
  tucked: { part: armDown, layer: "skin", dx: 1 },
  raise: { part: armRaise, layer: "front", dx: 0 },
  up: { part: armUp, layer: "front", dx: 0 },
  out: { part: armOut, layer: "front", dx: 0 },
  across: { part: armAcross, layer: "front", dx: 0 },
  half: { part: armHalf, layer: "front", dx: 0 },
  hug: { part: armHug, layer: "front", dx: 0 },
  lap: { part: armLap, layer: "front", dx: 0 },
  reach: { part: armReach, layer: "front", dx: 0 },
  hip: { part: armHip, layer: "front", dx: 0 },
  dust: { part: armDust, layer: "front", dx: 0 },
};

function armPlacements(
  pose: ArmPose,
  at: Offset,
  mirror: boolean,
  layer: "skin" | "front",
): Placement[] {
  if (pose === "none") return [];
  const arm = armParts[pose];
  if (arm.layer !== layer) return [];
  const dx = mirror ? at.dx - arm.dx : at.dx + arm.dx;
  return [place(arm.part, { dx, dy: at.dy, mirror, layer })];
}

function hammerInHand(hammer: HammerPlace, pose: ArmPose, at: Offset): Placement[] {
  const hand = handOf(pose, at);
  if (hammer === "hand") return [place(hammerHeld, { dx: hand.dx - 2, dy: hand.dy - 8 })];
  if (hammer === "swing") return [place(hammerSwing, { dx: hand.dx - 7, dy: hand.dy - 2 })];
  return [];
}

function legPlacements(pose: LegPose, at: Offset): Placement[] {
  if (pose === "none") return [];
  if (typeof pose === "object") {
    const legs = walkLegs[pose.walk];
    if (legs === undefined) throw new Error(`no walk phase ${pose.walk}`);
    return [place(legs, { ...at, mirror: pose.mirror, layer: "skin" })];
  }
  const part = { stand: legsStand, tiptoe: legsTiptoe, sit: legsSit, haunch: legsHaunch }[pose];
  return [place(part, { ...at, layer: pose === "sit" ? "front" : "skin" })];
}
