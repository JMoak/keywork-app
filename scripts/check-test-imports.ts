import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type PathPredicate, repoRoot, reportViolations, walkRepo } from "./lib/repo-files.ts";

export function testImportsIn(source: string): string[] {
  return specifiersIn(source).filter(namesATestFile);
}

export function namesATestFile(specifier: string): boolean {
  const file = specifier.split("?")[0]?.split("/").at(-1) ?? "";
  return testFileName.test(file);
}

export const scannedPath: PathPredicate = (path) =>
  sourceExtensions.test(path) && !exemptPaths.has(path);

export async function scanTestImports(root = repoRoot): Promise<string[]> {
  const violations: string[] = [];
  for (const path of await walkRepo(scannedPath, root)) {
    const source = await readFile(join(root, path), "utf8");
    for (const specifier of testImportsIn(source)) {
      violations.push(
        `${path}: imports "${specifier}"; move what it shares into a testing.ts or *-testing.ts beside it`,
      );
    }
  }
  return violations;
}

const testFileName = /\.test(?:\.[cm]?[jt]sx?)?$/;

const sourceExtensions = /\.(?:[cm]?[jt]sx?)$/;

const exemptPaths = new Set(["scripts/check-test-imports.test.ts"]);

const moduleSpecifier = /\b(?:from|import|import\s*\(|require\s*\()\s*["']([^"'\n]+)["']/g;

function specifiersIn(source: string): string[] {
  return [...source.matchAll(moduleSpecifier)].flatMap(([, specifier]) =>
    specifier === undefined ? [] : [specifier],
  );
}

if (import.meta.main) {
  const violations = await scanTestImports();
  process.exitCode = reportViolations(
    {
      check: "check:test-imports",
      heading:
        "Imports of a test file (its suites run again inside every importer; share helpers from a testing module):",
      scanned: "no file imports a *.test.ts or *.test.tsx",
    },
    violations,
  );
}
