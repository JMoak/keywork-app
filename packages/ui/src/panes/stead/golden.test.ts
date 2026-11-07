import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyHabitat, type HabitatState, poseNames } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { hueStop } from "../../chrome/pane-frame.tsx";
import { keyworkDay, keyworkNight, type Theme } from "../../theme/index.ts";
import {
  composeStead,
  createRasterSurface,
  createRenderer,
  loadSkin,
  paintedHeight,
  paintStead,
  placeFigure,
  resolveGlyphPalette,
  resolvePalette,
  resolveSky,
} from "./habitat-render.ts";
import { decodePng, differingPixels, encodePng } from "./png.ts";
import { sourceOfTheme } from "./theme-source.ts";

export const shotsDirectory = join(process.cwd(), "artifacts/shots/stead");
export const goldenScale = 2;
const accepting = process.env.STEAD_SHOTS === "update";
const noon = Date.UTC(2026, 10, 5, 12, 0, 0);
const night = Date.UTC(2026, 10, 5, 23, 0, 0);

const loaded = loadSkin("kid");
if (!loaded.ok) throw new Error(loaded.faults.join("; "));
const skin = loaded.skin;
const render = createRenderer(skin);

describe("golden frames at 2x", () => {
  for (const theme of [keyworkNight, keyworkDay]) {
    const source = sourceOfTheme(theme);
    const coat = resolvePalette(source, { hueStop: 1 });

    it(`${theme.name}: every pose row matches its committed strip`, () => {
      const findings: string[] = [];
      for (const pose of poseNames) {
        const frames = skin.rows[pose].frames;
        const width = frames * skin.cell.width * goldenScale;
        const height = skin.cell.height * goldenScale;
        const surface = createRasterSurface(width, height);
        surface.fillStyle = source.read("--kw-background");
        surface.fillRect(0, 0, width, height);
        for (let frame = 0; frame < frames; frame += 1) {
          render({ clip: pose, frame, facing: "right" }, coat, { scale: goldenScale }).paint(
            surface,
            frame * skin.cell.width * goldenScale,
            0,
          );
        }
        const finding = compare(`${pose}--${theme.name}.png`, surface.raster());
        if (finding !== undefined) findings.push(finding);
      }
      expect(findings).toEqual([]);
    });

    it(`${theme.name}: the stead at noon and at night matches its committed scene`, () => {
      const findings = [
        compare(`stead-noon--${theme.name}.png`, sceneRaster(theme, noon)),
        compare(`stead-night--${theme.name}.png`, sceneRaster(theme, night)),
        compare(`stead-three--${theme.name}.png`, sceneRaster(theme, noon, threeCreatures())),
      ].filter((finding): finding is string => finding !== undefined);
      expect(findings).toEqual([]);
    });
  }
});

function sceneRaster(theme: Theme, now: number, stead: HabitatState = populatedStead()) {
  const source = sourceOfTheme(theme);
  const scene = composeStead(stead, now);
  const width = scene.width + 8;
  const surface = createRasterSurface(width * goldenScale, paintedHeight(scene) * goldenScale);
  const figures = Object.values(stead.creatures).map((creature) => ({
    placed: placeFigure(scene, creature.slug, skin, {
      clip: creature.paused === undefined ? "work" : "sit",
      frame: 0,
      facing: "right",
      x: 5,
      lift: 0,
      blink: false,
      gaze: undefined,
      glyph: creature.paused === undefined ? "dot" : "pause",
    }),
    render,
    palette: resolvePalette(source, {
      hueStop: hueStop(creature.seed ?? 0),
      season: scene.sky.season,
    }),
  }));
  paintStead(surface, {
    scene,
    width,
    scale: goldenScale,
    sky: resolveSky(source, scene.sky.phase),
    world: resolvePalette(source, { world: true, season: scene.sky.season }),
    glyphs: resolveGlyphPalette(source),
    figures,
  });
  return surface.raster();
}

function threeCreatures(): HabitatState {
  const one = populatedStead();
  const wren = one.creatures.wren;
  if (wren === undefined) throw new Error("the populated stead has no wren");
  return {
    ...one,
    creatures: {
      wren,
      tam: {
        ...wren,
        slug: "tam",
        name: "Tam",
        seed: 1,
        conversation: undefined,
        chores: [],
        workshop: { ...wren.workshop, raisedAt: "2026-11-05T10:00:00.000Z" },
      },
      ada: {
        ...wren,
        slug: "ada",
        name: "Ada",
        seed: 2,
        conversation: undefined,
        chores: [],
        paused: "2026-11-05T11:00:00.000Z",
        workshop: { ...wren.workshop, raisedAt: "2026-11-05T11:00:00.000Z" },
      },
    },
  };
}

function populatedStead(): HabitatState {
  const earlier = "2026-11-05T09:00:00.000Z";
  return {
    ...emptyHabitat(0),
    asOf: "2026-11-05T11:59:00.000Z",
    creatures: {
      wren: {
        slug: "wren",
        name: "Wren",
        skin: "kid",
        seed: 0,
        workshop: {
          raisedAt: earlier,
          parcel: "house",
          substrate: "host",
          health: "up",
          boardedAt: undefined,
        },
        conversation: "t0",
        chores: [
          {
            id: "c1",
            title: "verify nightly",
            nextAt: "2026-11-06T02:00:00.000Z",
            lastRanAt: earlier,
            running: undefined,
          },
        ],
      },
    },
    threads: {
      t1: {
        id: "t1",
        creature: "wren",
        kind: "thread",
        parent: undefined,
        title: "docs index",
        turn: {
          startedAt: "2026-11-05T11:50:00.000Z",
          lastProgressAt: "2026-11-05T11:58:00.000Z",
          tool: undefined,
          stumbledAt: undefined,
        },
        restingSince: undefined,
        asks: {},
        answered: {},
        back: undefined,
        failure: undefined,
        failures: 0,
        waiting: undefined,
        changes: [],
        queued: 2,
        children: [],
        outcome: undefined,
        lastActivityAt: "2026-11-05T11:58:00.000Z",
        viewedAt: undefined,
        removed: false,
      },
    },
    parcels: {
      house: {
        id: "house",
        name: "moak-main",
        roles: ["house"],
        online: true,
        path: undefined,
        fencedAt: earlier,
        seenAt: earlier,
      },
      spark: {
        id: "spark",
        name: "spark-ad4d",
        roles: ["host"],
        online: true,
        path: "direct",
        fencedAt: earlier,
        seenAt: earlier,
      },
    },
    gates: {
      g1: {
        id: "g1",
        creature: "wren",
        parcel: "spark",
        caps: ["exec"],
        openedAt: earlier,
        expiresAt: undefined,
        latchedAt: undefined,
        walks: 1,
        lastWalkAt: earlier,
      },
    },
    mills: {
      m1: {
        id: "m1",
        parcel: "spark",
        name: "ollama",
        loaded: ["qwen"],
        busy: false,
        builtAt: earlier,
      },
    },
    storehouse: {
      shelves: [
        { thread: "s1", creature: "wren", title: "one", deliveredAt: earlier, changes: 2 },
        { thread: "s2", creature: "wren", title: "two", deliveredAt: earlier, changes: 1 },
        { thread: "s3", creature: "wren", title: "three", deliveredAt: earlier, changes: 4 },
      ],
      folded: 0,
      wings: 1,
    },
    landmarks: [
      { kind: "workshop", creature: "wren", at: earlier, evidence: "creature:wren" },
      { kind: "tree", creature: "wren", at: "2026-06-01T00:00:00.000Z", evidence: "thread:s1" },
      { kind: "lantern-post", creature: "wren", at: earlier, evidence: "gate:g1" },
      { kind: "weathervane", creature: "wren", at: earlier, evidence: "routine:c1" },
    ],
  };
}

function compare(
  name: string,
  fresh: ReturnType<typeof createRasterSurface>["raster"] extends () => infer R ? R : never,
): string | undefined {
  mkdirSync(shotsDirectory, { recursive: true });
  const path = join(shotsDirectory, name);
  if (!existsSync(path) || accepting) {
    writeFileSync(path, encodePng(fresh));
    return undefined;
  }
  const committed = decodePng(new Uint8Array(readFileSync(path)));
  const differing = differingPixels(committed, fresh);
  if (differing === undefined) {
    return `${name}: committed ${committed.width}x${committed.height}, rendered ${fresh.width}x${fresh.height}`;
  }
  return differing === 0
    ? undefined
    : `${name}: ${differing} pixels differ from the committed frame (STEAD_SHOTS=update accepts)`;
}
