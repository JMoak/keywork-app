import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  diskIndexFiles,
  entryCountOf,
  type IndexFiles,
  indexHeaderBytes,
  indexPathOf,
  trackedFileCounter,
} from "./git-index.ts";

const project = resolve("/work/lights");

describe("counting a repository's tracked files from its index header", () => {
  it("reads the entry count from the twelve-byte header of every known index version", () => {
    for (const version of [2, 3, 4]) {
      expect(entryCountOf(header("DIRC", version, 1234))).toBe(1234);
    }
    expect(entryCountOf(header("DIRC", 2, 0xfffffffe))).toBe(0xfffffffe);
  });

  it("refuses a header that is short, unsigned or of a version git never wrote", () => {
    expect(entryCountOf(undefined)).toBeUndefined();
    expect(entryCountOf(header("DIRC", 2, 9).subarray(0, 11))).toBeUndefined();
    expect(entryCountOf(header("RIDC", 2, 9))).toBeUndefined();
    expect(entryCountOf(header("DIRC", 1, 9))).toBeUndefined();
    expect(entryCountOf(header("DIRC", 5, 9))).toBeUndefined();
  });

  it("asks only for the header of the directory's .git/index, and only for an absolute directory", async () => {
    const disk = fakeDisk({
      [indexPathOf(project)]: { modifiedAt: 1, bytes: header("DIRC", 2, 7) },
    });
    const count = trackedFileCounter(disk.files);
    expect(await count(project)).toBe(7);
    expect(await count("work/lights")).toBeUndefined();
    expect(await count(42)).toBeUndefined();
    expect(disk.reads).toEqual([[indexPathOf(project), indexHeaderBytes]]);
  });

  it("keeps the count while the index's modification time holds and reads again when it moves", async () => {
    const path = indexPathOf(project);
    const disk = fakeDisk({ [path]: { modifiedAt: 1, bytes: header("DIRC", 2, 7) } });
    const count = trackedFileCounter(disk.files);
    expect(await count(project)).toBe(7);
    disk.put(path, { modifiedAt: 1, bytes: header("DIRC", 2, 99) });
    expect(await count(project)).toBe(7);
    disk.put(path, { modifiedAt: 2, bytes: header("DIRC", 2, 99) });
    expect(await count(project)).toBe(99);
    expect(disk.reads).toHaveLength(2);
  });

  it("answers nothing for a directory that is not a repository, and forgets one that stops being one", async () => {
    const path = indexPathOf(project);
    const disk = fakeDisk({ [path]: { modifiedAt: 1, bytes: header("DIRC", 2, 3) } });
    const count = trackedFileCounter(disk.files);
    expect(await count(resolve("/work/elsewhere"))).toBeUndefined();
    expect(await count(project)).toBe(3);
    disk.remove(path);
    expect(await count(project)).toBeUndefined();
    disk.put(path, { modifiedAt: 1, bytes: header("DIRC", 2, 5) });
    expect(await count(project)).toBe(5);
  });

  describe("on disk", () => {
    const made: string[] = [];
    afterAll(async () => {
      for (const folder of made) await rm(folder, { recursive: true, force: true });
    });

    it("reads a real index header and nothing past it", async () => {
      const folder = await mkdtemp(join(tmpdir(), "kw-git-index-"));
      made.push(folder);
      await mkdir(join(folder, ".git"));
      const rest = new Uint8Array(64).fill(0xab);
      await writeFile(indexPathOf(folder), Buffer.concat([header("DIRC", 2, 4210), rest]));
      const head = await diskIndexFiles.head(indexPathOf(folder), indexHeaderBytes);
      expect(head?.byteLength).toBe(indexHeaderBytes);
      const count = trackedFileCounter();
      expect(await count(folder)).toBe(4210);
      await writeFile(indexPathOf(folder), header("DIRC", 2, 4211));
      await utimes(indexPathOf(folder), new Date(1), new Date(Date.now() + 60_000));
      expect(await count(folder)).toBe(4211);
      expect(await count(join(folder, ".git"))).toBeUndefined();
    });
  });
});

function header(signature: string, version: number, entries: number): Uint8Array {
  const bytes = new Uint8Array(indexHeaderBytes);
  bytes.set([...signature].map((letter) => letter.charCodeAt(0)));
  const view = new DataView(bytes.buffer);
  view.setUint32(4, version);
  view.setUint32(8, entries);
  return bytes;
}

interface Held {
  readonly modifiedAt: number;
  readonly bytes: Uint8Array;
}

function fakeDisk(initial: Record<string, Held>) {
  const held = new Map(Object.entries(initial));
  const reads: [string, number][] = [];
  const files: IndexFiles = {
    modifiedAt: async (path) => held.get(path)?.modifiedAt,
    head: async (path, bytes) => {
      reads.push([path, bytes]);
      return held.get(path)?.bytes.subarray(0, bytes);
    },
  };
  return {
    files,
    reads,
    put: (path: string, next: Held) => held.set(path, next),
    remove: (path: string) => held.delete(path),
  };
}
