import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignDesktopVersion,
  type GithubRequest,
  obsoleteSdkAssets,
  planRelease,
  releaseForTag,
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

describe("draft release recovery", () => {
  const repository = "JMoak/keywork-app";
  const tag = "v0.2.2";
  const published = { tag_name: tag, draft: false, prerelease: false, assets: [] };
  const draft = {
    ...published,
    draft: true,
    assets: [{ name: "sdk-abcdef012345.tgz" }, { name: "sdk-abcdef012345.tgz.sha256" }],
  };
  const fullPage = Array.from({ length: 100 }, (_, index) => ({
    ...published,
    tag_name: `v0.1.${index}`,
  }));

  afterEach(() => vi.unstubAllEnvs());

  it("returns a published release without listing drafts", async () => {
    const request = vi.fn<GithubRequest>().mockResolvedValue(Response.json(published));
    await expect(releaseForTag(repository, tag, request)).resolves.toEqual(published);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("recovers an authenticated draft and its assets after the tag lookup returns 404", async () => {
    vi.stubEnv("GH_TOKEN", "test-release-token");
    const request = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json([{ ...published, tag_name: "v0.2.1" }, draft]));
    await expect(releaseForTag(repository, tag, request)).resolves.toEqual(draft);
    expect(request).toHaveBeenCalledTimes(2);
    for (const [, init] of request.mock.calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-release-token");
      expect(init?.method).toBe("GET");
    }
  });

  it("finds drafts beyond the first page", async () => {
    const request = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(fullPage))
      .mockResolvedValueOnce(Response.json([draft]));
    await expect(releaseForTag(repository, tag, request)).resolves.toEqual(draft);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      `https://api.github.com/repos/${repository}/releases/tags/${tag}`,
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=1`,
      `https://api.github.com/repos/${repository}/releases?per_page=100&page=2`,
    ]);
  });

  it("reports absence only after exhausting a successful listing", async () => {
    const request = vi
      .fn<GithubRequest>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(fullPage))
      .mockResolvedValueOnce(Response.json([]));
    await expect(releaseForTag(repository, tag, request)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it.each([401, 403, 429, 500])("does not hide a tag lookup HTTP %s", async (status) => {
    const request = vi.fn<GithubRequest>().mockResolvedValue(new Response(null, { status }));
    await expect(releaseForTag(repository, tag, request)).rejects.toThrow(`HTTP ${status}`);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404, 429, 500])(
    "does not treat a listing HTTP %s as absence",
    async (status) => {
      const request = vi
        .fn<GithubRequest>()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(new Response(null, { status }));
      await expect(releaseForTag(repository, tag, request)).rejects.toThrow();
    },
  );

  it("rejects malformed or mismatched published release metadata", async () => {
    for (const data of [
      null,
      { ...published, tag_name: "v0.2.1" },
      { ...published, assets: null },
    ]) {
      const request = vi.fn<GithubRequest>().mockResolvedValue(Response.json(data));
      await expect(releaseForTag(repository, tag, request)).rejects.toThrow();
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects malformed listings instead of creating another release", async () => {
    for (const data of [null, {}, [null], [{ ...draft, assets: [{ name: 1 }] }]]) {
      const request = vi
        .fn<GithubRequest>()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(Response.json(data));
      await expect(releaseForTag(repository, tag, request)).rejects.toThrow("invalid");
    }
  });

  it("propagates network failures in both lookups", async () => {
    const request = vi.fn<GithubRequest>().mockRejectedValue(new Error("offline"));
    await expect(releaseForTag(repository, tag, request)).rejects.toThrow("offline");
    request.mockReset().mockResolvedValueOnce(new Response(null, { status: 404 }));
    request.mockRejectedValueOnce(new Error("offline"));
    await expect(releaseForTag(repository, tag, request)).rejects.toThrow("offline");
  });
});
