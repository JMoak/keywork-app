import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeTheme } from "../packages/ui/src/theme/complete.ts";
import { themeSchema } from "../packages/ui/src/theme/schema.ts";
import {
  checkThemes,
  galleryDrift,
  gallerySource,
  galleryViolations,
  houseFile,
  keyworkCompletionOf,
  keyworkGalleryModule,
  recordedThemes,
} from "./sync-themes.ts";

const keyworkCompletion = await keyworkCompletionOf();

describe("check:themes", () => {
  it("holds the app gallery and the default stylesheet to keywork's gallery", async () => {
    expect(await checkThemes(await gallerySource())).toEqual([]);
  });

  it("names a theme added, dropped, changed or reordered at the source", async () => {
    const [night, day] = (await recordedThemes()) as [{ name: string }, unknown];
    const recorded = [night, day];
    const source = {
      origin: "keywork",
      themes: [day, { ...night, gap: 4 }, { ...night, name: "tokyo-night" }],
    };
    expect(galleryDrift(recorded, source)).toEqual([
      "tokyo-night is in keywork but not the app gallery",
      "keywork-night differs from keywork",
      "the gallery order differs from keywork",
    ]);
  });

  it("refuses a gallery that loses a house theme, repeats a name or pairs with nothing", async () => {
    const [night] = (await recordedThemes()) as [{ name: string }];
    expect(galleryViolations([night, { ...night, pair: "nobody" }])).toEqual([
      'the gallery names "keywork-night" twice',
      'the gallery lost the house theme "keywork-day"',
      'keywork-night pairs with "keywork-day", which the gallery lacks',
      'keywork-night pairs with "nobody", which the gallery lacks',
    ]);
  });

  describe("against a keywork checkout", () => {
    let checkout: string;

    beforeAll(async () => {
      checkout = await mkdtemp(join(tmpdir(), "keywork-app-gallery-"));
    });

    afterAll(async () => {
      await rm(checkout, { recursive: true, force: true });
    });

    it("falls back to the house themes when the checkout has no gallery", async () => {
      expect((await gallerySource(checkout)).origin).toBe(houseFile);
    });

    it("imports the gallery module by path when the checkout has one", async () => {
      const themes = await recordedThemes();
      await mkdir(join(checkout, "packages/shared/src/config"), { recursive: true });
      await writeFile(
        join(checkout, keyworkGalleryModule),
        `export const gallery = ${JSON.stringify(themes)};\n`,
      );
      const source = await gallerySource(checkout);
      expect(source.origin).toBe(join(checkout, keyworkGalleryModule));
      expect(source.themes).toEqual(themes);
    });
  });
});

describe.skipIf(keyworkCompletion === undefined)("completeTheme against keywork's", () => {
  it("derives identical sections for every gallery theme with its sections stripped", async () => {
    const theirs = keyworkCompletion as (theme: unknown) => unknown;
    for (const declared of await recordedThemes()) {
      const { terminal, syntax, diff, selection, cursor, ...bare } = themeSchema.parse(declared);
      expect(completeTheme(bare), bare.name).toEqual(theirs(bare));
    }
  });
});
