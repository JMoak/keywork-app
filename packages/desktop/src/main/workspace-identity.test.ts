import { describe, expect, it } from "vitest";
import {
  canonicalPath,
  type IdentitySeams,
  locateTickets,
  resolveAnchor,
} from "./workspace-identity.ts";

const keyworkComputed = [
  { cwd: "Q:/fx/plain", root: String.raw`Q:\fx\plain`, source: "launch", identity: "279ab7b71224" },
  { cwd: "Q:/fx/repo/src", root: String.raw`Q:\fx\repo`, source: "git", identity: "5de0568f6bc0" },
  {
    cwd: "Q:/fx/declared/deep",
    root: String.raw`Q:\fx\declared`,
    source: "declaration",
    identity: "51669f8fc9cd",
  },
] as const;

const markers = new Set([
  String.raw`Q:\fx\repo\.git`,
  String.raw`Q:\fx\declared\.keywork\workspace.json`,
]);

const windows: IdentitySeams = {
  home: String.raw`C:\Users\me`,
  platform: "win32",
  exists: async (path) => markers.has(path),
};

describe("workspace identity, as keywork derives it", () => {
  it.each(keyworkComputed)(
    "matches the identity keywork computed for a $source anchor",
    async ({ cwd, root, source, identity }) => {
      expect(await resolveAnchor(cwd, windows)).toEqual({ root, source });
      expect((await locateTickets(cwd, windows)).identity).toBe(identity);
    },
  );

  it("folds case on Windows only", async () => {
    expect((await locateTickets("q:/FX/PLAIN", windows)).identity).toBe("279ab7b71224");
    expect(canonicalPath("/home/Me/Work", "linux")).toBe("/home/Me/Work");
    expect(canonicalPath(String.raw`C:\Work`, "win32")).toBe(String.raw`c:\work`);
  });

  it("prefers a declaration anywhere above over a nearer git root", async () => {
    const seams: IdentitySeams = {
      home: "/home/me",
      platform: "linux",
      exists: async (path) =>
        path === "/home/me/outer/.keywork/workspace.json" || path === "/home/me/outer/inner/.git",
    };
    expect(await resolveAnchor("/home/me/outer/inner/src", seams)).toEqual({
      root: "/home/me/outer",
      source: "declaration",
    });
  });

  it("names the per-workspace ticket first and the user-level ticket as the fallback", async () => {
    expect((await locateTickets("Q:/fx/repo/src", windows)).files).toEqual([
      String.raw`C:\Users\me\.keywork\workspaces\5de0568f6bc0\server.json`,
      String.raw`C:\Users\me\.keywork\server.json`,
    ]);
  });
});
