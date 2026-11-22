import { sketchRandom, truncated } from "./shapes.ts";

export interface SketchStyle {
  readonly roof: "gable" | "flat";
  readonly frames: boolean;
  readonly ribbon: boolean;
  readonly ownLight: boolean;
  readonly sign: boolean;
  readonly antenna: boolean;
  readonly awning: boolean;
  readonly plants: boolean;
}

export interface Bearing {
  readonly seed: number;
  readonly roof: "gx" | "gz" | "hip";
  readonly wide: boolean;
  readonly deep: boolean;
  readonly chimney: boolean;
}

export function bearingOf(creature: number): Bearing {
  const random = sketchRandom(1000 + creature * 77);
  random();
  const seed = truncated(random() * 1e6);
  const roof = (["gx", "gz", "hip"] as const)[truncated(random() * 3)] ?? "gx";
  const wide = random() < 0.5;
  const deep = random() < 0.4;
  const chimney = random() < 0.75;
  return { seed, roof, wide, deep, chimney };
}
