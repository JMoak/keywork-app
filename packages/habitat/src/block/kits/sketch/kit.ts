import type { Appearance, Kit, KitColours } from "../../kit.ts";
import { buildersOf } from "./buildings.ts";
import { groundOf } from "./ground.ts";
import { propOf } from "./props.ts";
import type { SketchStyle } from "./style.ts";

export const sketchShading = { pz: 0, px: 0.07, nx: -0.1, nz: -0.16, top: 0.08 } as const;

export function sketchKit(
  id: string,
  name: string,
  style: SketchStyle,
  colours: Readonly<Record<Appearance, KitColours>>,
): Kit {
  return {
    id,
    name,
    colours,
    shading: sketchShading,
    ground: groundOf,
    prop: propOf,
    ...buildersOf(style),
  };
}
