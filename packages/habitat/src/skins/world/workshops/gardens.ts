import { bitmapFromRows, worldGlyphs } from "../../legend.ts";
import type { Tile } from "../tiles.ts";

export type GardenPlanting = "herbs" | "flowers" | "mushrooms";

export const gardenPlantings: readonly GardenPlanting[] = ["herbs", "flowers", "mushrooms"];

export function gardenTile(planting: GardenPlanting): Tile {
  return gardens[planting];
}

const gardens: Readonly<Record<GardenPlanting, Tile>> = {
  herbs: garden("herbs", [
    "..w.....w.......",
    "..wg...wgw..w...",
    ".wwg...wgw.wgw..",
    "..ggw.wwg..wgw..",
    "..gwg..gg.wwg...",
    "...gg..gg..gg...",
    ".oooooooooooooo.",
    ".ossgssgssgssso.",
  ]),
  flowers: garden("flowers", [
    "............o-o.",
    "..o-o......o=-=o",
    ".o=-=o.o-o..o-o.",
    "..o-o.o=-=o.wg..",
    "..wg.w.o-o...gw.",
    "...gg...gw...g..",
    ".oooooooooooooo.",
    ".ossgssgssgssso.",
  ]),
  mushrooms: garden("mushrooms", [
    "................",
    "....oooo........",
    "...o-#==o.......",
    "..o==#===o.ooo..",
    "..ooooooooo-##o.",
    ".....wwo..ooooo.",
    ".oooo==ooooo=oo.",
    ".ossgssgssgssso.",
  ]),
};

function garden(name: GardenPlanting, rows: readonly string[]): Tile {
  return { name: `garden-${name}`, ...bitmapFromRows(rows, worldGlyphs) };
}
