import { open, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

export interface IndexFiles {
  modifiedAt(path: string): Promise<number | undefined>;
  head(path: string, bytes: number): Promise<Uint8Array | undefined>;
}

export type TrackedFileCounter = (directory: unknown) => Promise<number | undefined>;

export const indexHeaderBytes = 12;
export const indexSignature = 0x44495243;
export const indexVersions: readonly number[] = [2, 3, 4];

export function trackedFileCounter(files: IndexFiles = diskIndexFiles): TrackedFileCounter {
  const known = new Map<string, { readonly modifiedAt: number; readonly count?: number }>();
  return async (directory) => {
    if (typeof directory !== "string" || !isAbsolute(directory)) return undefined;
    const path = indexPathOf(directory);
    const modifiedAt = await files.modifiedAt(path);
    if (modifiedAt === undefined) {
      known.delete(path);
      return undefined;
    }
    const held = known.get(path);
    if (held?.modifiedAt === modifiedAt) return held.count;
    const count = entryCountOf(await files.head(path, indexHeaderBytes));
    known.set(path, count === undefined ? { modifiedAt } : { modifiedAt, count });
    return count;
  };
}

export function indexPathOf(directory: string): string {
  return join(directory, ".git", "index");
}

export function entryCountOf(header: Uint8Array | undefined): number | undefined {
  if (header === undefined || header.byteLength < indexHeaderBytes) return undefined;
  const view = new DataView(header.buffer, header.byteOffset, indexHeaderBytes);
  if (view.getUint32(0) !== indexSignature) return undefined;
  if (!indexVersions.includes(view.getUint32(4))) return undefined;
  return view.getUint32(8);
}

export const diskIndexFiles: IndexFiles = {
  modifiedAt: async (path) => {
    try {
      const found = await stat(path);
      return found.isFile() ? found.mtimeMs : undefined;
    } catch {
      return undefined;
    }
  },
  head: async (path, bytes) => {
    try {
      const file = await open(path, "r");
      try {
        const buffer = new Uint8Array(bytes);
        const { bytesRead } = await file.read(buffer, 0, bytes, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await file.close();
      }
    } catch {
      return undefined;
    }
  },
};
