import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type PoseName, poseNames, referenceRows, type Skin, validateSkin } from "../pose/skin.ts";
import {
  clearSliceCache,
  contentHash,
  lowestOpaqueRow,
  mirrorFrame,
  opaqueCount,
  sliceCacheSize,
  sliceSkin,
} from "./atlas.ts";
import {
  borrowedRows,
  type CodexManifest,
  codexRowMap,
  codexRows,
  importCodexAtlas,
} from "./codex.ts";
import { defaultSkinId, loadSkin, skinIds, skins } from "./index.ts";
import { bitmapFromRows, outline, rowsFromBitmap, transparent, worldGlyphs } from "./legend.ts";
import { groundContact, outlineSeals, validateAtlas } from "./loader.ts";
import { placeholderAirborne, placeholderSkin } from "./placeholder.ts";
import * as tiles from "./world/tiles.ts";

describe("the skin registry", () => {
  it("loads every registered skin, the kid by default", () => {
    expect(skinIds()).toEqual(["kid", "carter", "joiner", "placeholder"]);
    expect(defaultSkinId).toBe("kid");
    for (const id of skinIds()) {
      const loaded = loadSkin(id);
      expect(loaded.ok, id).toBe(true);
      if (loaded.ok) {
        expect(loaded.skin.id).toBe(id);
        expect(loaded.sliced.frame("idle", 0).width).toBe(loaded.skin.cell.width);
      }
    }
  });

  it("refuses an id nobody registered", () => {
    const loaded = loadSkin("mule");
    expect(loaded).toEqual({ ok: false, id: "mule", faults: ['no skin is registered as "mule"'] });
  });

  it("refuses a skin whose source throws, without throwing itself", () => {
    const loaded = loadSkin("broken", {
      broken: () => {
        throw new Error("no atlas today");
      },
    });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok)
      expect(loaded.faults).toEqual(["the skin threw while building: no atlas today"]);
  });

  it("refuses a skin that answers to another name", () => {
    const loaded = loadSkin("alias", { alias: placeholderSkin });
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.faults).toEqual(['skin "alias" calls itself "placeholder"']);
  });
});

describe("atlas validation", () => {
  const sound = placeholderSkin();

  it("accepts the placeholder and the kid as they stand", () => {
    expect(validateAtlas(sound)).toEqual([]);
    expect(validateAtlas(skins.kid?.() as Skin)).toEqual([]);
  });

  it("rejects an atlas narrower than its widest row", () => {
    const atlas = { ...sound.atlas, width: sound.atlas.width - sound.cell.width };
    const faults = validateAtlas({ ...sound, atlas });
    expect(faults.some((fault) => fault.includes("atlas width"))).toBe(true);
  });

  it("rejects an atlas with the wrong number of rows", () => {
    const atlas = { ...sound.atlas, height: sound.cell.height * (poseNames.length - 1) };
    const faults = validateAtlas({ ...sound, atlas });
    expect(faults.some((fault) => fault.includes("atlas height"))).toBe(true);
  });

  it("rejects an atlas whose index buffer does not fill its grid", () => {
    const atlas = { ...sound.atlas, indices: sound.atlas.indices.slice(0, 100) };
    const faults = validateAtlas({ ...sound, atlas });
    expect(faults.some((fault) => fault.includes("holds 100 indices"))).toBe(true);
  });

  it("rejects a palette index past the sixteenth", () => {
    const indices = new Uint8Array(sound.atlas.indices);
    indices[0] = 16;
    const faults = validateAtlas({ ...sound, atlas: { ...sound.atlas, indices } });
    expect(faults.some((fault) => fault.includes("at or above 16"))).toBe(true);
  });

  it("rejects a missing row, a bad timing table and an id that is not kebab-case", () => {
    const { idle: _idle, ...withoutIdle } = sound.rows;
    expect(validateAtlas({ ...sound, rows: withoutIdle as Skin["rows"] })).toEqual([
      "idle: the row is missing",
    ]);
    const badTiming = { ...sound.rows, work: { frames: 6, ms: [100, 100], loop: true } };
    expect(validateAtlas({ ...sound, rows: badTiming })).toContain("work: 2 timings for 6 frames");
    expect(validateAtlas({ ...sound, id: "Not Kebab" })).toContain(
      "skin id Not Kebab is not kebab-case",
    );
  });

  it("rejects a gaze row that is outside the atlas or shorter than its directions", () => {
    expect(validateAtlas({ ...sound, gaze: { row: 40, directions: 8 } })).toContain(
      "gaze row 40 is outside the atlas",
    );
    expect(validateAtlas({ ...sound, gaze: { row: 0, directions: 16 } })).toContain(
      "gaze row holds fewer frames than its 16 directions",
    );
  });

  it("reports a frame that leaves the ground line, and forgives the declared airborne ones", () => {
    expect(groundContact(sound, placeholderAirborne)).toEqual([]);
    const strict = groundContact(sound);
    expect(strict).toEqual([
      "celebrate frame 1 stands on row 47",
      "celebrate frame 2 stands on row 45",
      "greet frame 1 stands on row 48",
      "greet frame 2 stands on row 47",
    ]);
  });

  it("finds no fill pixel touching air in the placeholder: the outline seals every frame", () => {
    expect(outlineSeals(sound)).toEqual([]);
  });

  it("keeps the placeholder on a 48x52 cell with the reference timings and every row drawn", () => {
    expect(sound.cell).toEqual({ width: 48, height: 52 });
    expect(sound.rows).toBe(referenceRows);
    expect(sound.groundLine).toBe(51);
    const sliced = sliceSkin(sound);
    for (const pose of poseNames) {
      for (let frame = 0; frame < sound.rows[pose].frames; frame += 1) {
        expect(opaqueCount(sliced.frame(pose, frame)), `${pose} ${frame}`).toBeGreaterThan(200);
      }
    }
  });

  it("breathes in idle: the chest rises by one row on the inhale frames and the eyes close on the blink", () => {
    const sliced = sliceSkin(sound);
    const top = (frame: number): number => topOpaqueRowOfBody(sliced.frame("idle", frame));
    expect(top(2)).toBe(top(0) - 1);
    expect(top(3)).toBe(top(0) - 1);
    expect(top(5)).toBe(top(0));
    expect(rowsFromBitmap(sliced.frame("idle", 1))).not.toEqual(
      rowsFromBitmap(sliced.frame("idle", 0)),
    );
  });
});

describe("slicing", () => {
  it("caches slices by the content hash, not by object identity", () => {
    clearSliceCache();
    const first = placeholderSkin();
    const second = placeholderSkin();
    expect(first).not.toBe(second);
    expect(sliceSkin(first)).toBe(sliceSkin(second));
    expect(sliceCacheSize()).toBe(1);
    const indices = new Uint8Array(first.atlas.indices);
    indices[5] = 3;
    const changed = { ...first, atlas: { ...first.atlas, indices } };
    expect(sliceSkin(changed)).not.toBe(sliceSkin(first));
    expect(sliceCacheSize()).toBe(2);
    expect(contentHash(changed.atlas)).not.toBe(contentHash(first.atlas));
  });

  it("cuts cells from the right row and clamps the frame index to the row", () => {
    const sliced = sliceSkin(placeholderSkin());
    const idle = sliced.frame("idle", 0);
    const nap = sliced.frame("nap", 0);
    expect(idle.indices).not.toEqual(nap.indices);
    expect(sliced.frame("ring", 99)).toBe(sliced.frame("ring", 3));
    expect(sliced.frame("ring", -1)).toBe(sliced.frame("ring", 0));
    expect(lowestOpaqueRow(idle)).toBe(50);
  });

  it("mirrors a frame around its vertical axis", () => {
    const frame = bitmapFromRows(["o#.", "..."], worldGlyphs);
    expect(rowsFromBitmap(mirrorFrame(frame), worldGlyphs)).toEqual([".#o", "..."]);
    expect(mirrorFrame(mirrorFrame(frame)).indices).toEqual(frame.indices);
  });
});

describe("the codex row map", () => {
  const cell = { width: 4, height: 3 };

  function manifest(): CodexManifest {
    const columns = 3;
    const width = cell.width * columns;
    const height = cell.height * codexRows.length;
    const indices = new Uint8Array(width * height);
    codexRows.forEach((_, row) => {
      for (let column = 0; column < columns; column += 1) {
        const marker = (row + 1) * 1 + column;
        for (let y = 0; y < cell.height; y += 1) {
          for (let x = 0; x < cell.width; x += 1) {
            const inside = x > 0 && x < cell.width - 1 && y < cell.height - 1;
            indices[(row * cell.height + y) * width + column * cell.width + x] = inside
              ? Math.min(15, marker)
              : outline;
          }
        }
      }
    });
    const timing = (frames: number) => ({ frames, ms: Array.from({ length: frames }, () => 100) });
    return {
      id: "imported",
      displayName: "Imported",
      cell,
      groundLine: 3,
      atlas: { width, height, indices },
      rows: {
        idle: timing(3),
        running: timing(2),
        waiting: timing(2),
        review: timing(3),
        failed: timing(1),
        "running-left": timing(3),
        "running-right": timing(3),
        waving: timing(2),
        jumping: timing(2),
      },
    };
  }

  it("renames the nine codex rows into the stead vocabulary and validates the result", () => {
    const skin = importCodexAtlas(manifest());
    expect(validateSkin(skin)).toEqual([]);
    expect(Object.values(codexRowMap).sort()).toEqual(
      [
        "blocked",
        "celebrate",
        "greet",
        "idle",
        "wait",
        "walk-left",
        "walk-right",
        "wave",
        "work",
      ].sort(),
    );
    expect(skin.rows.work.frames).toBe(2);
    expect(skin.rows.celebrate).toEqual({
      frames: 3,
      ms: [100, 100, 100],
      loop: false,
      fallback: "idle",
    });
    const sliced = sliceSkin(skin);
    expect(sliced.frame("work", 0).indices).toEqual(codexCell(manifest(), 1, 0));
    expect(sliced.frame("blocked", 0).indices).toEqual(codexCell(manifest(), 4, 0));
  });

  it("fills the rows codex never drew from a named neighbour, and gives look eight neutral frames", () => {
    const skin = importCodexAtlas(manifest());
    const sliced = sliceSkin(skin);
    for (const [pose, source] of Object.entries(borrowedRows) as [PoseName, PoseName][]) {
      expect(skin.rows[pose].frames, pose).toBeGreaterThan(0);
      if (pose === "look") continue;
      expect(sliced.frame(pose, 0).indices, pose).toEqual(sliced.frame(source, 0).indices);
    }
    expect(skin.rows.look.frames).toBe(8);
    expect(sliced.frame("look", 7).indices).toEqual(sliced.frame("idle", 0).indices);
  });
});

describe("the world tiles", () => {
  it("are all rectangular, use only the sixteen indices, and carry an outline", () => {
    for (const tile of tiles.worldTiles) {
      expect(tile.indices.length, tile.name).toBe(tile.width * tile.height);
      expect(
        [...tile.indices].every((index) => index < 16),
        tile.name,
      ).toBe(true);
      if (tile.width > 4 && tile.name !== "hay")
        expect([...tile.indices].includes(outline), tile.name).toBe(true);
    }
  });

  it("turns the mill sails through four distinct frames with cloth only on the upper arms", () => {
    const frames = Array.from({ length: tiles.sailFrames }, (_, frame) => tiles.millSails(frame));
    const seen = new Set(frames.map((frame) => rowsFromBitmap(frame, worldGlyphs).join("\n")));
    expect(seen.size).toBe(4);
    for (const frame of frames) {
      const rows = rowsFromBitmap(frame, worldGlyphs);
      const lower = rows.slice(tiles.sailRadius + 1).join("");
      expect(lower.includes("=")).toBe(false);
    }
  });

  it("grows the tree from a sapling to a full crown, outlined and standing on its last row", () => {
    const stages = [0, 1, 2].map((stage) => tiles.tree(stage));
    expect(stages.map((tree) => tree.width)).toEqual([7, 11, 17]);
    expect(stages.map((tree) => tree.height)).toEqual([9, 14, 23]);
    for (const stage of stages) {
      expect(lowestOpaqueRow(stage)).toBe(stage.height - 1);
      expect([...stage.indices].includes(outline)).toBe(true);
    }
  });

  it("ghosts a fogged building down to a dashed outline in the fog tone", () => {
    const ghost = tiles.ghosted(tiles.workshop);
    const used = new Set(ghost.indices);
    expect([...used].sort()).toEqual([0, 14]);
    expect(opaqueCount(ghost)).toBeLessThan(opaqueCount(tiles.workshop) / 2);
    expect(opaqueCount(ghost)).toBeGreaterThan(0);
  });

  it("lights a window by painting lamplight over the glass", () => {
    const litShop = tiles.lit(tiles.workshop, tiles.workshopLamp);
    const at = (x: number, y: number): number =>
      litShop.indices[y * litShop.width + x] ?? transparent;
    expect(at(tiles.workshopLamp.x, tiles.workshopLamp.y)).toBe(10);
    expect(
      tiles.workshop.indices[tiles.workshopLamp.y * tiles.workshop.width + tiles.workshopLamp.x],
    ).toBe(13);
  });

  it("turns the vane to four headings", () => {
    const headings = Array.from({ length: 4 }, (_, heading) => tiles.weathervane(heading));
    const seen = new Set(headings.map((vane) => rowsFromBitmap(vane, worldGlyphs).join("\n")));
    expect(seen.size).toBe(4);
  });
});

describe("the palette discipline", () => {
  it("holds no color literal anywhere under skins or render", () => {
    const literal =
      /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?|oklch|oklab|color)\(/i;
    const offenders = [
      ...filesUnder(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
      ...filesUnder(new URL("../render", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
    ]
      .filter((path) => /\.tsx?$/.test(path) && !path.endsWith(".test.ts"))
      .filter((path) => literal.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function topOpaqueRowOfBody(frame: { width: number; height: number; indices: Uint8Array }): number {
  const column = 16;
  for (let y = 23; y < frame.height; y += 1) {
    if (frame.indices[y * frame.width + column] === 2) return y;
  }
  return -1;
}

function codexCell(manifest: CodexManifest, row: number, column: number): Uint8Array {
  const { width, height } = manifest.cell;
  const cell = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const start = (row * height + y) * manifest.atlas.width + column * width;
    cell.set(manifest.atlas.indices.subarray(start, start + width), y * width);
  }
  return cell;
}

describe("slicing by identity", () => {
  it("answers a repeated skin object without hashing the atlas again, so hit tests stay cheap", () => {
    clearSliceCache();
    const skin = placeholderSkin();
    const first = sliceSkin(skin);
    const started = performance.now();
    for (let n = 0; n < 20000; n += 1) sliceSkin(skin);
    expect(performance.now() - started).toBeLessThan(200);
    expect(sliceSkin(skin)).toBe(first);
    expect(sliceCacheSize()).toBe(1);
  });
});
