import { raisedEye } from "../camera.ts";

export type Way = "back" | "in";

export interface JourneyPlan {
  readonly way: Way;
  readonly townScale: number;
  readonly mapScale: number;
  readonly townEye: number;
}

export interface JourneyFrame {
  readonly scale: number;
  readonly eye: number;
  readonly shift: number;
  readonly over: boolean;
}

export const journeyMs = 1100;
export const steppingShare = 0.6;
export const eyeShare = 0.4;
export const leastShifts = 3;

export function journeyFrame(plan: JourneyPlan, elapsed: number): JourneyFrame {
  const mapScale = Math.min(plan.mapScale, plan.townScale);
  const steps = plan.townScale - mapScale;
  const stepping = Math.min(1, Math.max(0, elapsed / (journeyMs * steppingShare)));
  const taken = Math.min(steps, Math.floor(stepping * (steps + 1)));
  const shifts = Math.max(steps, leastShifts);
  const shifted = Math.min(shifts, Math.floor(stepping * (shifts + 1))) / shifts;
  const rising = eased(Math.min(1, Math.max(0, elapsed / (journeyMs * eyeShare))));
  const back = plan.way === "back";
  return {
    scale: back ? plan.townScale - taken : mapScale + taken,
    eye: back
      ? plan.townEye + (raisedEye - plan.townEye) * rising
      : raisedEye + (plan.townEye - raisedEye) * rising,
    shift: back ? shifted : 1 - shifted,
    over: elapsed >= journeyMs,
  };
}

function eased(share: number): number {
  return share < 0.5 ? 4 * share * share * share : 1 - (-2 * share + 2) ** 3 / 2;
}
