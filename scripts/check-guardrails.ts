import { readFile } from "node:fs/promises";
import { join } from "node:path";
import patternTable from "./guardrail-patterns.json" with { type: "json" };
import { type PathPredicate, repoRoot, reportViolations, walkRepo } from "./lib/repo-files.ts";

export type ScanKind = "code" | "prose";

export const patternFile = "scripts/guardrail-patterns.json";

export function findGuardrailViolations(
  content: string,
  kind: ScanKind = "code",
  path?: string,
): string[] {
  return patternsFor(kind)
    .filter(
      ({ only }) =>
        path === undefined || only.length === 0 || only.some((prefix) => path.startsWith(prefix)),
    )
    .filter(({ except }) => path === undefined || !except.includes(path))
    .filter(({ pattern }) => pattern.test(content))
    .map(({ name }) => name);
}

export const scannedPath: PathPredicate = (path) =>
  scannedExtensions.test(path) && !exemptPaths.has(path) && !path.startsWith("docs/");

const exemptPaths = new Set([
  patternFile,
  "scripts/check-guardrails.test.ts",
  "scripts/check-guardrails-screen.test.ts",
]);

export function scanKind(path: string): ScanKind {
  return path.endsWith(".md") ? "prose" : "code";
}

export async function scanGuardrails(root = repoRoot): Promise<string[]> {
  const violations: string[] = [];
  for (const path of await walkRepo(scannedPath, root)) {
    const content = await readFile(join(root, path), "utf8");
    for (const name of findGuardrailViolations(content, scanKind(path), path)) {
      violations.push(`${path}: ${name}`);
    }
  }
  return violations;
}

interface CompiledPattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly only: readonly string[];
  readonly except: readonly string[];
}

interface PatternEntry {
  readonly name: string;
  readonly pattern: string;
  readonly flags: string;
  readonly only?: readonly string[];
  readonly except?: readonly string[];
}

const scannedExtensions = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json|ya?ml|sh|ps1|md)$/;

const everywherePatterns = compile(patternTable.everywhere);
const codePatterns = [...everywherePatterns, ...compile(patternTable.codeOnly)];

function compile(entries: ReadonlyArray<PatternEntry>): CompiledPattern[] {
  return entries.map(({ name, pattern, flags, only, except }) => ({
    name,
    pattern: new RegExp(pattern, flags),
    only: only ?? [],
    except: except ?? [],
  }));
}

function patternsFor(kind: ScanKind): readonly CompiledPattern[] {
  return kind === "prose" ? everywherePatterns : codePatterns;
}

if (import.meta.main) {
  const violations = await scanGuardrails();
  process.exitCode = reportViolations(
    {
      check: "check:guardrails",
      heading: "Guardrail violations (AGENTS.md: no engine imports, no credentials, no OAuth):",
      scanned: `patterns from ${patternFile}`,
    },
    violations,
  );
}
