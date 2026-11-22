import {
  type Camera,
  cornerTurn,
  levelEye,
  quarterTurn,
  raisedEye,
} from "@keywork-app/habitat/block";

export const turnMs = 620;
export const cornerMs = 380;
export const eyeMs = 420;
export const streetFrom = 3;

export interface Glide {
  readonly from: number;
  readonly to: number;
  readonly startedAt: number;
  readonly ms: number;
}

export interface CameraMotion {
  readonly quarter: number;
  readonly corner: boolean;
  readonly eye: number;
  readonly turn: Glide | undefined;
  readonly lift: Glide | undefined;
}

export function stillMotion(quarter: number, eye: number, corner = false): CameraMotion {
  return { quarter, corner, eye, turn: undefined, lift: undefined };
}

export function eyeFor(creatures: number): number {
  return creatures >= streetFrom ? raisedEye : levelEye;
}

export function restAngle(motion: Pick<CameraMotion, "quarter" | "corner">): number {
  return motion.quarter * quarterTurn + (motion.corner ? cornerTurn : 0);
}

export function turned(
  motion: CameraMotion,
  steps: number,
  now: number,
  reduced: boolean,
): CameraMotion {
  if (gliding(motion.turn, now)) return motion;
  const from = angleAt(motion, now);
  const next = { ...motion, quarter: motion.quarter + steps };
  return {
    ...next,
    turn: reduced
      ? undefined
      : { from, to: from + steps * quarterTurn, startedAt: now, ms: turnMs },
  };
}

export function cornered(
  motion: CameraMotion,
  corner: boolean,
  now: number,
  reduced: boolean,
): CameraMotion {
  if (corner === motion.corner) return motion;
  const from = angleAt(motion, now);
  const next = { ...motion, corner };
  return {
    ...next,
    turn: reduced
      ? undefined
      : { from, to: from + (corner ? 1 : -1) * cornerTurn, startedAt: now, ms: cornerMs },
  };
}

export function lifted(
  motion: CameraMotion,
  eye: number,
  now: number,
  reduced: boolean,
): CameraMotion {
  if (eye === motion.eye) return motion;
  return {
    ...motion,
    eye,
    lift: reduced ? undefined : { from: eyeAt(motion, now), to: eye, startedAt: now, ms: eyeMs },
  };
}

export function cameraAt(motion: CameraMotion, now: number): Camera {
  return { angle: angleAt(motion, now), eye: eyeAt(motion, now) };
}

export function moving(motion: CameraMotion, now: number): boolean {
  return gliding(motion.turn, now) || gliding(motion.lift, now);
}

export function settled(motion: CameraMotion, now: number): CameraMotion {
  return {
    ...motion,
    turn: gliding(motion.turn, now) ? motion.turn : undefined,
    lift: gliding(motion.lift, now) ? motion.lift : undefined,
  };
}

export function easeInOut(share: number): number {
  const t = Math.min(1, Math.max(0, share));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function angleAt(motion: CameraMotion, now: number): number {
  return along(motion.turn, now) ?? restAngle(motion);
}

function eyeAt(motion: CameraMotion, now: number): number {
  return along(motion.lift, now) ?? motion.eye;
}

function along(glide: Glide | undefined, now: number): number | undefined {
  if (glide === undefined || !gliding(glide, now)) return undefined;
  return glide.from + (glide.to - glide.from) * easeInOut((now - glide.startedAt) / glide.ms);
}

function gliding(glide: Glide | undefined, now: number): boolean {
  return glide !== undefined && now - glide.startedAt < glide.ms;
}
