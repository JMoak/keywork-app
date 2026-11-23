import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { poseNames } from "@keywork-app/habitat";
import { describe, expect, it } from "vitest";
import { keyworkDay, keyworkNight } from "../../theme/index.ts";
import {
  createRasterSurface,
  createRenderer,
  defaultSkinId,
  loadSkin,
  resolvePalette,
} from "./habitat-render.ts";
import { decodePng, differingPixels, encodePng } from "./png.ts";
import { sourceOfTheme } from "./theme-source.ts";

export const shotsDirectory = join(process.cwd(), "artifacts/shots/stead");
export const goldenScale = 2;
const accepting = process.env.STEAD_SHOTS === "update";

const loaded = loadSkin(defaultSkinId);
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
  }
});

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
