import type { KeyworkClient } from "@keywork-app/client";
import type { TreeEntry } from "@keywork-app/protocol";
import { createSignal } from "solid-js";
import type { ArgumentChoice } from "../../palette/commands.ts";
import { joinPath, rootPath } from "../browser/tree.ts";

export type TreeReader = Pick<KeyworkClient, "tree">;

export const fileIndexLimits = { folders: 400, files: 5000, freshForMs: 15_000 } as const;

export function workspaceFileChoices(client: TreeReader): readonly ArgumentChoice[] {
  return workspaceFiles(client).map((path) => ({ value: path, description: folderLine(path) }));
}

export function workspaceFiles(client: TreeReader): readonly string[] {
  return indexOf(client).files();
}

export async function walkWorkspace(client: TreeReader): Promise<string[]> {
  const files: string[] = [];
  let folders = [rootPath];
  let visited = 0;
  while (folders.length > 0 && visited < fileIndexLimits.folders) {
    const level = folders.slice(0, fileIndexLimits.folders - visited);
    visited += level.length;
    const listings = await Promise.all(level.map((folder) => listingOf(client, folder)));
    folders = [];
    for (const { folder, entries } of listings) {
      for (const entry of entries) {
        const path = joinPath(folder, entry.name);
        if (entry.kind === "dir") folders.push(path);
        else files.push(path);
      }
    }
  }
  return files.sort().slice(0, fileIndexLimits.files);
}

interface FileIndex {
  files(): readonly string[];
}

const indexes = new WeakMap<TreeReader, FileIndex>();

function indexOf(client: TreeReader): FileIndex {
  const known = indexes.get(client);
  if (known !== undefined) return known;
  const index = createFileIndex(client);
  indexes.set(client, index);
  return index;
}

function createFileIndex(client: TreeReader): FileIndex {
  const [files, setFiles] = createSignal<readonly string[]>([]);
  let walkedAt: number | undefined;
  let walking = false;
  const stale = (): boolean =>
    walkedAt === undefined || Date.now() - walkedAt > fileIndexLimits.freshForMs;
  const rewalk = (): void => {
    walking = true;
    void walkWorkspace(client)
      .then(setFiles, () => undefined)
      .finally(() => {
        walking = false;
        walkedAt = Date.now();
      });
  };
  return {
    files: () => {
      if (stale() && !walking) rewalk();
      return files();
    },
  };
}

function folderLine(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "in the workspace" : `in ${path.slice(0, slash)}`;
}

interface FolderListing {
  readonly folder: string;
  readonly entries: readonly TreeEntry[];
}

async function listingOf(client: TreeReader, folder: string): Promise<FolderListing> {
  const listing = await client.tree(folder).catch(() => "missing" as const);
  const entries = typeof listing === "string" ? [] : listing.entries;
  return { folder, entries: entries.filter((entry) => !entry.ignored) };
}
