import { describe, expect, it } from "vitest";
import { critterParts, type Doing, figureArts, figureFor, figureNames } from "./figures.ts";
import { kits } from "./kits/index.ts";
import { identityRamp } from "./model.ts";
import { resolveBlockPalette } from "./palette.ts";
import { pageGround } from "./testing.ts";

const doings: readonly Doing[] = ["work", "porch", "walk", "nap", "idle", "blocked", "sit"];

describe("the creatures in the town", () => {
  it("draws a retired look as one of the nine, the same one for the same seed", () => {
    expect(figureNames).toEqual([
      "cairn",
      "tessera",
      "folio",
      "purl",
      "hush",
      "knot",
      "beaver",
      "newfie",
      "hippo",
    ]);
    for (const look of ["kid", "carter", "joiner", "placeholder", "constructor", undefined]) {
      for (const seed of [0, 1, 8, 9, 25, 4_000_000_000, -1]) {
        const drawn = figureFor(look, seed);
        expect(drawn, `${look} ${seed}`).toBe(figureArts[figureNames[(seed >>> 0) % 9] ?? "cairn"]);
        expect(figureFor(look, seed), `${look} ${seed}`).toBe(drawn);
      }
    }
    expect(figureFor("kid", 6).name).toBe("beaver");
    expect(figureFor("hippo", 6).name).toBe("hippo");
  });

  it("paints every figure in every doing from roles each kit resolves, in any of the eight colours", () => {
    for (const kit of kits) {
      for (const appearance of ["night", "day"] as const) {
        const palette = resolveBlockPalette(kit, appearance, pageGround[appearance]);
        for (const figure of Object.values(figureArts)) {
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
