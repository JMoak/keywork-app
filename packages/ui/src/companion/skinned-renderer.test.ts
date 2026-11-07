import { poseNames } from "@keywork-app/habitat";
import type { PaletteSource } from "@keywork-app/habitat/render";
import { loadSkin } from "@keywork-app/habitat/skins";
import { describe, expect, it } from "vitest";
import { keyworkNight, themeVariables } from "../theme/index.ts";
import { mixOklab } from "../theme/oklab.ts";
import { placeholderRenderer, type RenderTokens } from "./renderer.ts";
import { skinnedRenderer } from "./skinned-renderer.ts";

const tokens: RenderTokens = {
  identity: ["i1", "i2", "i3", "i4"],
  ground: ["g1", "g2", "g3", "g4"],
  outline: "o",
  accent: "a",
};

function nightSource(): PaletteSource {
  const variables = themeVariables(keyworkNight);
  return { read: (name) => variables[name] ?? "", mix: mixOklab, appearance: "dark" };
}

function fakeContext() {
  const fills: Array<[string, number, number, number, number]> = [];
  let fillStyle = "";
  const context = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(color: string) {
      fillStyle = color;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      fills.push([fillStyle, x, y, w, h]);
    },
    clearRect: () => {
      fills.length = 0;
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, fills };
}

describe("the skinned companion renderer", () => {
  const loaded = loadSkin("kid");
  if (!loaded.ok) throw new Error(loaded.faults.join("; "));
  const render = skinnedRenderer(loaded.skin, nightSource);

  it("draws the kid skin at the companion's device scale with a matching alpha mask", () => {
    const frame = render({ clip: "idle", frame: 0, facing: "right" }, tokens, { deviceScale: 2 });
    expect(frame.width).toBe(loaded.skin.cell.width * 2);
    expect(frame.height).toBe(loaded.skin.cell.height * 2);
    expect(frame.alpha).toHaveLength(frame.width * frame.height);
    expect(frame.alpha.some((bit) => bit === 1)).toBe(true);
    const { context, fills } = fakeContext();
    frame.paint(context);
    expect(fills.length).toBeGreaterThan(0);
    expect(fills.every(([color]) => /^#|^[a-zA-Z]/.test(color))).toBe(true);
  });

  it("carries the skin's own rows, so the page animates from the manifest and never from a table", () => {
    expect(render.rows).toBe(loaded.skin.rows);
    expect(render.rows?.idle.ms).toEqual([1680, 660, 660, 840, 840, 1920]);
  });

  it("knows every clip the companion can ask for", () => {
    for (const clip of poseNames) {
      const frame = render({ clip, frame: 0, facing: "left" }, tokens, { deviceScale: 1 });
      expect(frame.width, clip).toBeGreaterThan(0);
    }
  });

  it("paints system colors under forced colors and the coat's ramp otherwise", () => {
    const forced = render({ clip: "idle", frame: 0, facing: "right" }, tokens, {
      deviceScale: 1,
      forcedColors: true,
    });
    const painted = fakeContext();
    forced.paint(painted.context);
    expect(new Set(painted.fills.map(([color]) => color))).toEqual(
      new Set(painted.fills.map(([color]) => color).filter((color) => /^[A-Z]/.test(color))),
    );
    const coated = render({ clip: "idle", frame: 0, facing: "right" }, tokens, {
      deviceScale: 1,
      hueStop: 2,
    });
    const inked = fakeContext();
    coated.paint(inked.context);
    expect(inked.fills.some(([color]) => color.startsWith("#"))).toBe(true);
  });

  it("keeps the placeholder's frame shape so the page's hit mask needs no change", () => {
    const placeholder = placeholderRenderer({ clip: "idle", frame: 0, facing: "right" }, tokens, {
      deviceScale: 1,
    });
    const skinned = render({ clip: "idle", frame: 0, facing: "right" }, tokens, { deviceScale: 1 });
    expect(Object.keys(skinned).sort()).toEqual(Object.keys(placeholder).sort());
  });
});
