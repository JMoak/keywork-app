import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { raisedEye, restCamera } from "./camera.ts";
import { mixHex, overChannel, overHex } from "./colour.ts";
import { drawList, viewOf } from "./draw-list.ts";
import type { Kit } from "./kit.ts";
import { kits } from "./kits/index.ts";
import { shedSpots } from "./layout.ts";
import { type BlockWorld, type Box, type Part, topTexel } from "./model.ts";
import { resolveBlockPalette } from "./palette.ts";
import { blockScene } from "./scene.ts";
import { backdropOf, firefliesOf } from "./sky.ts";
import {
  noon,
  pageGround,
  plotProjects,
  sketchDecorations,
  sketchMonument,
  sketchPartnerships,
  sketchTown,
  slugOf,
} from "./testing.ts";

describe("a kit", () => {
  for (const kit of kits) {
    it(`${kit.id}: draws a project building at 1, 3, 8 and 20 floors on the same footprint`, () => {
      const spot = shedSpots[0];
      if (spot === undefined) throw new Error("no spot");
      const heights = [1, 3, 8, 20].map((floors) => {
        const built = kit.shed({
          seed: 4,
          order: 0,
          spot,
          floors,
          lit: floors % 2 === 0,
          roofed: true,
        });
        const boxes = boxesOf(built.parts);
        for (const box of boxes) {
          expect(box.x0).toBeGreaterThanOrEqual(spot.x0);
          expect(box.x1).toBeLessThanOrEqual(spot.x1);
          expect(box.z0).toBeGreaterThanOrEqual(spot.z0);
          expect(box.z1).toBeLessThanOrEqual(spot.z1);
        }
        expectTexturesFit(built.parts);
        return Math.max(...boxes.map((box) => box.y1));
      });
      expect(heights).toEqual([...heights].sort((a, b) => a - b));
      expect(new Set(heights).size).toBe(4);
    });

    it(`${kit.id}: names only roles its colours define, night and day, decorated or not`, () => {
      for (const appearance of ["night", "day"] as const) {
        const world = worldOf(kit, 16, appearance);
        const palette = resolveBlockPalette(kit, appearance, pageGround[appearance]);
        const view = viewOf(world, 1008, 580, raisedEye);
        const list = drawList(
          world,
          restCamera(0, raisedEye),
          view,
          0,
          kit.colours[appearance].haze,
        );
        const unknown = new Set<string>();
        for (const quad of list.quads) {
          const roles = "texture" in quad.paint ? quad.paint.texture.roles : [quad.paint.fill];
          for (const role of roles) {
            if (palette.colourOf(role, quad.ramp, quad.light, quad.fog, quad.haze) === undefined) {
              unknown.add(role);
            }
          }
        }
        for (const rect of backdropOf(kit.colours[appearance], view)) {
          if (palette.colourOf(rect.role, undefined) === undefined) unknown.add(rect.role);
        }
        for (const light of firefliesOf(kit.colours[appearance], view, list.pivot.y, 3)) {
          if (palette.colourOf(light.role, undefined) === undefined) unknown.add(light.role);
        }
        expect([...unknown], `${kit.id} ${appearance}`).toEqual([]);
      }
    });

    it(`${kit.id}: sizes every face texture to its face, tops at half resolution`, () => {
      const world = worldOf(kit, 9, "night");
      for (const cell of world.cells) {
        expectTexturesFit([
          ...cell.ground.map((box): Part => ({ box })),
          ...cell.items.flatMap((item) => [
            ...item.parts,
            ...(item.crown ?? []).map((crowned) => crowned.part),
          ]),
        ]);
      }
    });
  }
});

describe("the block palette", () => {
  it("takes only the pane's ground from the app theme", () => {
    const kit = kits[0];
    if (kit === undefined) throw new Error("no kit");
    const one = resolveBlockPalette(kit, "night", pageGround.night);
    const other = resolveBlockPalette(kit, "night", pageGround.day);
    expect(one.background).toBe(pageGround.night);
    expect(other.background).toBe(pageGround.day);
    expect(one.colourOf("grass", undefined, "top")).toBe(other.colourOf("grass", undefined, "top"));
    expect(one.key).not.toBe(other.key);
  });

  it("derives ramps and light as the sketch does, and blends as the canvas does", () => {
    expect(mixHex("#204060", "#ffffff", 0.3)).toBe("#637990");
    expect(overChannel(110, 108, Math.round(0.12 * 255))).toBe(109);
    expect(overChannel(196, 108, Math.round(0.06 * 255))).toBe(190);
    expect(overChannel(255, 0, Math.round(0.7 * 255))).toBe(76);
    expect(overHex("#272a54", "#6c2672", 0.12)).toBe("#2f2957");
  });

  it("holds no colour literal outside each kit's colour module", () => {
    const literal =
      /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?|oklch|oklab|color)\(/i;
    const offenders = filesUnder(
      new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    )
      .filter((path) => /\.tsx?$/.test(path))
      .filter((path) => !path.endsWith(".test.ts") && !path.endsWith("testing.ts"))
      .filter((path) => !path.endsWith("colours.ts"))
      .filter((path) => literal.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});

function worldOf(kit: Kit, count: number, appearance: "night" | "day"): BlockWorld {
  return blockScene(sketchTown(count), {
    kit,
    appearance,
    now: noon,
    partnerships: sketchPartnerships(count),
    decorations: sketchDecorations(count),
    monument: sketchMonument(count),
    projects: { [slugOf(0)]: plotProjects(7, [1, 3, 9, 20]) },
  }).world;
}

function boxesOf(parts: readonly Part[]): Box[] {
  return parts.flatMap((part) => ("box" in part ? [part.box] : []));
}

function expectTexturesFit(parts: readonly Part[]): void {
  for (const box of boxesOf(parts)) {
    const across = box.x1 - box.x0;
    const deep = box.z1 - box.z0;
    const tall = box.y1 - box.y0;
    const sizes: Record<string, readonly [number, number]> = {
      pz: [across, tall],
      nz: [across, tall],
      px: [deep, tall],
      nx: [deep, tall],
      top: [across / topTexel, deep / topTexel],
    };
    for (const [face, paint] of Object.entries(box.faces)) {
      if (!("texture" in paint)) continue;
      expect([paint.texture.width, paint.texture.height], face).toEqual(sizes[face]);
    }
  }
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}
