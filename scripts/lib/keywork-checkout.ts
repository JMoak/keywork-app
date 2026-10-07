import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./repo-files.ts";

export const keyworkRepo = resolve(process.env.KEYWORK_REPO ?? join(repoRoot, "..", "keywork"));

export function keyworkModuleUrl(relative: string, root = keyworkRepo): string {
  return pathToFileURL(join(root, relative)).href;
}

export async function keyworkCheckoutPresent(root = keyworkRepo): Promise<boolean> {
  try {
    await access(join(root, "packages/server/src/openapi.ts"));
    return true;
  } catch {
    return false;
  }
}
