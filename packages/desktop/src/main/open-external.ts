import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ExternalVerdict = { ok: true; url: string } | { ok: false; reason: string };

export function externalVerdict(url: string, workspaceRoots: readonly string[]): ExternalVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: `refusing to open "${url}": not a url` };
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:") return { ok: true, url };
  if (parsed.protocol === "file:") return fileVerdict(parsed, workspaceRoots);
  return { ok: false, reason: `refusing to open ${parsed.protocol} links` };
}

function fileVerdict(parsed: URL, workspaceRoots: readonly string[]): ExternalVerdict {
  const target = resolve(fileURLToPath(parsed));
  const inside = workspaceRoots.some((root) => contains(resolve(root), target));
  if (!inside) return { ok: false, reason: `refusing to open ${target}: outside the open workspaces` };
  return { ok: true, url: parsed.href };
}

function contains(root: string, target: string): boolean {
  const between = relative(root, target);
  return between === "" || (!between.startsWith("..") && !isAbsolute(between));
}
