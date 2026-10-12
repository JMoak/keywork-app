import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { graphemeCorpus } from "../packages/ui/src/composer/grapheme-corpus.ts";
import { auditTheme } from "../packages/ui/src/theme/contrast-audit.ts";
import type { Theme } from "../packages/ui/src/theme/schema.ts";
import { gallery } from "../packages/ui/src/theme/themes.ts";
import { repoRoot, reportViolations } from "./lib/repo-files.ts";
import {
  coverageGaps,
  loosenings,
  parseRatchets,
  type Ratchets,
  ratchetsFile,
  regressions,
  tightenable,
} from "./textures/ratchets.ts";

export interface TextureVerdict {
  violations: string[];
  hints: string[];
}

export function judgeTextures(
  ratchets: Ratchets,
  committed: Ratchets | undefined,
  themes: readonly Theme[],
): TextureVerdict {
  const audits = themes.map(auditTheme);
  const measured = {
    "T1.graphemeCorpusSamples": graphemeCorpus.length,
    ...Object.fromEntries(
      audits.flatMap((audit) => [
        [`T6.minMarginLc.${audit.theme}`, audit.minMarginLc],
        [`T6.sectionMarginLc.${audit.theme}`, audit.sectionMarginLc],
      ]),
    ),
  };
  return {
    violations: [
      ...coverageGaps(ratchets),
      ...(committed === undefined ? [] : loosenings(ratchets, committed)),
      ...audits.flatMap((audit) =>
        audit.failures.map((failure) => `T6 ${audit.theme}: ${failure}`),
      ),
      ...lightAndDark(themes),
      ...regressions(ratchets, measured),
    ],
    hints: tightenable(ratchets, measured),
  };
}

function lightAndDark(themes: readonly Theme[]): string[] {
  return (["light", "dark"] as const)
    .filter((appearance) => !themes.some((theme) => theme.appearance === appearance))
    .map((appearance) => `T6: the gallery ships no ${appearance} theme`);
}

async function recordedRatchets(): Promise<Ratchets> {
  return parseRatchets(JSON.parse(await readFile(join(repoRoot, ratchetsFile), "utf8")));
}

function committedRatchets(): Ratchets | undefined {
  try {
    const committed = execFileSync("git", ["show", `HEAD:${ratchetsFile}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseRatchets(JSON.parse(committed));
  } catch {
    return undefined;
  }
}

if (import.meta.main) {
  const committed = committedRatchets();
  const verdict = judgeTextures(await recordedRatchets(), committed, gallery);
  for (const hint of verdict.hints) console.log(`check:textures: ${hint}`);
  process.exitCode = reportViolations(
    {
      check: "check:textures",
      heading: `Texture ratchets regressed (${ratchetsFile}, docs/textures.md):`,
      scanned: `${gallery.length} themes, ${graphemeCorpus.length} grapheme samples, ${committed === undefined ? "no committed ratchets yet" : "held against HEAD"}`,
    },
    verdict.violations,
  );
}
