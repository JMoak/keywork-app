import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assignDesktopVersion,
  obsoleteSdkAssets,
  planRelease,
  requireTagCommit,
  versionOfTag,
} from "./release.ts";

const commits = (...messages: string[]) =>
  messages.map((message, index) => ({ hash: String(index), message }));

describe("planRelease", () => {
  it("waits for the first published v0.2.2 instead of analyzing historical features", async () => {
    await expect(
      planRelease({ refType: "branch", refName: "main", commits: commits("feat: old work") }),
    ).resolves.toBeUndefined();
    await expect(planRelease({ refType: "tag", refName: "v0.2.2", commits: [] })).resolves.toEqual({
      version: "0.2.2",
      tag: "v0.2.2",
    });
    await expect(planRelease({ refType: "tag", refName: "v0.3.0", commits: [] })).rejects.toThrow(
      "Publish v0.2.2",
    );
  });

  it.each([
    ["fix: restore keyboard focus", "0.2.3"],
    ["perf: reduce renderer work", "0.2.3"],
    ["feat: expose a new command", "0.3.0"],
    ["feat!: replace the public SDK", "1.0.0"],
    ["fix: change the SDK\n\nBREAKING CHANGE: the old entry point was removed", "1.0.0"],
  ])("versions %s from the published baseline", async (message, version) => {
    await expect(
      planRelease({
        refType: "branch",
        refName: "main",
        latestTag: "v0.2.2",
        commits: commits(message),
      }),
    ).resolves.toEqual({ version, tag: `v${version}` });
  });

  it("ignores maintenance-only histories and chooses the largest meaningful change", async () => {
    await expect(
      planRelease({
        refType: "branch",
        refName: "main",
        latestTag: "v0.2.2",
        commits: commits(
          "chore(deps): update packages",
          "docs: update instructions",
          "test: cover releases",
        ),
      }),
    ).resolves.toBeUndefined();
    await expect(
      planRelease({
        refType: "branch",
        refName: "main",
        latestTag: "v0.2.2",
        commits: commits("fix: restore focus", "feat: add a view"),
      }),
    ).resolves.toEqual({ version: "0.3.0", tag: "v0.3.0" });
  });

  it("handles direct commits and merge histories with the same analyzer", async () => {
    await expect(
      planRelease({
        refType: "branch",
        refName: "main",
        latestTag: "v1.4.0",
        commits: commits("Merge pull request #21", "fix: correct the window title"),
      }),
    ).resolves.toEqual({ version: "1.4.1", tag: "v1.4.1" });
  });

  it("does not rebuild a published tag or permit a downgrade", async () => {
    await expect(
      planRelease({ refType: "tag", refName: "v0.2.2", latestTag: "v0.2.2", commits: [] }),
    ).resolves.toBeUndefined();
    await expect(
      planRelease({ refType: "tag", refName: "v0.2.2", latestTag: "v0.2.3", commits: [] }),
    ).rejects.toThrow("newer published");
    await expect(
      planRelease({ refType: "tag", refName: "v0.2.3", latestTag: "v0.2.2", commits: [] }),
    ).resolves.toEqual({ version: "0.2.3", tag: "v0.2.3" });
  });

  it("rejects automatic publishing from another branch", async () => {
    await expect(
      planRelease({
        refType: "branch",
        refName: "feature",
        latestTag: "v0.2.2",
        commits: commits("feat: add a view"),
      }),
    ).rejects.toThrow("require main");
  });
});

describe("release identity", () => {
  it("removes only obsolete SDK assets from an unfinished draft", () => {
    const current = ["sdk-0123456789ab.tgz", "sdk-0123456789ab.tgz.sha256"];
    const previous = ["sdk-abcdef012345.tgz", "sdk-abcdef012345.tgz.sha256"];
    expect(
      obsoleteSdkAssets(
        [...current, ...previous, "notes.txt", "keywork-app-0.2.3-win-x64.exe"],
        current,
      ),
    ).toEqual(previous);
  });
  it.each(["0.2.2", "v0.2.1", "v0.2.3-alpha.0", "v01.2.3", "vnext"])("rejects %s", (tag) => {
    expect(() => versionOfTag(tag)).toThrow("stable v<version>");
  });

  it("permits an absent tag or a same-commit retry without moving an existing tag", () => {
    expect(() => requireTagCommit("v0.2.2", "abc")).not.toThrow();
    expect(() => requireTagCommit("v0.2.2", "abc", "abc")).not.toThrow();
    expect(() => requireTagCommit("v0.2.2", "abc", "def")).toThrow("original release workflow");
  });

  it("assigns the desktop and SDK version without changing the engine pin", async () => {
    const directory = await mkdtemp(join(tmpdir(), "keywork-app-release-"));
    try {
      await mkdir(join(directory, "packages", "desktop"), { recursive: true });
      const path = join(directory, "packages", "desktop", "package.json");
      await writeFile(
        path,
        JSON.stringify({
          name: "@keywork-app/desktop",
          version: "0.2.2",
          dependencies: { engine: "0.2.2" },
        }),
      );
      await assignDesktopVersion("0.3.0", directory);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
        name: "@keywork-app/desktop",
        version: "0.3.0",
        dependencies: { engine: "0.2.2" },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("reverted changes", () => {
  it("cancels an unreleased feature and ignores an ordinary standalone revert", async () => {
    const hash = "a".repeat(40);
    const reverted = {
      hash: "b".repeat(40),
      message: `revert: feat: add a view\n\nThis reverts commit ${hash}.`,
    };
    await expect(
      planRelease({
        refType: "branch",
        refName: "main",
        latestTag: "v0.2.2",
        commits: [reverted, { hash, message: "feat: add a view" }],
      }),
    ).resolves.toBeUndefined();
    await expect(
      planRelease({ refType: "branch", refName: "main", latestTag: "v0.2.2", commits: [reverted] }),
    ).resolves.toBeUndefined();
  });
});
