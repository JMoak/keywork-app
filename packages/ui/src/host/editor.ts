import type { EditorOpened, HostPort } from "./port.ts";

export async function openInEditorWith(
  host: Pick<HostPort, "openInEditor">,
  workspace: string,
  path: string,
  line?: number,
): Promise<string> {
  const target = { path: absoluteIn(workspace, path), ...(line !== undefined && { line }) };
  return editorLine(shownPath(workspace, path), line, await host.openInEditor(target));
}

export function editorLine(path: string, line: number | undefined, opened: EditorOpened): string {
  const where = line === undefined ? path : `${path}:${line}`;
  if (opened.via === "editor") return `${where} → ${opened.editor}`;
  return `couldn't open an editor · ${opened.because} · showed ${path} in ${opened.shownIn} instead`;
}

export function absoluteIn(root: string, path: string): string {
  return isAbsolute(path) ? path : `${withoutTrailingSlash(root)}/${path}`;
}

export function shownPath(root: string, path: string): string {
  if (!isAbsolute(path)) return path;
  const prefix = `${withoutTrailingSlash(slashed(root))}/`;
  const candidate = slashed(path);
  return candidate.toLowerCase().startsWith(prefix.toLowerCase())
    ? candidate.slice(prefix.length)
    : path;
}

function isAbsolute(path: string): boolean {
  return /^(?:[a-z]:[\\/]|[\\/])/i.test(path);
}

function slashed(path: string): string {
  return path.replace(/\\/g, "/");
}

function withoutTrailingSlash(path: string): string {
  return path.replace(/[\\/]+$/, "");
}
