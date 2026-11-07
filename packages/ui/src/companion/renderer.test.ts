import { readFileSync } from "node:fs";
import { join } from "node:path";
import { poseNames } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import {
  cell,
  deviceScaleFor,
  groundLine,
  hitMaskOf,
  paintGrid,
  placeholderRenderer,
  type RenderTokens,
  tokensFromStyle,
} from "./renderer.ts";

const tokens: RenderTokens = {
  identity: ["i1", "i2", "i3", "i4"],
  ground: ["g1", "g2", "g3", "g4"],
  outline: "o",
  accent: "a",
};

describe("the renderer module", () => {
  it("carries no timing table and no pose list of its own: both come from the skin and the habitat", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/ui/src/companion/renderer.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/timingOf|frameAt|idleTiming|ClipTiming/);
    expect(source).not.toMatch(/^\s*\| "walk-left"/m);
    expect(source).toMatch(/import type \{ PoseName, Rows \} from "@keywork-app\/habitat"/);
    for (const pose of poseNames) {
      expect(
        placeholderRenderer({ clip: pose, frame: 0, facing: "right" }, tokens, {
          deviceScale: 1,
        }).width,
      ).toBe(cell.width);
    }
  });
});

describe("deviceScaleFor", () => {
  it("is an integer number of device pixels per art pixel, never below one", () => {
    expect(deviceScaleFor(100, 1)).toBe(2);
    expect(deviceScaleFor(100, 1.5)).toBe(3);
    expect(deviceScaleFor(50, 1)).toBe(1);
    expect(deviceScaleFor(200, 2)).toBe(8);
    expect(deviceScaleFor(50, 0.5)).toBe(1);
  });
});

describe("the placeholder renderer", () => {
  it("paints a creature on the ground line with a hard-edged binary alpha", () => {
    const grid = paintGrid({ clip: "idle", frame: 0, facing: "right" });
    expect(grid[groundLine * cell.width + 20]).not.toBe(0);
    expect(grid[2 * cell.width + 2]).toBe(0);
    const frame = placeholderRenderer({ clip: "idle", frame: 0, facing: "right" }, tokens, {
      deviceScale: 2,
    });
    expect(frame.width).toBe(96);
    expect(frame.height).toBe(104);
    expect(new Set(frame.alpha)).toEqual(new Set([0, 1]));
    expect(frame.alpha.some((bit) => bit === 1)).toBe(true);
  });

  it("varies the idle frames and closes the eyes on the blink frame", () => {
    const open = paintGrid({ clip: "idle", frame: 0, facing: "right" });
    const breath = paintGrid({ clip: "idle", frame: 1, facing: "right" });
    const blink = paintGrid({ clip: "idle", frame: 4, facing: "right" });
    expect(breath).not.toEqual(open);
    expect(blink).not.toEqual(open);
    expect(paintGrid({ clip: "blocked", frame: 0, facing: "right" })).not.toEqual(open);
  });

  it("paints only through the palette it was given", () => {
    const fills = new Set<string>();
    const context = {
      clearRect: () => undefined,
      fillRect: () => undefined,
      set fillStyle(value: string) {
        fills.add(value);
      },
    } as unknown as CanvasRenderingContext2D;
    placeholderRenderer({ clip: "carry", frame: 0, facing: "left" }, tokens, {
      deviceScale: 1,
    }).paint(context);
    for (const fill of fills) expect(["i1", "i2", "i4", "g2", "o", "a"]).toContain(fill);
  });
});

describe("tokensFromStyle", () => {
  it("reads the identity ramp from the creature's hue stop and system colors under forced colors", () => {
    const read = (name: string) => `var(${name})`;
    expect(tokensFromStyle(read, 2, false).identity[0]).toBe("var(--kw-ramp-2)");
    expect(tokensFromStyle(read, undefined, false).identity[0]).toBe("var(--kw-accent)");
    expect(tokensFromStyle(read, 2, true)).toEqual({
      identity: ["Canvas", "CanvasText", "Canvas", "CanvasText"],
      ground: ["Canvas", "CanvasText", "Canvas", "CanvasText"],
      outline: "CanvasText",
      accent: "Highlight",
    });
  });
});

describe("hitMaskOf", () => {
  it("projects the frame alpha into window CSS pixels at the creature's offset", () => {
    const frame = placeholderRenderer({ clip: "idle", frame: 0, facing: "right" }, tokens, {
      deviceScale: 2,
    });
    const mask = hitMaskOf(frame, 1, { x: 24, y: 24 }, { width: 144, height: 180 });
    expect(mask.width).toBe(144);
    expect(mask.bits[(24 + groundLine * 2) * 144 + 24 + 48]).toBe(1);
    expect(mask.bits[0]).toBe(0);
    expect(mask.bits[(24 + 2) * 144 + 24 + 2]).toBe(0);
  });
});
