import { type Placement, place } from "../kid/cell.ts";
import {
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
  type EyeState,
  hammerGround,
  hammerHeld,
  hammerSwing,
  legsHaunch,
  legsSit,
  legsStand,
  legsTiptoe,
  walkLegs,
} from "../kid/parts.ts";
import { type ArmPose, handOf, type LegPose, type Offset } from "../kid/rig.ts";
import type { Part } from "../kid/sprite.ts";

export type ToolPlace = "stowed" | "hand" | "swing" | "ground";

export interface StockConfig<Ears extends string, Gear extends string> {
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
  readonly ears: Ears;
  readonly earDy: number;
  readonly gear: Gear;
  readonly tool: ToolPlace;
  readonly left: ArmPose;
  readonly right: ArmPose;
  readonly leftDx: number;
  readonly leftDy: number;
  readonly rightDx: number;
  readonly rightDy: number;
  readonly legs: LegPose;
}

export interface Worn {
  readonly part: Part;
  readonly mirror?: boolean;
  readonly dx?: number;
  readonly dy?: number;
}

export interface Dress {
  readonly behind?: readonly Worn[];
  readonly skin?: readonly Worn[];
  readonly front?: readonly Worn[];
}

export interface Species<Ears extends string, Gear extends string> {
  readonly model: StockConfig<Ears, Gear>;
  readonly torso: Part;
  readonly armSpread: number;
  readonly eyes: Readonly<Record<EyeState, Part>>;
  readonly head: readonly Part[];
  readonly face: readonly Part[];
  ears(state: Ears): readonly Worn[];
  gear(state: Gear): Dress;
}

export interface StockExtras {
  readonly behind?: readonly Placement[];
  readonly held?: readonly Placement[];
  readonly front?: readonly Placement[];
}

export type StockRig<Ears extends string, Gear extends string> = (
  overrides?: Partial<StockConfig<Ears, Gear>>,
  extras?: StockExtras,
) => Placement[];

export function stockRig<Ears extends string, Gear extends string>(
  species: Species<Ears, Gear>,
): StockRig<Ears, Gear> {
  return (overrides = {}, extras = {}) => {
    const config = { ...species.model, ...overrides };
    const rows = config.breath - config.squash;
    const cols = config.squash;
    const feet: Offset = { dx: config.dx, dy: -config.lift };
    const body: Offset = { dx: feet.dx + config.sway, dy: feet.dy + config.dy };
    const shoulders: Offset = { dx: body.dx, dy: body.dy - rows };
    const top: Offset = { dx: shoulders.dx + config.headDx, dy: shoulders.dy + config.headDy };
    const ears: Offset = { dx: top.dx, dy: top.dy + config.earDy };
    const gaze: Offset = { dx: top.dx + config.gazeDx, dy: top.dy + config.gazeDy };
    const leftArm: Offset = {
      dx: shoulders.dx + config.leftDx - species.armSpread,
      dy: shoulders.dy + config.leftDy,
    };
    const rightArm: Offset = {
      dx: shoulders.dx - config.rightDx + species.armSpread,
      dy: shoulders.dy + config.rightDy,
    };
    const legs = legPlacements(config.legs, feet);
    const dress = species.gear(config.gear);
    return [
      ...(extras.behind ?? []),
      ...worn(dress.behind, body, "behind"),
      ...(config.tool === "ground" ? [place(hammerGround, { ...feet, layer: "behind" })] : []),
      ...legs.filter((leg) => leg.layer === "skin"),
      place(species.torso, { ...body, rows, cols, layer: "skin" }),
      ...worn(dress.skin, body, "skin"),
      ...worn(species.ears(config.ears), ears, "skin"),
      ...species.head.map((part) => place(part, { ...top, layer: "skin" })),
      ...armPlacements(config.left, leftArm, false, "skin"),
      ...armPlacements(config.right, rightArm, true, "skin"),
      ...worn(dress.front, body, "front"),
      ...legs.filter((leg) => leg.layer === "front"),
      ...species.face.map((part) => place(part, { ...top, outline: false })),
      place(species.eyes[config.eyes], { ...gaze, outline: false }),
      ...(extras.held ?? []),
      ...armPlacements(config.left, leftArm, false, "front"),
      ...armPlacements(config.right, rightArm, true, "front"),
      ...toolInHand(config.tool, config.left, leftArm),
      ...(extras.front ?? []),
    ];
  };
}

export function shifted(part: Part, dx: number, dy: number): Part {
  return { ...part, x: part.x + dx, y: part.y + dy };
}

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

function worn(
  pieces: readonly Worn[] | undefined,
  at: Offset,
  layer: "behind" | "skin" | "front",
): Placement[] {
  return (pieces ?? []).map((piece) =>
    place(piece.part, {
      dx: at.dx + (piece.dx ?? 0),
      dy: at.dy + (piece.dy ?? 0),
      mirror: piece.mirror ?? false,
      layer,
    }),
  );
}

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

function toolInHand(tool: ToolPlace, pose: ArmPose, at: Offset): Placement[] {
  const hand = handOf(pose, at);
  if (tool === "hand") return [place(hammerHeld, { dx: hand.dx - 2, dy: hand.dy - 8 })];
  if (tool === "swing") return [place(hammerSwing, { dx: hand.dx - 7, dy: hand.dy - 2 })];
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
