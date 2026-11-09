import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  namesATestFile,
  scannedPath,
  scanTestImports,
  testImportsIn,
} from "./check-test-imports.ts";

describe("check:test-imports", () => {
  it("finds a test file named by any import form", () => {
    const source = [
      'import { inertTrust } from "./trust.test.ts";',
      'import type { MemoryClient } from "../shell/memory-store.test";',
      "import {",
      "  fakeSurface,",
      "  type FakeSurface,",
      '} from "./session.test.tsx";',
      'export { factsWith } from "./facts.test.ts";',
      'export * from "./facts.test.js";',
      'import "./registers.test.ts";',
      'const later = await import("./later.test.ts");',
      'const old = require("./old.test.cjs");',
    ].join("\n");
    expect(testImportsIn(source)).toEqual([
      "./trust.test.ts",
      "../shell/memory-store.test",
      "./session.test.tsx",
      "./facts.test.ts",
      "./facts.test.js",
      "./registers.test.ts",
      "./later.test.ts",
      "./old.test.cjs",
    ]);
  });

  it("leaves testing modules, fixtures and ordinary modules alone", () => {
    const source = [
      'import { fakeClient } from "./client-testing.ts";',
      'import { aSetting } from "./testing.ts";',
      'import recorded from "../fixtures/memory.jsonl?raw";',
      'import { describe } from "vitest";',
      'import { attest } from "./attest.ts";',
      'import { latest } from "./contest";',
    ].join("\n");
    expect(testImportsIn(source)).toEqual([]);
  });

  it("names a test file by its last segment, with or without an extension or a query", () => {
    expect(namesATestFile("./trust.test.ts")).toBe(true);
    expect(namesATestFile("./trust.test")).toBe(true);
    expect(namesATestFile("../pane.test.tsx?raw")).toBe(true);
    expect(namesATestFile("./test/helpers.ts")).toBe(false);
    expect(namesATestFile("./trust-testing.ts")).toBe(false);
  });

  it("scans every script and source file, tests included, but not its own examples", () => {
    expect(scannedPath("packages/ui/src/shell/client-testing.ts")).toBe(true);
    expect(scannedPath("packages/ui/src/shell/trust-card.test.tsx")).toBe(true);
    expect(scannedPath("packages/desktop/e2e/first-light/smoke.mjs")).toBe(true);
    expect(scannedPath("docs/plan.md")).toBe(false);
    expect(scannedPath("scripts/check-test-imports.test.ts")).toBe(false);
  });
});

describe("check:test-imports over a tree", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  async function treeOf(files: Record<string, string>): Promise<string> {
    const made = await mkdtemp(join(tmpdir(), "check-test-imports-"));
    root = made;
    for (const [path, source] of Object.entries(files)) {
      await mkdir(dirname(join(made, path)), { recursive: true });
      await writeFile(join(made, path), source);
    }
    return made;
  }

  it("reports each importer, test or not, with the fix", async () => {
    const tree = await treeOf({
      "packages/ui/src/shell/trust.test.ts": "export const inertTrust = 1;",
      "packages/ui/src/shell/client-testing.ts": 'import { inertTrust } from "./trust.test.ts";',
      "packages/ui/src/shell/trust-card.test.tsx": 'import { inertTrust } from "./trust.test";',
      "node_modules/some/index.test.ts": 'import "./other.test.ts";',
    });
    expect(await scanTestImports(tree)).toEqual([
      'packages/ui/src/shell/client-testing.ts: imports "./trust.test.ts"; move what it shares into a testing.ts or *-testing.ts beside it',
      'packages/ui/src/shell/trust-card.test.tsx: imports "./trust.test"; move what it shares into a testing.ts or *-testing.ts beside it',
    ]);
  });

  it("passes a tree whose tests share helpers through testing modules", async () => {
    const tree = await treeOf({
      "packages/ui/src/shell/trust-testing.ts": "export const inertTrust = 1;",
      "packages/ui/src/shell/trust.test.ts": 'import { inertTrust } from "./trust-testing.ts";',
      "packages/ui/src/shell/client-testing.ts": 'import { inertTrust } from "./trust-testing.ts";',
    });
    expect(await scanTestImports(tree)).toEqual([]);
  });
});
