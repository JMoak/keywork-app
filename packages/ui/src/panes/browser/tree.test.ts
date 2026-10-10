import type { BusEnvelope, TreeListing } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import {
  agentPathOf,
  ancestorsOf,
  collapse,
  directoriesToLoad,
  emptyTree,
  expand,
  expireLit,
  followHoldMs,
  lift,
  nextExpiry,
  parentOf,
  rows,
  toggleHidden,
  withFailure,
  withFilter,
  withListing,
} from "./tree.ts";

const root: TreeListing = {
  path: "",
  entries: [
    { name: "dist", kind: "dir", ignored: true, hidden: false },
    { name: "src", kind: "dir", ignored: false, hidden: false },
    { name: ".gitignore", kind: "file", ignored: false, hidden: true },
    { name: "README.md", kind: "file", ignored: false, hidden: false },
  ],
};

const src: TreeListing = {
  path: "src",
  entries: [
    { name: "util", kind: "dir", ignored: false, hidden: false },
    { name: "index.ts", kind: "file", ignored: false, hidden: false },
  ],
};

const loaded = withListing(withListing(emptyTree, root), src);

function started(name: string, path: string): BusEnvelope {
  return {
    id: 1,
    ts: "t",
    sessionId: "s1",
    type: "tool.started",
    payload: { call: { type: "tool-call", callId: "c1", name, arguments: { path } } },
  };
}

describe("the browser tree", () => {
  it("asks for the root first and each expanded directory after", () => {
    expect(directoriesToLoad(emptyTree)).toEqual([""]);
    const withRoot = withListing(emptyTree, root);
    expect(directoriesToLoad(withRoot)).toEqual([]);
    expect(directoriesToLoad(expand(withRoot, "src"))).toEqual(["src"]);
  });

  it("lists one level at a time, folders first as the server sorted them, dotfiles off by default", () => {
    expect(rows(withListing(emptyTree, root)).map((row) => row.name)).toEqual([
      "dist",
      "src",
      "README.md",
    ]);
    expect(rows(toggleHidden(withListing(emptyTree, root))).map((row) => row.name)).toEqual([
      "dist",
      "src",
      ".gitignore",
      "README.md",
    ]);
  });

  it("flags gitignored entries as density rather than dropping them", () => {
    const [dist] = rows(loaded);
    expect(dist).toMatchObject({ name: "dist", ignored: true, kind: "dir", load: undefined });
  });

  it("nests an expanded directory's rows beneath it with their depth, and folds them back", () => {
    const open = expand(loaded, "src");
    expect(rows(open).map((row) => [row.path, row.depth])).toEqual([
      ["dist", 0],
      ["src", 0],
      ["src/util", 1],
      ["src/index.ts", 1],
      ["README.md", 0],
    ]);
    expect(rows(collapse(open, "src")).map((row) => row.path)).toEqual([
      "dist",
      "src",
      "README.md",
    ]);
  });

  it("filters loaded rows by name without touching what is loaded", () => {
    const filtered = withFilter(expand(loaded, "src"), "IND");
    expect(rows(filtered).map((row) => row.path)).toEqual(["src/index.ts"]);
    expect(rows(withFilter(filtered, "")).length).toBe(5);
  });

  it("remembers a failed directory with its reason", () => {
    const failed = withFailure(expand(loaded, "src/util"), "src/util", "no directory at src/util");
    expect(failed.directories["src/util"]).toEqual({
      kind: "failed",
      reason: "no directory at src/util",
    });
  });

  it("lifts the agent's file for a few seconds, expanding loaded ancestors only", () => {
    const lit = lift(loaded, "src/util/pad.ts", 1000);
    expect(lit.expanded).toEqual(["", "src"]);
    expect(rows(lit, 1000).find((row) => row.path === "src/util")?.lit).toBe(false);
    const litFile = lift(
      expand(
        withListing(lit, {
          path: "src/util",
          entries: [{ name: "pad.ts", kind: "file", ignored: false, hidden: false }],
        }),
        "src/util",
      ),
      "src/util/pad.ts",
      2000,
    );
    expect(rows(litFile, 2000).find((row) => row.path === "src/util/pad.ts")?.lit).toBe(true);
    expect(
      rows(litFile, 2000 + followHoldMs).find((row) => row.path === "src/util/pad.ts")?.lit,
    ).toBe(false);
    expect(nextExpiry(litFile)).toBe(2000 + followHoldMs);
    expect(expireLit(litFile, 2000 + followHoldMs).lit).toEqual({});
    expect(expireLit(litFile, 1500)).toBe(litFile);
  });

  it("follows read, write and edit paths, relative or absolute within the root, and nothing else", () => {
    expect(agentPathOf(started("read", "src/index.ts"), "C:/work")).toBe("src/index.ts");
    expect(agentPathOf(started("edit", "C:\\work\\src\\index.ts"), "C:/work")).toBe("src/index.ts");
    expect(agentPathOf(started("write", "./notes.txt"), "C:/work")).toBe("notes.txt");
    expect(agentPathOf(started("read", "C:/elsewhere/a.ts"), "C:/work")).toBeUndefined();
    expect(agentPathOf(started("bash", "src/index.ts"), "C:/work")).toBeUndefined();
  });

  it("walks a path's ancestors from the root", () => {
    expect(ancestorsOf("src/util/pad.ts")).toEqual(["", "src", "src/util"]);
    expect(ancestorsOf("README.md")).toEqual([""]);
    expect(parentOf("src/util")).toBe("src");
    expect(parentOf("src")).toBe("");
  });
});
