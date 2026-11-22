import type { Kit } from "../../kit.ts";
import { sketchKit } from "../sketch/kit.ts";
import { neonColours } from "./colours.ts";

export const neonKit: Kit = sketchKit(
  "neon",
  "Neon",
  {
    roof: "flat",
    frames: false,
    ribbon: true,
    ownLight: true,
    sign: true,
    antenna: true,
    awning: false,
    plants: false,
  },
  neonColours,
);
