import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Appearance,
  backdropOf,
  blockScene,
  type Camera,
  drawList,
  firefliesOf,
  forcedBlockPalette,
  type Kit,
  kits,
  levelEye,
  quarterTurn,
  raisedEye,
  rasterizePicture,
  resolveBlockPalette,
  restCamera,
  type SystemColours,
  sideNames,
  viewOf,
} from "@keywork-app/habitat/block";
import {
  noon,
  plotProjects,
  sketchDecorations,
  sketchMonument,
  sketchPartnerships,
  sketchTown,
  slugOf,
} from "@keywork-app/habitat/block/testing";
import { describe, expect, it } from "vitest";
import { keyworkDay, keyworkNight } from "../../../theme/index.ts";
import type { Raster } from "../habitat-render.ts";
import { decodePng, differingPixels, encodePng } from "../png.ts";
import { sourceOfTheme } from "../theme-source.ts";

export const blockShotsDirectory = join(process.cwd(), "artifacts/shots/block-world/stills");
export const stillWidth = 1008;
export const stillHeight = 580;
const accepting = process.env.BLOCK_SHOTS === "update";
const counts = [1, 2, 5, 9, 16] as const;
const appearances: readonly Appearance[] = ["night", "day"];

describe("block world stills", () => {
  for (const kit of kits) {
    for (const appearance of appearances) {
      it(`${kit.id} by ${appearance}: 1, 2, 5, 9 and 16 creatures from every side, level and raised`, () => {
        const findings: string[] = [];
        for (const count of counts) {
          for (const [quarter, side] of sideNames.entries()) {
            for (const [eye, named] of [
              [levelEye, "level"],
              [raisedEye, "raised"],
            ] as const) {
              const raster = still(kit, appearance, count, restCamera(quarter, eye), eye);
              findings.push(
                ...compare(`${kit.id}-${count}-${side}-${named}-${appearance}.png`, raster),
              );
            }
          }
        }
        expect(findings).toEqual([]);
      });

      it(`${kit.id} by ${appearance}: mid-turn, on a corner, and a plot that grows towers`, () => {
        const turning = still(
          kit,
          appearance,
          9,
          { angle: quarterTurn * 0.35, eye: raisedEye * 0.8 },
          raisedEye,
        );
        const corner = still(kit, appearance, 9, restCamera(0, raisedEye, true), raisedEye);
        const towers = still(kit, appearance, 2, restCamera(0, raisedEye), raisedEye, {
          [slugOf(0)]: plotProjects(7, [1, 3, 9, 20]),
        });
        expect([
          ...compare(`${kit.id}-9-turning-${appearance}.png`, turning),
          ...compare(`${kit.id}-9-corner-${appearance}.png`, corner),
          ...compare(`${kit.id}-2-towers-${appearance}.png`, towers),
        ]).toEqual([]);
      });

      it(`${kit.id} by ${appearance}: under forced colours, in a light and a dark system scheme`, () => {
        const findings = Object.entries(forcedSchemes).flatMap(([scheme, system]) =>
          compare(
            `${kit.id}-9-forced-${scheme}-${appearance}.png`,
            still(kit, appearance, 9, restCamera(0, raisedEye), raisedEye, {}, system),
          ),
        );
        expect(findings).toEqual([]);
      });
    }
  }
});

function still(
  kit: Kit,
  appearance: Appearance,
  count: number,
  camera: Camera,
  eye: number,
  projects: Parameters<typeof blockScene>[1]["projects"] = {},
  forced?: SystemColours,
): Raster {
  const world = blockScene(sketchTown(count, noon), {
    kit,
    appearance,
    now: noon,
    partnerships: sketchPartnerships(count),
    decorations: sketchDecorations(count),
    monument: sketchMonument(count),
    projects,
  }).world;
  const colours = kit.colours[appearance];
  const theme = sourceOfTheme(appearance === "night" ? keyworkNight : keyworkDay);
  const view = viewOf(world, stillWidth, stillHeight, eye);
  const list = drawList(world, camera, view, 0, colours.haze);
  return rasterizePicture(
    {
      list,
      backdrop: backdropOf(colours, view),
      lights: firefliesOf(colours, view, list.pivot.y, 0),
    },
    forced === undefined
      ? resolveBlockPalette(kit, appearance, theme.read("--kw-background"))
      : forcedBlockPalette(kit, appearance, forced),
  );
}

const forcedSchemes: Readonly<Record<string, SystemColours>> = {
  dark: { Canvas: "#000000", CanvasText: "#ffffff", Highlight: "#1aebff", GrayText: "#3ff23f" },
  light: { Canvas: "#ffffff", CanvasText: "#000000", Highlight: "#37006e", GrayText: "#600000" },
};

function compare(name: string, fresh: Raster): string[] {
  mkdirSync(blockShotsDirectory, { recursive: true });
  const path = join(blockShotsDirectory, name);
  if (!existsSync(path) || accepting) {
    writeFileSync(path, encodePng(fresh));
    return [];
  }
  const kept = decodePng(new Uint8Array(readFileSync(path)));
  const differing = differingPixels(kept, fresh);
  if (differing === undefined) {
    return [`${name}: kept ${kept.width}x${kept.height}, drawn ${fresh.width}x${fresh.height}`];
  }
  return differing === 0
    ? []
    : [`${name}: ${differing} pixels differ (BLOCK_SHOTS=update accepts)`];
}
