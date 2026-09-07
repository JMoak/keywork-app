import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type PathPredicate, repoRoot, reportViolations, walkRepo } from "./lib/repo-files.ts";

export const flavorHome = "packages/ui/src/flavor/";

export const styledPath: PathPredicate = (path) =>
  /^packages\/ui\/src\/.*\.(tsx?|css)$/.test(path) &&
  !path.startsWith(flavorHome) &&
  !path.endsWith(".test.ts") &&
  !path.endsWith(".test.tsx");

export function findColorLiterals(content: string): string[] {
  return content
    .split("\n")
    .flatMap((line, index) =>
      [...line.matchAll(colorLiteral)].map(([literal]) => `line ${index + 1}: ${literal}`),
    );
}

const colorLiteral =
  /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?|oklch|oklab|color)\(/gi;

if (import.meta.main) {
  const paths = await walkRepo(styledPath);
  const violations: string[] = [];
  for (const path of paths) {
    for (const literal of findColorLiterals(await readFile(join(repoRoot, path), "utf8"))) {
      violations.push(`${path}: ${literal}`);
    }
  }
  process.exitCode = reportViolations(
    {
      check: "check:colors",
      heading: `Color literals outside ${flavorHome} (every color is a flavor token, AD6):`,
      scanned: `${paths.length} styled files`,
    },
    violations,
  );
}
