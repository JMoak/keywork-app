import { describe, expect, it } from "vitest";
import { workshopFamilies } from "../../../place/architecture.ts";
import {
  glass,
  identityShadow,
  lamplight,
  needsYou,
  outline,
  transparent,
  trouble,
} from "../../legend.ts";
import type { Tile } from "../tiles.ts";
import { lit } from "../tiles.ts";
import type { WorkshopRegion } from "./drawing.ts";
import { workshopDesign, workshopDesigns } from "./index.ts";

describe("authored workshops", () => {
  it("gives every family one reusable facade within the same grounded envelope", () => {
    expect(Object.keys(workshopDesigns)).toEqual(workshopFamilies);
    for (const family of workshopFamilies) {
      const design = workshopDesign(family);
      expect(workshopDesign(family)).toBe(design);
      expect(design.id).toBe(family);
      expect(design.facade.width).toBe(32);
      expect(design.facade.height).toBe(28);
      expect(design.facade.indices).toHaveLength(32 * 28);
      expect(design.facade.indices.every((index) => index < 16)).toBe(true);
      expect(occupied(design.facade, 27).length, family).toBeGreaterThanOrEqual(20);
    }
  });

  it("has eight genuinely different silhouettes without relying on color or surface marks", () => {
    for (const [index, family] of workshopFamilies.entries()) {
      const a = workshopDesign(family).facade;
      for (const other of workshopFamilies.slice(index + 1)) {
        const b = workshopDesign(other).facade;
        const difference = a.indices.reduce(
          (count, pixel, at) =>
            count + Number((pixel === transparent) !== (b.indices[at] === transparent)),
          0,
        );
        expect(difference, `${family} and ${other}`).toBeGreaterThan(35);
      }
    }
  });

  it("keeps its two activity lights dark until their authoritative overlays arrive", () => {
    for (const family of workshopFamilies) {
      const { facade, lamp, loft } = workshopDesign(family);
      expect(facade.indices.some((index) => [lamplight, needsYou, trouble].includes(index))).toBe(
        false,
      );
      for (const window of [lamp, loft]) {
        expect(
          regionPixels(facade, window).every((pixel) => pixel === glass),
          family,
        ).toBe(true);
        expect(framed(facade, window), family).toBe(true);
        const illuminated = lit(facade, window);
        const changed = illuminated.indices.reduce(
          (count, pixel, at) => count + Number(pixel !== facade.indices[at]),
          0,
        );
        expect(changed).toBe(window.width * window.height);
        expect(regionPixels(illuminated, window).every((pixel) => pixel === lamplight)).toBe(true);
      }
    }
  });

  it("preserves every work overlay without covering the door or another work signal", () => {
    for (const family of workshopFamilies) {
      const { facade, door, board, notes, crates, lamp, loft } = workshopDesign(family);
      const boardRegion = { ...board, width: 2, height: 2 };
      expect(door.width).toBe(4);
      expect(door.height).toBe(7);
      expect(door.y + door.height).toBe(facade.height - 1);
      expect(regionPixels(facade, door).every((pixel) => pixel === identityShadow)).toBe(true);
      expect(framed(facade, door)).toBe(true);
      expect(regionPixels(facade, boardRegion).every((pixel) => pixel === identityShadow)).toBe(
        true,
      );
      expect(framed(facade, boardRegion)).toBe(true);
      const noteRegions = Array.from({ length: 3 }, (_, index) => ({
        x: notes.x + index * 2,
        y: notes.y - index,
        width: 2,
        height: 2,
      }));
      const crateRegions = Array.from({ length: 2 }, (_, index) => ({
        x: crates.x + index * 4,
        y: facade.height - 3,
        width: 3,
        height: 3,
      }));
      const overlays = [lamp, loft, door, boardRegion, ...noteRegions, ...crateRegions];
      for (const [index, region] of overlays.entries()) {
        expect(within(facade, region), family).toBe(true);
        for (const other of overlays.slice(index + 1)) {
          expect(overlaps(region, other), family).toBe(false);
        }
      }
      expect(
        noteRegions.every((region) =>
          regionPixels(facade, region).every((pixel) => pixel !== transparent),
        ),
        family,
      ).toBe(true);
      for (const y of [door.y + 1, door.y + 4]) {
        expect(within(facade, { x: door.x - 1, y, width: 6, height: 2 }), family).toBe(true);
      }
      expect(
        within(facade, { x: board.x - 1, y: facade.height - 4, width: 4, height: 3 }),
        family,
      ).toBe(true);
    }
  });
});

function occupied(tile: Tile, y: number): number[] {
  return Array.from(tile.indices.slice(y * tile.width, (y + 1) * tile.width)).filter(
    (index) => index !== transparent,
  );
}

function regionPixels(tile: Tile, region: WorkshopRegion): number[] {
  return Array.from({ length: region.height }, (_, row) =>
    Array.from(
      { length: region.width },
      (_, column) => tile.indices[(region.y + row) * tile.width + region.x + column] ?? transparent,
    ),
  ).flat();
}

function framed(tile: Tile, region: WorkshopRegion): boolean {
  const sides = [
    { x: region.x - 1, y: region.y - 1, width: region.width + 2, height: 1 },
    { x: region.x - 1, y: region.y + region.height, width: region.width + 2, height: 1 },
    { x: region.x - 1, y: region.y, width: 1, height: region.height },
    { x: region.x + region.width, y: region.y, width: 1, height: region.height },
  ];
  return sides.every((side) => regionPixels(tile, side).every((pixel) => pixel === outline));
}

function within(tile: Tile, region: WorkshopRegion): boolean {
  return (
    region.x >= 0 &&
    region.y >= 0 &&
    region.x + region.width <= tile.width &&
    region.y + region.height <= tile.height
  );
}

function overlaps(a: WorkshopRegion, b: WorkshopRegion): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
