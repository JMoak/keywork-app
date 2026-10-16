import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { walkRepo } from "./repo-files.ts";

describe("walkRepo", () => {
  let planted: string | undefined;

  afterEach(async () => {
    if (planted !== undefined) await rm(planted, { recursive: true, force: true });
  });

  it("walks the tree but never an agent worktree, a dependency, or a build output", async () => {
    planted = await plantedTree([
      "packages/ui/src/app.ts",
      "scripts/check.ts",
      ".claude/worktrees/agent-1/packages/ui/src/app.ts",
      "node_modules/solid-js/index.ts",
      "packages/desktop/dist/main.ts",
    ]);
    expect(await walkRepo((path) => path.endsWith(".ts"), planted)).toEqual([
      "packages/ui/src/app.ts",
      "scripts/check.ts",
    ]);
  });
});

async function plantedTree(files: readonly string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "walk-repo-"));
  await Promise.all(
    files.map(async (file) => {
      const path = join(root, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "");
    }),
  );
  return root;
}
