import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { graphemeCorpus } from "../packages/ui/src/composer/grapheme-corpus.ts";
import { auditFlavor } from "../packages/ui/src/flavor/contrast-audit.ts";
import { gallery } from "../packages/ui/src/flavor/flavors.ts";
import type { Flavor } from "../packages/ui/src/flavor/schema.ts";
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
  flavors: readonly Flavor[],
): TextureVerdict {
  const audits = flavors.map(auditFlavor);
  const measured = {
    "T1.graphemeCorpusSamples": graphemeCorpus.length,
    ...Object.fromEntries(
      audits.map((audit) => [`T6.minMarginLc.${audit.flavor}`, audit.minMarginLc]),
    ),
  };
  return {
    violations: [
      ...coverageGaps(ratchets),
      ...(committed === undefined ? [] : loosenings(ratchets, committed)),
      ...audits.flatMap((audit) =>
        audit.failures.map((failure) => `T6 ${audit.flavor}: ${failure}`),
      ),
      ...lightAndDark(flavors),
      ...regressions(ratchets, measured),
    ],
    hints: tightenable(ratchets, measured),
  };
}

function lightAndDark(flavors: readonly Flavor[]): string[] {
  return (["light", "dark"] as const)
    .filter((appearance) => !flavors.some((flavor) => flavor.appearance === appearance))
    .map((appearance) => `T6: the gallery ships no ${appearance} flavor`);
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
      scanned: `${gallery.length} flavors, ${graphemeCorpus.length} grapheme samples, ${committed === undefined ? "no committed ratchets yet" : "held against HEAD"}`,
    },
    verdict.violations,
  );
}
