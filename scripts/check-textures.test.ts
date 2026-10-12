import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gallery, keyworkDay, keyworkNight } from "../packages/ui/src/theme/themes.ts";
import { judgeTextures } from "./check-textures.ts";
import { repoRoot } from "./lib/repo-files.ts";
import { parseRatchets, ratchetsFile } from "./textures/ratchets.ts";

const ratchets = parseRatchets(JSON.parse(readFileSync(join(repoRoot, ratchetsFile), "utf8")));

describe("check:textures", () => {
  it("holds the shipped gallery and corpus at their ratchets", () => {
    expect(judgeTextures(ratchets, ratchets, gallery).violations).toEqual([]);
  });

  it("fails a light theme that only tints a dark one", () => {
    const tinted = { ...keyworkNight, name: "keywork-day", appearance: "light" as const };
    expect(judgeTextures(ratchets, undefined, [keyworkNight, tinted]).violations).toEqual(
      expect.arrayContaining([
        "T6 keywork-day: text on background reads light-on-dark in a light theme",
        expect.stringMatching(/^T6\.minMarginLc\.keywork-day regressed to /),
      ]),
    );
  });

  it("fails a gallery without a light theme", () => {
    expect(judgeTextures(ratchets, undefined, [keyworkNight]).violations).toContain(
      "T6: the gallery ships no light theme",
    );
  });

  it("fails a theme whose contrast headroom shrank even while it clears the floor", () => {
    const fainterBorder = {
      ...keyworkDay,
      tokens: { ...keyworkDay.tokens, border: "#cdd1df" },
    };
    expect(judgeTextures(ratchets, undefined, [keyworkNight, fainterBorder]).violations).toEqual([
      expect.stringMatching(
        /^T6\.minMarginLc\.keywork-day regressed to \d+(\.\d)?; the ratchet holds 13\.1/,
      ),
    ]);
  });
});
