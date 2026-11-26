import type { Construction, GroundSpec } from "../kit.ts";

export interface MapKit {
  land(spec: GroundSpec): Construction;
  hall(spec: HallSpec): Construction;
  signpost(spec: SignpostSpec): Construction;
  lane(spec: LaneSpec): Construction;
}

export type LaneKind = "plank" | "stones";

export type LaneAxis = "x" | "z";

export interface HallSpec {
  readonly lit: boolean;
  readonly night: boolean;
}

export interface SignpostSpec {
  readonly name: string;
}

export interface LaneSpec {
  readonly kind: LaneKind;
  readonly axis: LaneAxis;
  readonly length: number;
}
