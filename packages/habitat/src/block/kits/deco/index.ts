import type { Kit } from "../../kit.ts";
import { sketchKit } from "../sketch/kit.ts";
import { decoColours } from "./colours.ts";

export const decoKit: Kit = sketchKit(
  "deco",
  "Deco",
  {
    roof: "step",
    frames: false,
    ribbon: false,
    ownLight: false,
    sign: false,
    antenna: false,
    awning: false,
    plants: false,
    piers: true,
    stone: true,
    blade: true,
    inlay: true,
  },
  decoColours,
);
