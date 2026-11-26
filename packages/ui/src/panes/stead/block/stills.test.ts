import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Appearance,
  backdropOf,
  blockScene,
  type Camera,
  decoKit,
  drawList,
  firefliesOf,
  firstKit,
  forcedBlockPalette,
  type Kit,
  kits,
  landsOf,
  levelEye,
  mapScene,
  neonKit,
  noLands,
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
  ladderFraming,
  ladderWorld,
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
// Eighty whole towns are drawn in one case: under two seconds on a desk machine, over five on a runner.
const bulkStillsMs = 60_000;
const appearances: readonly Appearance[] = ["night", "day"];
const lotOfNine = [1, 3, 10, 30, 100, 300, 3, 1, 10];
const atWorkOnTheLamps = { id: "/work/lamps", floors: 1, lit: true, conversations: 3 };

describe("block world stills", () => {
  it(
    "a lot of nine buildings from every side, in every kit by night and by day",
    () => {
      const findings: string[] = [];
      for (const kit of kits) {
        for (const appearance of appearances) {
          for (const [quarter, side] of sideNames.entries()) {
            const raster = still(kit, appearance, 2, restCamera(quarter, raisedEye), raisedEye, {
              [slugOf(0)]: plotProjects(9, lotOfNine),
            });
            findings.push(...compare(`${kit.id}-lot-of-nine-${side}-${appearance}.png`, raster));
          }
        }
      }
      expect(findings).toEqual([]);
    },
    bulkStillsMs,
  );

  it(
    "a decorated workshop with its ribbon beside a proven one, in Neon and in Art Deco by night and by day",
    () => {
      const findings: string[] = [];
      for (const kit of [neonKit, decoKit]) {
        for (const appearance of appearances) {
          const camera = restCamera(0, levelEye);
          const earned = still(kit, appearance, 2, camera, levelEye, {}, undefined, {
            [slugOf(0)]: { garland: true, banner: 2, star: true, ribbon: 3 },
            [slugOf(1)]: { garland: true, banner: 1, star: false, ribbon: 1 },
          });
          const ribbonless = still(kit, appearance, 2, camera, levelEye, {}, undefined, {
            [slugOf(0)]: { garland: true, banner: 2, star: true },
            [slugOf(1)]: { garland: true, banner: 1, star: false },
          });
          expect(differingPixels(ribbonless, earned)).toBeGreaterThan(0);
          findings.push(...compare(`${kit.id}-decorated-ribbon-${appearance}.png`, earned));
        }
      }
      expect(findings).toEqual([]);
    },
    bulkStillsMs,
  );

  it(
    "one creature at work from every side, wearing a medal, with an iron and a star-metal tool",
    () => {
      const findings: string[] = [];
      for (const [tier, metal] of [
        [1, "iron"],
        [3, "star-metal"],
      ] as const) {
        for (const [quarter, side] of sideNames.entries()) {
          const earned = { tools: { [slugOf(0)]: tier }, medals: { [slugOf(0)]: true } };
          const camera = restCamera(quarter, levelEye);
          const raster = still(
            firstKit,
            "night",
            1,
            camera,
            levelEye,
            {},
            undefined,
            undefined,
            earned,
          );
          findings.push(...compare(`${firstKit.id}-1-${metal}-medal-${side}-night.png`, raster));
        }
      }
      expect(findings).toEqual([]);
    },
    bulkStillsMs,
  );

  it(
    "the green with a council sitting, its lamp lit, in Neon and in Art Deco, by night and by day",
    () => {
      const findings: string[] = [];
      for (const kit of [neonKit, decoKit]) {
        for (const appearance of appearances) {
          const raster = still(kit, appearance, 5, restCamera(0, raisedEye), raisedEye, {
            [slugOf(0)]: [atWorkOnTheLamps],
            [slugOf(2)]: [atWorkOnTheLamps],
            [slugOf(3)]: [atWorkOnTheLamps],
          });
          findings.push(...compare(`${kit.id}-council-${appearance}.png`, raster));
        }
      }
      expect(findings).toEqual([]);
    },
    bulkStillsMs,
  );

  it(
    "a map of four machines, this one, one answering, one bare and one offline, in Neon and in Deco",
    () => {
      const findings = [neonKit, decoKit].flatMap((kit) =>
        appearances.flatMap((appearance) =>
          compare(`${kit.id}-map-of-four-${appearance}.png`, mapStill(kit, appearance)),
        ),
      );
      expect(findings).toEqual([]);
    },
    bulkStillsMs,
  );

  for (const kit of kits) {
    for (const appearance of appearances) {
      it(
        `${kit.id} by ${appearance}: 1, 2, 5, 9 and 16 creatures from every side, level and raised`,
        () => {
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
        },
        bulkStillsMs,
      );

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

      it(`${kit.id} by ${appearance}: the six project stages, from the front and from a corner`, () => {
        expect([
          ...compare(`${kit.id}-ladder-front-${appearance}.png`, ladder(kit, appearance, false)),
          ...compare(`${kit.id}-ladder-corner-${appearance}.png`, ladder(kit, appearance, true)),
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
  decorations: Parameters<typeof blockScene>[1]["decorations"] = sketchDecorations(count),
  earned: Pick<Parameters<typeof blockScene>[1], "tools" | "medals"> = {},
): Raster {
  const world = blockScene(sketchTown(count, noon), {
    kit,
    appearance,
    now: noon,
    partnerships: sketchPartnerships(count),
    decorations,
    monument: sketchMonument(count),
    projects,
    ...earned,
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

function ladder(kit: Kit, appearance: Appearance, corner: boolean): Raster {
  const world = ladderWorld(kit, appearance);
  const eye = corner ? raisedEye : levelEye;
  const view = viewOf(
    world,
    stillWidth,
    stillHeight,
    eye,
    corner ? { slab: ladderFraming.slab } : ladderFraming,
  );
  const list = drawList(world, restCamera(0, eye, corner), view, 0, kit.colours[appearance].haze);
  const theme = sourceOfTheme(appearance === "night" ? keyworkNight : keyworkDay);
  return rasterizePicture(
    { list, backdrop: [], lights: [] },
    resolveBlockPalette(kit, appearance, theme.read("--kw-background")),
  );
}

function mapStill(kit: Kit, appearance: Appearance): Raster {
  const town = blockScene(sketchTown(5, noon), {
    kit,
    appearance,
    now: noon,
    partnerships: sketchPartnerships(5),
    monument: sketchMonument(5),
  }).world;
  const machine = (
    stableId: string,
    name: string,
    online: boolean,
    path: string,
    answers: boolean,
  ) => ({
    stableId,
    machine: name,
    os: "linux",
    online,
    path: { kind: path, region: "ord" },
    node: answers ? { version: "1.40" } : null,
  });
  const census = {
    self: machine("home", "moak-main", true, "unknown", true),
    peers: [
      machine("studio", "studio", true, "direct", true),
      machine("nas", "nas", true, "derp", false),
      machine("laptop", "old-laptop", false, "offline", false),
    ],
  };
  const world = mapScene({ kit, appearance, town, lands: landsOf(census, noLands) }).world;
  const colours = kit.colours[appearance];
  const theme = sourceOfTheme(appearance === "night" ? keyworkNight : keyworkDay);
  const view = viewOf(world, stillWidth, stillHeight, raisedEye);
  const list = drawList(world, restCamera(0, raisedEye), view, 0, colours.haze);
  return rasterizePicture(
    { list, backdrop: backdropOf(colours, view), lights: [] },
    resolveBlockPalette(kit, appearance, theme.read("--kw-background")),
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
