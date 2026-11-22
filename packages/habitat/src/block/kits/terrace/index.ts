import type { Kit } from "../../kit.ts";
import { sketchKit } from "../sketch/kit.ts";
import { terraceColours } from "./colours.ts";

export const terraceKit: Kit = sketchKit(
  "terrace",
  "Terrace",
  {
    roof: "flat",
    frames: false,
    ribbon: false,
    ownLight: false,
    sign: false,
    antenna: false,
    awning: true,
    plants: true,
  },
  terraceColours,
);
