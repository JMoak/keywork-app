import { describe, expect, it } from "vitest";
import { type FileSeams, recentLimit, recentStore } from "./recents.ts";

function memoryFs(
  initial: Record<string, string> = {},
): FileSeams & { files: Map<string, string> } {
  const files = new Map(Object.entries(initial));
  return {
    files,
    readText: async (path) => files.get(path),
    writeText: async (path, text) => {
      files.set(path, text);
    },
    rename: async (from, to) => {
      const text = files.get(from);
      if (text === undefined) throw new Error(`no ${from}`);
      files.delete(from);
      files.set(to, text);
    },
  };
}

const clock = (iso: string) => () => new Date(iso);

describe("recentStore", () => {
  it("starts empty, orders newest first, dedupes, and writes atomically through a staging file", async () => {
    const fs = memoryFs();
    const store = recentStore("/data/recents.json", fs);
    expect(await store.list()).toEqual([]);
    await store.touch("/a", clock("2026-09-07T10:00:00.000Z"));
    await store.touch("/b", clock("2026-09-07T11:00:00.000Z"));
    const touched = await store.touch("/a", clock("2026-09-07T12:00:00.000Z"));
    expect(touched.map((entry) => entry.path)).toEqual(["/a", "/b"]);
    expect(fs.files.has("/data/recents.json.tmp")).toBe(false);
    expect(JSON.parse(fs.files.get("/data/recents.json") ?? "")).toMatchObject({ version: 1 });
  });

  it("forgets, caps at the limit, and treats a corrupt file as empty", async () => {
    const fs = memoryFs({ "/data/recents.json": "{not json" });
    const store = recentStore("/data/recents.json", fs);
    expect(await store.list()).toEqual([]);
    for (let n = 0; n < recentLimit + 5; n += 1) await store.touch(`/w${n}`);
    expect((await store.list()).length).toBe(recentLimit);
    const after = await store.forget(`/w${recentLimit + 4}`);
    expect(after.some((entry) => entry.path === `/w${recentLimit + 4}`)).toBe(false);
  });

  it("rejects a file of another shape instead of trusting it", async () => {
    const fs = memoryFs({
      "/data/recents.json": JSON.stringify({ version: 2, workspaces: [{ path: "/x" }] }),
    });
    expect(await recentStore("/data/recents.json", fs).list()).toEqual([]);
  });
});
