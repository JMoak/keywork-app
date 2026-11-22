import type { Kit } from "../../kit.ts";
import { sketchKit } from "../sketch/kit.ts";
import { plainStyle } from "../sketch/style.ts";
import { lanternColours } from "./colours.ts";

export const lanternKit: Kit = sketchKit(
  "lantern",
  "Lantern",
  {
    roof: "gable",
    frames: true,
    ribbon: false,
    ownLight: false,
    sign: false,
    antenna: false,
    awning: false,
    plants: false,
    ...plainStyle,
  },
  lanternColours,
);
