import { hour, minute } from "../clock/clock.ts";
import type { IdleKind } from "./idle.ts";

export interface Needs {
  readonly rest: number;
  readonly curiosity: number;
  readonly order: number;
}

export const freshNeeds: Needs = { rest: 0.2, curiosity: 0.4, order: 0.1 };

export const risePerMs = {
  rest: 0.5 / (4 * hour),
  restAtTheBench: 1.5 / (4 * hour),
  curiosity: 0.5 / (40 * minute),
  curiosityAtTheBench: 0.15 / (40 * minute),
  order: 0.5 / (3 * hour),
} as const;

export const crateArrivalRaisesOrder = 0.35;

export type Band = "low" | "comfortable" | "high";

export function needsAfter(
  needs: Needs,
  elapsedMs: number,
  atTheBench: boolean,
  treeExists: boolean,
): Needs {
  const dt = Math.max(0, elapsedMs);
  return {
    rest: clamp(needs.rest + dt * (atTheBench ? risePerMs.restAtTheBench : risePerMs.rest)),
    curiosity: clamp(
      needs.curiosity + dt * (atTheBench ? risePerMs.curiosityAtTheBench : risePerMs.curiosity),
    ),
    order: clamp(needs.order + (treeExists ? dt * risePerMs.order : 0)),
  };
}

export function relieved(needs: Needs, kind: IdleKind): Needs {
  switch (kind) {
    case "rest":
      return { ...needs, rest: clamp(needs.rest - 0.45) };
    case "stretch":
      return { ...needs, rest: clamp(needs.rest - 0.08) };
    case "wander":
      return { ...needs, curiosity: clamp(needs.curiosity - 0.3), rest: clamp(needs.rest + 0.02) };
    case "inspect":
    case "look":
      return { ...needs, curiosity: clamp(needs.curiosity - 0.18) };
    case "tidy":
    case "tend":
      return {
        ...needs,
        order: clamp(needs.order - 0.4),
        curiosity: clamp(needs.curiosity - 0.05),
      };
    case "sit":
      return { ...needs, rest: clamp(needs.rest - 0.1), curiosity: clamp(needs.curiosity + 0.05) };
  }
}

export function raisedBy(needs: Needs, need: keyof Needs, amount: number): Needs {
  return { ...needs, [need]: clamp(needs[need] + amount) };
}

export function bandOf(value: number): Band {
  return value < 0.3 ? "low" : value < 0.65 ? "comfortable" : "high";
}

export function clamp(value: number, low = 0, high = 1): number {
  return Math.min(high, Math.max(low, value));
}
