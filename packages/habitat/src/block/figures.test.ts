import { describe, expect, it } from "vitest";
import { skinIds } from "../skins/index.ts";
import {
  critterParts,
  type Doing,
  figureArts,
  figureFor,
  figureOfSkin,
  neutralFigure,
} from "./figures.ts";
import { kits } from "./kits/index.ts";
import { identityRamp } from "./model.ts";
import { resolveBlockPalette } from "./palette.ts";
import { pageGround } from "./testing.ts";

const generated = ["folio", "tessera", "cairn", "purl", "hush", "knot"] as const;
const doings: readonly Doing[] = ["work", "porch", "walk", "nap", "idle", "blocked", "sit"];

describe("the creatures in the town", () => {
  it("names a figure for every skin the app has, and the neutral one for a skin with none", () => {
    expect(Object.keys(figureOfSkin).sort()).toEqual(skinIds().sort());
    expect(figureFor("kid").name).toBe("kid");
    expect(figureFor("tessera").name).toBe("tessera");
    expect(figureFor("cairn").name).toBe("cairn");
    for (const skin of [
      "carter",
      "joiner",
      "placeholder",
      "unheard-of",
      "constructor",
      undefined,
    ]) {
      expect(figureFor(skin), String(skin)).toBe(neutralFigure);
    }
  });

  it("draws a creature whose skin is named for one of the six by that figure", () => {
    for (const name of generated) expect(figureFor(name).name).toBe(name);
  });

  it("holds the six generated figures at about 26 by 22, and the kid as it was", () => {
    for (const name of generated) {
      const rows = figureArts[name]?.rows ?? [];
      const width = Math.max(...rows.map((row) => row.length));
      expect(width, name).toBeGreaterThanOrEqual(24);
      expect(width, name).toBeLessThanOrEqual(28);
      expect(rows.length, name).toBeGreaterThanOrEqual(18);
      expect(rows.length, name).toBeLessThanOrEqual(26);
    }
    expect(figureArts.kid?.rows.length).toBe(16);
    expect(figureArts.kid?.rows.every((row) => row.length === 13)).toBe(true);
  });

  it("paints every figure in every doing from roles each kit resolves, in any of the eight colours", () => {
    for (const kit of kits) {
      for (const appearance of ["night", "day"] as const) {
        const palette = resolveBlockPalette(kit, appearance, pageGround[appearance]);
        for (const figure of [...Object.values(figureArts), neutralFigure]) {
          for (const doing of doings) {
            for (const part of critterParts(figure, doing, 3)) {
              if (!("sprite" in part)) continue;
              for (const frame of part.sprite.frames) {
                for (const role of frame.roles) {
                  for (let identity = 0; identity < 8; identity += 1) {
                    expect(
                      palette.colourOf(role, identityRamp(identity)),
                      `${kit.id} ${appearance} ${figure.name} ${doing} ${role}`,
                    ).toBeDefined();
                  }
                }
              }
            }
          }
        }
      }
    }
  });

  it("keeps each figure's body inside its own frame, standing on its spot", () => {
    for (const figure of Object.values(figureArts)) {
      for (const doing of doings) {
        const [body] = critterParts(figure, doing, 0);
        if (body === undefined || !("sprite" in body)) throw new Error(figure.name);
        const width = Math.max(...figure.rows.map((row) => row.length));
        const frame = body.sprite.frames[0];
        expect(frame?.width, `${figure.name} ${doing}`).toBeGreaterThanOrEqual(width);
        expect(body.sprite.left, `${figure.name} ${doing}`).toBe(Math.min(-(width >> 1), -3));
        expect(body.sprite.top + (frame?.height ?? 0), `${figure.name} ${doing}`).toBe(0);
      }
    }
  });
});
