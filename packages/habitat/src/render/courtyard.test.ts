import { describe, expect, it } from "vitest";
import { workshopFamilies } from "../place/architecture.ts";
import type { IndexedFrame } from "../skins/atlas.ts";
import {
  fog,
  groundBase,
  groundHighlight,
  groundLight,
  groundShadow,
  lamplight,
  needsYou,
  transparent,
  trouble,
} from "../skins/legend.ts";
import {
  courtyardFrame,
  courtyardLayout,
  courtyardPalette,
  courtyardSettingOf,
} from "./courtyard.ts";
import { forcedPalette, type PaletteSource, resolvePalette } from "./palette.ts";
import { type WorkshopFrameOptions, workshopFrame } from "./workshop.ts";

describe("court landscapes", () => {
  it("ties settings to zero-based addresses across neighborhoods and retained gaps", () => {
    expect([0, 1, 2, 3, 16, 4096, Number.MAX_SAFE_INTEGER].map(courtyardSettingOf)).toEqual([
      "orchard",
      "quarry",
      "inlet",
      "orchard",
      "quarry",
      "quarry",
      "quarry",
    ]);
    for (const invalid of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(() => courtyardSettingOf(invalid)).toThrow(RangeError);
  });

  it("gives each native plate a distinct horizon, open sky and solid footing at both anchors", () => {
    const plates = [0, 1, 2].map((address) => courtyardFrame(address, "gable"));
    const horizons = new Set<string>();
    for (const plate of plates) {
      expect([plate.width, plate.height]).toEqual([144, 84]);
      const sky = plate.indices.subarray(0, plate.width * 27);
      expect(sky.filter((ink) => ink === transparent).length).toBeGreaterThan(sky.length * 0.85);
      expect(
        plate.indices.every((ink) => ink < 16 && ![lamplight, needsYou, trouble].includes(ink)),
      ).toBe(true);
      const { workshop, resident } = courtyardLayout;
      expect(pixel(plate, resident.x, resident.y)).not.toBe(transparent);
      expect(pixel(plate, workshop.x + 16, workshop.y + 28)).not.toBe(transparent);
      expect(plate.indices.subarray(plate.width * resident.y).includes(transparent)).toBe(false);
      horizons.add(
        Array.from({ length: plate.width }, (_, x) => {
          for (let y = 0; y < plate.height; y++) if (pixel(plate, x, y) !== transparent) return y;
          return plate.height;
        }).join(","),
      );
    }
    expect(horizons.size).toBe(3);
  });

  it("never lends its stored terrain pixels to a caller", () => {
    const frame = courtyardFrame(0, "root");
    const expected = frame.indices.slice();
    frame.indices.fill(trouble);
    expect(courtyardFrame(4095, "root").indices).toEqual(expected);
  });

  it.each(workshopFamilies)("preserves the complete %s facade and its real overlays", (family) => {
    const decorated: WorkshopFrameOptions = {
      garden: "flowers",
      boarded: true,
      lamps: 1,
      lanterns: 1,
      notes: 3,
      crates: 2,
      chores: 2,
    };
    for (const address of [0, 1, 2]) {
      const bare = courtyardFrame(address, family);
      const populated = courtyardFrame(address, family, decorated);
      const native = workshopFrame(family, decorated);
      const expected = bare.indices.slice();
      const { workshop } = courtyardLayout;
      for (let y = 0; y < native.height; y++) {
        for (let x = 0; x < native.width; x++) {
          const ink = pixel(native, x, y);
          if (ink !== transparent) expected[(y + workshop.y) * bare.width + x + workshop.x] = ink;
        }
      }
      expect(populated.indices).toEqual(expected);
    }
  });
});

describe("court palette", () => {
  const source: PaletteSource = {
    appearance: "dark",
    read: (token) => token,
    mix: (ink, pigment, share) => [ink, pigment, share].join("/"),
  };

  it("tints only landscape roles and retains the canonical forced-color palette", () => {
    for (const appearance of ["light", "dark"] as const) {
      const themed = { ...source, appearance };
      const base = resolvePalette(themed, { world: true });
      const terrain = new Set([groundShadow, groundBase, groundLight, groundHighlight, fog]);
      const grounds = new Set<string>();
      for (const address of [0, 1, 2]) {
        const palette = courtyardPalette(themed, address);
        expect(palette.length).toBe(base.length);
        palette.forEach((ink, index) => {
          if (terrain.has(index)) expect(ink).not.toEqual(base[index]);
          else expect(ink).toEqual(base[index]);
        });
        grounds.add(palette[groundBase] as string);
        expect(courtyardPalette(themed, address, true)).toBe(forcedPalette);
      }
      expect(grounds.size).toBe(3);
    }
  });
});

function pixel(frame: IndexedFrame, x: number, y: number): number {
  return frame.indices[y * frame.width + x] as number;
}
