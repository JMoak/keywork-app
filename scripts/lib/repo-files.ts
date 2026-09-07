import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export type PathPredicate = (posixPath: string) => boolean;

export const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export async function walkRepo(matches: PathPredicate, root = repoRoot): Promise<string[]> {
  const found: string[] = [];
  await visit(root, root, matches, found);
  return found.sort();
}

export interface Report {
  check: string;
  heading: string;
  scanned: string;
}

export function reportViolations(report: Report, violations: readonly string[]): number {
  if (violations.length === 0) {
    console.log(`${report.check}: ok (${report.scanned})`);
    return 0;
  }
  console.error(`${report.check}: ${report.heading}`);
  for (const violation of violations) console.error(`  ${violation}`);
  return 1;
}

const skippedDirectories = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "release",
  "artifacts",
  "sidecar",
]);

async function visit(
  root: string,
  directory: string,
  matches: PathPredicate,
  found: string[],
): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) await visit(root, absolute, matches, found);
      continue;
    }
    const posixPath = relative(root, absolute).split("\\").join("/");
    if (matches(posixPath)) found.push(posixPath);
  }
}
