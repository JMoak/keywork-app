import { describe, expect, it } from "vitest";
import { raisedEye, restCamera } from "./camera.ts";
import { drawList, viewOf } from "./draw-list.ts";
import {
  forcedBlockPalette,
  forcedColourOf,
  onTheRim,
  outlined,
  type SystemColours,
} from "./forced.ts";
import { kits, neonKit } from "./kits/index.ts";
import { resolveBlockPalette } from "./palette.ts";
import { rasterizePicture } from "./raster.ts";
import { blockScene } from "./scene.ts";
import { backdropOf, firefliesOf } from "./sky.ts";
import { noon, pageGround, sketchPartnerships, sketchTown } from "./testing.ts";
import { mixedRole, washedRole } from "./texture.ts";

const probe: SystemColours = {
  Canvas: "#000000",
  CanvasText: "#ffffff",
  Highlight: "#00ffff",
  GrayText: "#808080",
};

describe("the block world under forced colours", () => {
  it("keeps lines as text, lights and the porch's call as highlight, and roads and chalk as grey", () => {
    expect(forcedColourOf("ink")).toBe("CanvasText");
    expect(forcedColourOf("timber")).toBe("CanvasText");
    expect(forcedColourOf(mixedRole("plaster", "ink", 0.22))).toBe("CanvasText");
    expect(forcedColourOf(mixedRole("plaster", "paper", 0.3))).toBe("Canvas");
    expect(forcedColourOf("lamp")).toBe("Highlight");
    expect(forcedColourOf("glow.l#identity-3")).toBe("Highlight");
    expect(forcedColourOf("accent")).toBe("Highlight");
    expect(forcedColourOf("path")).toBe("GrayText");
    expect(forcedColourOf("chalk")).toBe("GrayText");
    expect(forcedColourOf(washedRole("grass", "ink", 0.16))).toBe("Canvas");
    expect(forcedColourOf("hue.b")).toBe("Canvas");
    expect(forcedColourOf("glass")).toBe("Canvas");
  });

  it("tells a lit bench from a dark one in every kit, even where a workshop lights in its own colour", () => {
    for (const kit of kits) {
      const lit = benchRoles(kit.id, true);
      const dark = benchRoles(kit.id, false);
      expect(lit.map(forcedColourOf), kit.id).toContain("Highlight");
      expect(dark.map(forcedColourOf), kit.id).not.toContain("Highlight");
    }
  });

  it("outlines every box face and no sprite, on the face's outermost texels", () => {
    const list = townList("neon", "night");
    const palette = forcedBlockPalette(neonKit, "night");
    const faces = list.quads.filter((quad) => quad.light !== undefined);
    const sprites = list.quads.filter((quad) => quad.light === undefined);
    expect(faces.length).toBeGreaterThan(0);
    expect(sprites.length).toBeGreaterThan(0);
    expect(faces.every((quad) => outlined(quad, palette))).toBe(true);
    expect(sprites.some((quad) => outlined(quad, palette))).toBe(false);
    const plain = resolveBlockPalette(neonKit, "night", pageGround.night);
    expect(faces.some((quad) => outlined(quad, plain))).toBe(false);
    const face = faces[0];
    if (face === undefined) throw new Error("no face");
    const right = Math.ceil(face.width) - 1;
    expect([onTheRim(face, 0, 1), onTheRim(face, right, 1), onTheRim(face, 1, 1)]).toEqual([
      true,
      true,
      right <= 1,
    ]);
  });

  it("rasterises to nothing but the four colours it was given", () => {
    const kit = neonKit;
    const world = blockScene(sketchTown(9, noon), {
      kit,
      appearance: "night",
      now: noon,
      partnerships: sketchPartnerships(9),
    }).world;
    const view = viewOf(world, 504, 290, raisedEye);
    const list = drawList(world, restCamera(0, raisedEye), view, 0, 0);
    const picture = rasterizePicture(
      {
        list,
        backdrop: backdropOf(kit.colours.night, view),
        lights: [],
      },
      forcedBlockPalette(kit, "night", probe),
    );
    const seen = new Set<string>();
    for (let at = 0; at < picture.rgba.length; at += 4) {
      seen.add(
        [picture.rgba[at], picture.rgba[at + 1], picture.rgba[at + 2]]
          .map((channel) => (channel ?? 0).toString(16).padStart(2, "0"))
          .join(""),
      );
    }
    expect([...seen].sort()).toEqual(["000000", "00ffff", "808080", "ffffff"]);
    expect(firefliesOf(kit.colours.night, view, list.pivot.y, 0).length).toBeGreaterThan(0);
  });
});

function townList(kitId: string, appearance: "night" | "day") {
  const kit = kits.find((each) => each.id === kitId) ?? neonKit;
  const world = blockScene(sketchTown(9, noon), {
    kit,
    appearance,
    now: noon,
    partnerships: sketchPartnerships(9),
    projects: { c00: [{ id: "/work/lamps", floors: 3, lit: true }] },
  }).world;
  return drawList(world, restCamera(0, raisedEye), viewOf(world, 1008, 580, raisedEye), 0, 0);
}

function benchRoles(kitId: string, lit: boolean): string[] {
  const kit = kits.find((each) => each.id === kitId) ?? neonKit;
  const built = kit.workshop({
    seed: 3,
    order: 0,
    walls: { pz: "bench", px: "shelf", nz: "board", nx: "door" },
    door: "nx",
    storeys: 1,
    lit,
    loft: false,
    delivered: 0,
    chores: 0,
    notes: 0,
    gates: 0,
    ivy: 0,
    boarded: false,
    night: true,
    garland: false,
    banner: 0,
    star: false,
  });
  const walls = built.parts.flatMap((part) => ("box" in part ? [part.box] : []))[0];
  const bench = walls?.faces.pz;
  return bench !== undefined && "texture" in bench ? [...bench.texture.roles] : [];
}
