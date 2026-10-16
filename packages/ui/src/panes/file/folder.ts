import type { KeyworkClient } from "@keywork-app/client";
import type { TreeEntry } from "@keywork-app/protocol";
import { joinPath, rootPath } from "../browser/tree.ts";

export type FolderOpening =
  | { kind: "readme"; path: string }
  | { kind: "bare-folder" }
  | { kind: "not-a-folder" };

export async function folderOpening(
  client: Pick<KeyworkClient, "tree">,
  path: string,
): Promise<FolderOpening> {
  const listing = await client.tree(path);
  if (typeof listing === "string") return { kind: "not-a-folder" };
  const readme = readmeIn(listing.entries);
  return readme === undefined
    ? { kind: "bare-folder" }
    : { kind: "readme", path: joinPath(path, readme) };
}

export function readmeIn(entries: readonly TreeEntry[]): string | undefined {
  const files = entries.filter((entry) => entry.kind === "file").map((entry) => entry.name);
  for (const extension of readmeExtensions) {
    const found = files.find((name) => name.toLowerCase() === `readme${extension}`);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function pathTitle(path: string): string {
  return path === rootPath ? "workspace" : path;
}

export function bareFolderLine(path: string, browseChord: string): string {
  return `${path === rootPath ? "the workspace" : path} has no README · ${browseChord} browses the files`;
}

const readmeExtensions = [".md", ".markdown", "", ".txt", ".rst", ".adoc", ".org"] as const;
