import { describe, expect, it } from "vitest";
import { poseNames } from "../pose/skin.ts";
import { bitmapFromRows, rowsFromBitmap, worldGlyphs } from "../skins/legend.ts";
import { placeholderSkin } from "../skins/placeholder.ts";
import { emptyHabitat, emptyThread, type HabitatState } from "../world/types.ts";
import { glyphFrame, glyphGap, glyphSize } from "./glyph.ts";
import {
  crownRow,
  type FigurePose,
  figureAt,
  glyphOrigin,
  liftLimit,
  paintedHeight,
  paintStead,
  placeFigure,
  pointerOffset,
  restingPose,
  type SteadPainting,
  samePainting,
  shownPose,
} from "./paint.ts";
import {
  forcedPalette,
  type PaletteSource,
  paletteRoles,
  resolveGlyphPalette,
  resolvePalette,
  resolveSky,
  unresolvedRoles,
} from "./palette.ts";
import {
  alphaMask,
  createRasterSurface,
  hitMaskOf,
  hitTest,
  mirrors,
  paintIndexed,
  rasterize,
  rgbaOf,
} from "./raster.ts";
import { artScale, createRenderer, scaleFor } from "./renderer.ts";
import {
  anchorsFor,
  composeStead,
  groundY,
  hotspotAt,
  minimumWidth,
  placeX,
  sceneHeight,
  slotOfX,
  xOfSlot,
} from "./stead.ts";

const tokens: Record<string, string> = {
  "--kw-terminal-black": "#101010",
  "--kw-text": "#f0f0f0",
  "--kw-background": "#202020",
  "--kw-accent": "#aa88ff",
  "--kw-ramp-1": "#aa88ff",
  "--kw-ramp-2": "#7799ff",
  "--kw-ramp-3": "#77ccff",
  "--kw-panel-lift": "#303030",
  "--kw-success": "#88cc66",
  "--kw-terminal-yellow": "#ddaa55",
  "--kw-error": "#ff6688",
  "--kw-panel": "#282828",
  "--kw-text-faint": "#404040",
  "--kw-text-dim": "#606060",
  "--kw-border": "#3a3a4a",
  "--kw-terminal-cyan": "#55cccc",
  "--kw-terminal-red": "#cc5555",
};

function tracingSource(appearance: "dark" | "light" = "dark"): PaletteSource & { reads: string[] } {
  const reads: string[] = [];
  return {
    appearance,
    reads,
    read: (name) => {
      reads.push(name);
      const value = tokens[name];
      if (value === undefined) throw new Error(`no token ${name}`);
      return value;
    },
    mix: (from, toward, amount) => `mix(${from},${toward},${amount})`,
  };
}

describe("the palette roles", () => {
  it("resolves all sixteen indices from tokens through the art direction's derivations", () => {
    const source = tracingSource();
    const palette = resolvePalette(source, { hueStop: 2 });
    expect(palette).toHaveLength(16);
    expect(unresolvedRoles(palette)).toEqual([]);
    expect(palette[0]).toBe("transparent");
    expect(palette[2]).toBe(tokens["--kw-ramp-2"]);
    expect(palette[1]).toBe(`mix(${tokens["--kw-ramp-2"]},${tokens["--kw-terminal-black"]},0.35)`);
    expect(palette[3]).toBe(`mix(${tokens["--kw-ramp-2"]},${tokens["--kw-text"]},0.3)`);
    expect(palette[4]).toBe(`mix(${tokens["--kw-ramp-2"]},${tokens["--kw-text"]},0.65)`);
    expect(palette[6]).toBe(`mix(${tokens["--kw-panel-lift"]},${tokens["--kw-success"]},0.15)`);
    expect(palette[9]).toBe(tokens["--kw-terminal-black"]);
    expect(palette[10]).toBe(tokens["--kw-terminal-yellow"]);
    expect(palette[11]).toBe(tokens["--kw-accent"]);
    expect(palette[12]).toBe(tokens["--kw-error"]);
    expect(palette[13]).toBe(tokens["--kw-panel"]);
    expect(palette[14]).toBe(tokens["--kw-text-faint"]);
    expect(palette[15]).toBe(tokens["--kw-text-dim"]);
    expect(paletteRoles.map((role) => role.index)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it("takes the accent for a creature without a hue slot and paper from the background by day", () => {
    const dark = resolvePalette(tracingSource("dark"));
    const light = resolvePalette(tracingSource("light"));
    expect(dark[2]).toBe(tokens["--kw-accent"]);
    expect(dark[3]).toContain(tokens["--kw-text"]);
    expect(light[3]).toContain(tokens["--kw-background"]);
  });

  it("gives world tiles timber in the identity slots and shifts the ground with the season", () => {
    const world = resolvePalette(tracingSource(), { world: true, season: "autumn" });
    expect(world[2]).toBe(`mix(${tokens["--kw-border"]},${tokens["--kw-terminal-yellow"]},0.2)`);
    expect(world[6]).toContain(tokens["--kw-terminal-yellow"]);
    const winter = resolvePalette(tracingSource(), { season: "winter" });
    expect(winter[6]).toContain(`${tokens["--kw-text"]},0.2`);
  });

  it("paints system colors verbatim under forced colors and never reads a token", () => {
    const source = tracingSource();
    const palette = resolvePalette(source, { forcedColors: true });
    expect(palette).toBe(forcedPalette);
    expect(source.reads).toEqual([]);
    expect(palette[9]).toBe("CanvasText");
    expect(palette.slice(1, 9).every((color) => color === "Canvas")).toBe(true);
    expect(palette[10]).toBe("Highlight");
    expect(palette[14]).toBe("GrayText");
    expect(resolveGlyphPalette(source, true)[1]).toBe("CanvasText");
  });

  it("resolves the glyph palette with success reaching the check", () => {
    const glyph = resolveGlyphPalette(tracingSource());
    expect(glyph).toHaveLength(7);
    expect(glyph[4]).toBe(tokens["--kw-success"]);
    expect(glyph[3]).toBe(tokens["--kw-accent"]);
  });
});

describe("the rasterizer", () => {
  const frame = bitmapFromRows(["o#.", ".#o"], worldGlyphs);
  const palette = [
    "transparent",
    "#111111",
    "#222222",
    "#333333",
    "#444444",
    "#555555",
    "#666666",
    "#777777",
    "#888888",
    "#999999",
  ];

  it("paints horizontal runs at integer scale and skips transparent pixels", () => {
    const calls: string[] = [];
    const surface = {
      fillStyle: "",
      fillRect: (x: number, y: number, w: number, h: number) =>
        calls.push(`${surface.fillStyle}@${x},${y} ${w}x${h}`),
      clearRect: () => undefined,
    };
    paintIndexed(surface, frame, palette, 2, 10, 20);
    expect(calls).toEqual([
      "#999999@10,20 2x2",
      "#222222@12,20 2x2",
      "#222222@12,22 2x2",
      "#999999@14,22 2x2",
    ]);
  });

  it("rasterizes to rgba with alpha zero where the frame is transparent", () => {
    const raster = rasterize(frame, palette, 2);
    expect(raster.width).toBe(6);
    expect(raster.height).toBe(4);
    expect([...raster.rgba.slice(0, 4)]).toEqual([0x99, 0x99, 0x99, 255]);
    expect([...raster.rgba.slice(4 * 4, 4 * 4 + 4)]).toEqual([0, 0, 0, 0]);
    expect(() => rasterize(frame, ["transparent", "Canvas"], 1)).toThrow(/hex color/);
  });

  it("reads three, six and eight digit hex", () => {
    expect(rgbaOf("#abc")).toEqual([0xaa, 0xbb, 0xcc, 255]);
    expect(rgbaOf("#aabbcc")).toEqual([0xaa, 0xbb, 0xcc, 255]);
    expect(rgbaOf("#aabbcc80")).toEqual([0xaa, 0xbb, 0xcc, 0x80]);
  });

  it("hit tests the alpha of the current frame, mirrored when the creature faces left", () => {
    const skin = placeholderSkin();
    expect(hitTest(skin, "idle", 0, 24, 40)).toBe(true);
    expect(hitTest(skin, "idle", 0, 1, 1)).toBe(false);
    expect(hitTest(skin, "idle", 0, -1, 5)).toBe(false);
    expect(hitTest(skin, "idle", 0, 48, 5)).toBe(false);
    const asymmetric = poseNames.find((pose) => {
      for (let y = 0; y < 52; y += 1) {
        for (let x = 0; x < 48; x += 1) {
          if (hitTest(skin, pose, 0, x, y) !== hitTest(skin, pose, 0, 47 - x, y)) return true;
        }
      }
      return false;
    });
    expect(asymmetric).toBeDefined();
    const pose = asymmetric as (typeof poseNames)[number];
    const facingLeft = hitMaskOf(skin, pose, 0, 1, "left");
    const facingRight = hitMaskOf(skin, pose, 0, 1, "right");
    expect(facingLeft.bits).not.toEqual(facingRight.bits);
    expect(mirrors("walk-left", "left")).toBe(false);
    expect(mirrors("look", "left")).toBe(false);
    expect(mirrors("wait", "left")).toBe(true);
    expect(hitMaskOf(skin, "walk-left", 0, 1, "left").bits).toEqual(
      hitMaskOf(skin, "walk-left", 0, 1, "right").bits,
    );
  });

  it("scales the alpha mask by whole device pixels", () => {
    const mask = alphaMask(frame, 3);
    expect(mask.width).toBe(9);
    expect(mask.height).toBe(6);
    expect(mask.bits[0]).toBe(1);
    expect(mask.bits[8]).toBe(0);
  });
});

describe("the renderer", () => {
  it("chooses an integer scale per device pixel ratio from a two pixel base cell", () => {
    expect(artScale).toBe(2);
    expect(scaleFor(1)).toBe(2);
    expect(scaleFor(1.25)).toBe(3);
    expect(scaleFor(1.5)).toBe(3);
    expect(scaleFor(2)).toBe(4);
    expect(scaleFor(1, 0.5)).toBe(1);
    expect(scaleFor(0.1, 0.5)).toBe(1);
  });

  it("renders a frame sized by the scale with its alpha and a paint that writes runs", () => {
    const render = createRenderer(placeholderSkin());
    const palette = resolvePalette(tracingSource());
    const frame = render({ clip: "idle", frame: 0, facing: "right" }, palette, { scale: 2 });
    expect(frame.width).toBe(96);
    expect(frame.height).toBe(104);
    expect(frame.alpha).toHaveLength(96 * 104);
    let paints = 0;
    frame.paint({
      fillStyle: "",
      fillRect: () => {
        paints += 1;
      },
      clearRect: () => undefined,
    });
    expect(paints).toBeGreaterThan(50);
    const again = render({ clip: "idle", frame: 0, facing: "right" }, palette, { scale: 2 });
    expect(again.alpha).toBe(frame.alpha);
    const left = render({ clip: "wait", frame: 0, facing: "left" }, palette, { scale: 2 });
    const right = render({ clip: "wait", frame: 0, facing: "right" }, palette, { scale: 2 });
    expect(left.indexed).not.toBe(right.indexed);
    expect(left.indexed).toBe(
      render({ clip: "wait", frame: 0, facing: "left" }, palette, { scale: 1 }).indexed,
    );
  });
});

describe("the glyphs", () => {
  it("draws a seven pixel plumbob for every state but idle", () => {
    for (const glyph of ["bell", "cross", "check", "dot", "pause"] as const) {
      const frame = glyphFrame(glyph);
      expect(frame?.width, glyph).toBe(glyphSize);
      expect(frame?.height, glyph).toBe(glyphSize);
    }
    expect(glyphFrame("none")).toBeUndefined();
  });
});

describe("the stead scene", () => {
  const at = Date.UTC(2026, 10, 5, 12, 0, 0);

  function stead(change: (state: HabitatState) => HabitatState = (state) => state): HabitatState {
    const base: HabitatState = {
      ...emptyHabitat(0),
      creatures: {
        wren: {
          slug: "wren",
          name: "Wren",
          skin: "kid",
          seed: 1,
          workshop: {
            raisedAt: "2026-11-05T09:00:00.000Z",
            parcel: undefined,
            substrate: "host",
            health: "up",
            boardedAt: undefined,
          },
          conversation: undefined,
          chores: [],
        },
      },
    };
    return change(base);
  }

  it("composes an empty stead no narrower than the minimum, with the ground band under the ground line", () => {
    const scene = composeStead(emptyHabitat(0), at);
    expect(scene.width).toBeGreaterThanOrEqual(minimumWidth);
    expect(scene.height).toBe(sceneHeight);
    const rows = rowsFromBitmap(scene.bitmap, worldGlyphs);
    expect(rows[groundY]).toMatch(/^[wp]+$/);
    expect(rows[groundY + 3]).toMatch(/^s+$/);
    expect(rows[groundY - 1]).toContain("o");
  });

  it("keeps a creature's slot anchors increasing from the tree to the gate", () => {
    const scene = composeStead(stead(), at);
    const anchors = anchorsFor(scene, "wren");
    expect(anchors).toHaveLength(12);
    for (const [before, after] of [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 6],
      [6, 5],
      [5, 7],
      [7, 8],
      [8, 9],
    ]) {
      expect(anchors[after as number], `slot ${after} right of ${before}`).toBeGreaterThan(
        anchors[before as number] as number,
      );
    }
    expect(xOfSlot(anchors, 4.5)).toBe(((anchors[4] as number) + (anchors[5] as number)) / 2);
    expect(slotOfX(anchors, xOfSlot(anchors, 2.25))).toBeCloseTo(2.25, 5);
    expect(placeX(scene, "wren", "bench")).toBe(anchors[5]);
  });

  it("names what each building stands for when clicked", () => {
    const scene = composeStead(stead(), at);
    const kinds = scene.hotspots.map((spot) => spot.target.kind).sort();
    expect(kinds).toEqual(["porch", "storehouse", "workshop"]);
    const shop = scene.hotspots.find((spot) => spot.target.kind === "workshop");
    expect(shop).toBeDefined();
    if (shop !== undefined) {
      expect(hotspotAt(scene, shop.x + 1, shop.y + 1)?.target).toEqual({
        kind: "workshop",
        creature: "wren",
      });
    }
    expect(hotspotAt(scene, 0, 0)).toBeUndefined();
  });

  it("rings the bell in the needs-you index while a creature is at the porch, and not otherwise", () => {
    const quiet = composeStead(stead(), at);
    const asked = composeStead(
      stead((state) => ({
        ...state,
        threads: {
          t1: {
            ...emptyThread("t1", "2026-11-05T11:00:00.000Z"),
            creature: "wren",
            asks: {
              c1: {
                callId: "c1",
                tool: "bash",
                subject: "rm",
                askedAt: "2026-11-05T11:00:00.000Z",
              },
            },
          },
        },
      })),
      at,
    );
    expect([...quiet.bitmap.indices].includes(11)).toBe(false);
    expect([...asked.bitmap.indices].includes(11)).toBe(true);
    expect(asked.readings.wren?.state).toBe("porch");
  });

  it("lights the workshop lamp while a thread runs there", () => {
    const working = composeStead(
      stead((state) => ({
        ...state,
        threads: {
          t1: {
            ...emptyThread("t1", "2026-11-05T11:59:00.000Z"),
            creature: "wren",
            turn: {
              startedAt: "2026-11-05T11:59:00.000Z",
              lastProgressAt: "2026-11-05T11:59:30.000Z",
              tool: undefined,
              stumbledAt: undefined,
            },
          },
        },
      })),
      at,
    );
    const idle = composeStead(stead(), at);
    const lamps = (scene: typeof idle): number =>
      [...scene.bitmap.indices].filter((index) => index === 10).length;
    expect(lamps(working)).toBeGreaterThan(lamps(idle));
  });

  it("plants the tree, fences a parcel with a lane and a signpost, and fogs it when offline", () => {
    const grown = composeStead(
      stead((state) => ({
        ...state,
        landmarks: [
          { kind: "tree", creature: "wren", at: "2026-06-01T00:00:00.000Z", evidence: "thread:t1" },
        ],
        parcels: {
          house: {
            id: "house",
            name: "moak-main",
            roles: ["house"],
            online: true,
            path: undefined,
            fencedAt: "2026-11-05T00:00:00.000Z",
            seenAt: "2026-11-05T00:00:00.000Z",
          },
          spark: {
            id: "spark",
            name: "spark-ad4d",
            roles: ["host"],
            online: false,
            path: "relay",
            fencedAt: "2026-11-05T00:00:00.000Z",
            seenAt: "2026-11-05T00:00:00.000Z",
          },
        },
        gates: {
          g1: {
            id: "g1",
            creature: "wren",
            parcel: "spark",
            caps: ["exec"],
            openedAt: "2026-11-05T00:00:00.000Z",
            expiresAt: undefined,
            latchedAt: undefined,
            walks: 0,
            lastWalkAt: undefined,
          },
        },
      })),
      at,
    );
    const bare = composeStead(stead(), at);
    expect(grown.width).toBeGreaterThan(bare.width);
    expect([...grown.bitmap.indices].includes(14)).toBe(true);
    expect(grown.hotspots.some((spot) => spot.target.kind === "parcel")).toBe(true);
    const anchors = anchorsFor(grown, "wren");
    expect(anchors[11]).toBeGreaterThan(anchors[9] as number);
    expect(anchors[0]).toBeLessThan(anchors[1] as number);
  });

  it("turns the mill sails only while a model is loaded", () => {
    const withMill = (loaded: string[], now: number) =>
      composeStead(
        stead((state) => ({
          ...state,
          mills: {
            m1: {
              id: "m1",
              parcel: "nowhere",
              name: "ollama",
              loaded,
              busy: false,
              builtAt: "2026-11-05T00:00:00.000Z",
            },
          },
        })),
        now,
      );
    const stillA = withMill([], at);
    const stillB = withMill([], at + 500);
    expect(stillA.bitmap.indices).toEqual(stillB.bitmap.indices);
    const turningA = withMill(["llama"], at);
    const turningB = withMill(["llama"], at + 1000);
    expect(turningA.bitmap.indices).not.toEqual(turningB.bitmap.indices);
    expect(turningA.hotspots.some((spot) => spot.target.kind === "mill")).toBe(true);
  });
});

describe("the sky", () => {
  it("resolves two bands per phase from the pane background, none of them a literal", () => {
    const source = tracingSource();
    expect(resolveSky(source, "day")).toEqual({
      zenith: tokens["--kw-background"],
      horizon: `mix(${tokens["--kw-background"]},${tokens["--kw-terminal-cyan"]},0.15)`,
    });
    expect(resolveSky(source, "night").zenith).toBe(
      `mix(${tokens["--kw-background"]},${tokens["--kw-terminal-black"]},0.35)`,
    );
    expect(resolveSky(source, "dusk").horizon).toContain(tokens["--kw-terminal-yellow"]);
    expect(resolveSky(source, "dawn").horizon).toContain(tokens["--kw-terminal-red"]);
    const forced = tracingSource();
    expect(resolveSky(forced, "day", true)).toEqual({ zenith: "Canvas", horizon: "Canvas" });
    expect(forced.reads).toEqual([]);
  });
});

describe("the painter", () => {
  const at = Date.UTC(2026, 10, 5, 12, 0, 0);
  const skin = placeholderSkin();
  const model: FigurePose = {
    clip: "idle",
    frame: 0,
    facing: "right",
    x: 5,
    lift: 0,
    blink: false,
    gaze: undefined,
    glyph: "none",
  };
  const hexSource: PaletteSource = {
    appearance: "dark",
    read: (name) => tokens[name] as string,
    mix: mixHex,
  };

  function oneCreature(): HabitatState {
    return {
      ...emptyHabitat(0),
      creatures: {
        wren: {
          slug: "wren",
          name: "Wren",
          skin: "placeholder",
          seed: 1,
          workshop: {
            raisedAt: "2026-11-05T09:00:00.000Z",
            parcel: undefined,
            substrate: "host",
            health: "up",
            boardedAt: undefined,
          },
          conversation: undefined,
          chores: [],
        },
      },
    };
  }

  it("stands a creature on the ground line at its slot and hit tests the frame alpha", () => {
    const scene = composeStead(oneCreature(), at);
    const placed = placeFigure(scene, "wren", skin, model);
    expect(placed.top + skin.groundLine).toBe(scene.groundY);
    expect(placed.left + skin.cell.width / 2).toBe(placeX(scene, "wren", "bench"));
    expect(figureAt([placed], placed.left + 24, placed.top + 40)).toBe(placed);
    expect(figureAt([placed], placed.left + 1, placed.top + 1)).toBeUndefined();
    expect(placeFigure(scene, "wren", skin, { ...model, lift: 9 }).top).toBe(
      placed.top - liftLimit,
    );
  });

  it("shows the blink frame and the gaze row only while idle", () => {
    const base = { ...model, frame: 3 };
    expect(shownPose(skin, { ...base, blink: true })).toEqual({
      clip: "idle",
      frame: 1,
      facing: "right",
    });
    expect(shownPose(skin, { ...base, gaze: { direction: 6 } })).toEqual({
      clip: "look",
      frame: 6,
      facing: "right",
    });
    expect(shownPose(skin, { ...base, clip: "work", blink: true, gaze: { direction: 2 } })).toEqual(
      { clip: "work", frame: 3, facing: "right" },
    );
  });

  it("hangs the glyph above the crown and measures the pointer in slot units from the eyes", () => {
    const scene = composeStead(oneCreature(), at);
    const placed = placeFigure(scene, "wren", skin, { ...model, glyph: "bell" });
    const origin = glyphOrigin(placed);
    expect(origin).toBeDefined();
    if (origin !== undefined) {
      expect(origin.y + glyphSize + glyphGap).toBeLessThanOrEqual(placed.top + crownRow(placed));
    }
    expect(glyphOrigin({ ...placed, glyph: "none" })).toBeUndefined();
    const eyeY = placed.top + skin.cell.height * 0.4;
    const offset = pointerOffset(scene, placed, placeX(scene, "wren", "door"), eyeY);
    expect(offset.dx).toBeCloseTo(-1, 5);
    expect(offset.dy).toBeCloseTo(0, 5);
    const below = pointerOffset(scene, placed, placeX(scene, "wren", "bench"), eyeY + 30);
    expect(below.dy).toBeGreaterThan(0);
  });

  it("paints the sky bands, the ground across the whole width, the scene and the creature", () => {
    const scene = composeStead(oneCreature(), at);
    const width = scene.width + 40;
    const scale = 2;
    const surface = createRasterSurface(width * scale, paintedHeight(scene) * scale);
    const coat = resolvePalette(hexSource, { hueStop: 1 });
    const world = resolvePalette(hexSource, { world: true });
    const placed = placeFigure(scene, "wren", skin, { ...model, glyph: "bell" });
    paintStead(surface, {
      scene,
      width,
      scale,
      sky: resolveSky(hexSource, "day"),
      world,
      glyphs: resolveGlyphPalette(hexSource),
      figures: [{ placed, render: createRenderer(skin), palette: coat }],
    });
    const raster = surface.raster();
    const pixel = (x: number, y: number): number[] => [
      ...raster.rgba.slice((y * raster.width + x) * 4, (y * raster.width + x) * 4 + 4),
    ];
    const count = (color: string): number => {
      const wanted = rgbaOf(color).join(",");
      let seen = 0;
      for (let offset = 0; offset < raster.rgba.length; offset += 4) {
        if ([...raster.rgba.slice(offset, offset + 4)].join(",") === wanted) seen += 1;
      }
      return seen;
    };
    expect(pixel(0, 0)).toEqual([...rgbaOf(tokens["--kw-background"] as string)]);
    expect(pixel((width - 1) * scale, (scene.groundY + 1) * scale)).toEqual([
      ...rgbaOf(world[6] as string),
    ]);
    expect(count(coat[2] as string)).toBeGreaterThan(100);
    expect(count(tokens["--kw-accent"] as string)).toBeGreaterThan(0);
  });

  it("samples a resting figure from its pose and place, never the wake: a cycling clip at its first frame without a blink, a look keeping its direction", () => {
    const idle = {
      clip: "idle",
      frame: 3,
      facing: "right",
      x: 2,
      lift: 0,
      blink: true,
      gaze: undefined,
      glyph: "none",
    } as const;
    expect(restingPose(idle)).toEqual({ ...idle, frame: 0, blink: false });
    expect(restingPose({ ...idle, clip: "sit", frame: 2 })).toMatchObject({
      clip: "sit",
      frame: 0,
    });
    expect(restingPose({ ...idle, clip: "look", frame: 5 })).toMatchObject({
      clip: "look",
      frame: 5,
    });
    expect(restingPose({ ...idle, clip: "walk-left", x: 4.5 })).toMatchObject({ x: 4.5, frame: 0 });
  });

  it("knows an unchanged picture: a fresh compose of the same world and pose is the same painting", () => {
    const render = createRenderer(skin);
    const paintingAt = (pose: FigurePose): SteadPainting => {
      const scene = composeStead(oneCreature(), at);
      return {
        scene,
        width: scene.width,
        scale: 2,
        sky: resolveSky(hexSource, "day"),
        world: resolvePalette(hexSource, { world: true }),
        glyphs: resolveGlyphPalette(hexSource),
        figures: [
          {
            placed: placeFigure(scene, "wren", skin, pose),
            render,
            palette: resolvePalette(hexSource, { hueStop: 1 }),
          },
        ],
      };
    };
    const shown = paintingAt(model);
    expect(samePainting(shown, paintingAt(model))).toBe(true);
    expect(samePainting(shown, paintingAt({ ...model, blink: true }))).toBe(false);
    expect(samePainting(shown, paintingAt({ ...model, glyph: "bell" }))).toBe(false);
    expect(samePainting(shown, { ...shown, scale: 3 })).toBe(false);
    expect(samePainting(shown, { ...shown, sky: resolveSky(hexSource, "night") })).toBe(false);
    const bitmap = shown.scene.bitmap;
    const repainted = {
      ...bitmap,
      indices: bitmap.indices.map((index, at) => (at === 0 ? index + 1 : index)),
    };
    expect(samePainting(shown, { ...shown, scene: { ...shown.scene, bitmap: repainted } })).toBe(
      false,
    );
  });
});

function mixHex(from: string, toward: string, amount: number): string {
  const a = rgbaOf(from);
  const b = rgbaOf(toward);
  const channel = (index: number): string =>
    Math.round((a[index] ?? 0) + ((b[index] ?? 0) - (a[index] ?? 0)) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
