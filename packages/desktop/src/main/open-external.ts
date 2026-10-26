import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ExternalVerdict =
  | { ok: true; url: string; path?: string; line?: number }
  | { ok: false; reason: string };

export type EditorVerdict =
  | { ok: true; path: string; line: number | undefined }
  | { ok: false; reason: string };

export function externalVerdict(url: string, openableRoots: readonly string[]): ExternalVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: `refusing to open "${url}": not a url` };
  }
  if (parsed.protocol === "https:" || parsed.protocol === "http:") return { ok: true, url };
  if (parsed.protocol === "file:") return fileVerdict(parsed, openableRoots);
  return { ok: false, reason: `refusing to open ${parsed.protocol} links` };
}

export function editorVerdict(request: unknown, openableRoots: readonly string[]): EditorVerdict {
  if (!isEditorRequest(request)) return { ok: false, reason: "refusing to open: not a file path" };
  const target = resolve(request.path);
  if (!isAbsolute(request.path) || !insideAny(openableRoots, target)) return outside(target);
  return { ok: true, path: target, line: request.line };
}

function fileVerdict(parsed: URL, openableRoots: readonly string[]): ExternalVerdict {
  const target = resolve(fileURLToPath(parsed));
  if (!insideAny(openableRoots, target)) return outside(target);
  const line = lineOfFragment(parsed.hash);
  return line === undefined
    ? { ok: true, url: parsed.href, path: target }
    : { ok: true, url: parsed.href, path: target, line };
}

function lineOfFragment(hash: string): number | undefined {
  const line = Number(/^#L(\d+)$/.exec(hash)?.[1]);
  return Number.isInteger(line) && line > 0 ? line : undefined;
}

function isEditorRequest(request: unknown): request is { path: string; line: number | undefined } {
  if (typeof request !== "object" || request === null) return false;
  const { path, line } = request as { path?: unknown; line?: unknown };
  return (
    typeof path === "string" &&
    (line === undefined || (typeof line === "number" && Number.isInteger(line) && line > 0))
  );
}

function insideAny(roots: readonly string[], target: string): boolean {
  return roots.some((root) => contains(resolve(root), target));
}

function outside(target: string): { ok: false; reason: string } {
  return { ok: false, reason: `refusing to open ${target}: outside the open workspaces` };
}

function contains(root: string, target: string): boolean {
  const between = relative(root, target);
  return between === "" || (!between.startsWith("..") && !isAbsolute(between));
}
