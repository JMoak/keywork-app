import type { Axes } from "./camera.ts";
import { aspects } from "./figure-art.ts";
import { type Point, type Side, sides } from "./model.ts";

export type Heading = number;

export const eighthTurn = Math.PI / 4;

export function headingOf(side: Side): Heading {
  return sides.indexOf(side) * 2 * eighthTurn;
}

export function headingAlong(from: Point, to: Point): Heading | undefined {
  if (from.x === to.x && from.z === to.z) return undefined;
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function aspectSeen(heading: Heading, eye: Pick<Axes, "c" | "s">): number {
  const turned = Math.round((Math.atan2(eye.s, eye.c) - heading) / eighthTurn);
  return ((turned % aspects.length) + aspects.length) % aspects.length;
}

export function facesLeft(aspect: number): boolean {
  return aspect >= 1 && aspect <= 3;
}

export function facesRight(aspect: number): boolean {
  return aspect >= 5 && aspect <= 7;
}

export function facesAway(aspect: number): boolean {
  return aspect >= 3 && aspect <= 5;
}
