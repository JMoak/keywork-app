import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { contractVersion } from "@keywork-app/protocol";
import { describe, expect, it, vi } from "vitest";
import { docFixture, pinnedEventShapes } from "./check-contract.ts";
import {
  type EngineRelease,
  enginePinPath,
  publishedEngine,
  requireOwnedChanges,
  shouldAdopt,
  updateEnginePin,
  verifyEngineAssets,
  verifyEngineContract,
} from "./engine-update.ts";
import { digestOf, releaseAssetName, sidecarTargets } from "./fetch-sidecar.ts";
import { repoRoot } from "./lib/repo-files.ts";

const sourceSha = "a".repeat(40);
const binary = new TextEncoder().encode("published binary");
const digest = digestOf(binary);
const names = sidecarTargets.map(releaseAssetName);
const release: EngineRelease = {
  version: "0.4.1",
  tag: "v0.4.1",
  sourceSha,
  assets: [
    { name: "SHA256SUMS", digest: null },
    ...names.flatMap((name) => [
      { name, digest: `sha256:${digest}` },
      { name: `${name}.sha256`, digest: null },
    ]),
  ],
};
const source = 'export const protocolVersion = "0.4.0";\nexport const contractVersion = "1.29";\n';

describe("compatible engine adoption", () => {
  it.each([
    ["0.4.1", "0.4.0", undefined, true],
    ["0.4.0", "0.4.0", undefined, false],
    ["0.3.9", "0.4.0", undefined, false],
    ["0.4.1", "0.4.0", "0.4.2", false],
    ["0.4.2", "0.4.0", "0.4.1", true],
    ["0.4.1", "0.4.0", "0.4.1", true],
  ])("adoption %s from %s with pending %s is %s", (candidate, current, pending, expected) => {
    expect(shouldAdopt(candidate, current, pending)).toBe(expected);
  });

  it("changes the engine pin alone and never changes the wire contract", () => {
    const updated = updateEnginePin(source, "0.4.1");
    expect(updated).toBe(source.replace('protocolVersion = "0.4.0"', 'protocolVersion = "0.4.1"'));
    expect(() => requireOwnedChanges(source, updated, [enginePinPath])).not.toThrow();
  });

  it.each(["0.4.1-beta.1", "v0.4.1", "0.4.1\nrun-command", "$(command)"])(
    "rejects nonstable version %s",
    (version) => {
      expect(() => updateEnginePin(source, version)).toThrow("stable engine version");
    },
  );

  it("refuses to overwrite unrelated branch edits", () => {
    const updated = updateEnginePin(source, "0.4.1");
    expect(() =>
      requireOwnedChanges(source, updated.replace("1.29", "1.30"), [enginePinPath]),
    ).toThrow("beyond its engine pin");
    expect(() => requireOwnedChanges(source, updated, [enginePinPath, "package.json"])).toThrow(
      "beyond its engine pin",
    );
    expect(() => updateEnginePin(`${source}${source}`, "0.4.1")).toThrow("exactly one");
  });

  it("resolves canonical release and immutable tag metadata without dispatch input", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          tag_name: release.tag,
          draft: false,
          prerelease: false,
          assets: release.assets.map((asset) => ({ ...asset, state: "uploaded" })),
        }),
      )
      .mockResolvedValueOnce(Response.json({ object: { type: "commit", sha: sourceSha } }));
    expect(await publishedEngine(request)).toEqual(release);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/JMoak/keywork/releases/latest",
      "https://api.github.com/repos/JMoak/keywork/git/ref/tags/v0.4.1",
    ]);
  });

  it.each([{ draft: true }, { prerelease: true }, { tag_name: "v0.4.1-beta.1" }])(
    "rejects an unpublished or unstable candidate %j",
    async (invalid) => {
      const request = vi.fn().mockResolvedValue(
        Response.json({
          tag_name: release.tag,
          draft: false,
          prerelease: false,
          assets: [],
          ...invalid,
        }),
      );
      await expect(publishedEngine(request)).rejects.toThrow();
    },
  );

  it("verifies all native asset checksums without downloading binaries with GitHub digests", async () => {
    const request = assetRequest();
    expect(await verifyEngineAssets(release, request)).toEqual(
      Object.fromEntries(names.map((name) => [name, digest])),
    );
    expect(request).toHaveBeenCalledTimes(names.length + 1);
  });

  it("hashes historical assets when GitHub has no digest", async () => {
    const request = assetRequest();
    await verifyEngineAssets(
      { ...release, assets: release.assets.map((asset) => ({ ...asset, digest: null })) },
      request,
    );
    expect(request).toHaveBeenCalledTimes(names.length * 2 + 1);
  });

  it("rejects missing native assets and conflicting checksums", async () => {
    await expect(
      verifyEngineAssets(
        { ...release, assets: release.assets.filter((asset) => asset.name !== names[0]) },
        assetRequest(),
      ),
    ).rejects.toThrow("Expected one published");
    await expect(
      verifyEngineAssets(
        {
          ...release,
          assets: release.assets.map((asset) =>
            asset.name === names[0] ? { ...asset, digest: `sha256:${"b".repeat(64)}` } : asset,
          ),
        },
        assetRequest(),
      ),
    ).rejects.toThrow("digest disagrees");
    const request = assetRequest("b".repeat(64));
    await expect(verifyEngineAssets(release, request)).rejects.toThrow("checksums disagree");
  });

  it("compares source-pinned contract fixtures with the current App without importing upstream code", async () => {
    const request = await contractRequest(contractVersion);
    await verifyEngineContract(release, await pinnedEventShapes(), request);
    expect(
      request.mock.calls.every(([url]) => url.includes(`/${sourceSha}/packages/server/src/`)),
    ).toBe(true);
  });

  it("blocks contract changes and unversioned event drift", async () => {
    await expect(
      verifyEngineContract(release, await pinnedEventShapes(), await contractRequest("2.0")),
    ).rejects.toThrow("protocol adaptation requires review");
    const shapes = await pinnedEventShapes();
    delete shapes.events[Object.keys(shapes.events)[0] ?? ""];
    await expect(
      verifyEngineContract(release, shapes, await contractRequest(contractVersion)),
    ).rejects.toThrow("contract drift");
  });
});

function assetRequest(detached = digest) {
  return vi.fn(async (url: string) => {
    if (url.endsWith("/SHA256SUMS"))
      return new Response(names.map((name) => `${digest}  ${name}`).join("\n"));
    if (url.endsWith(".sha256"))
      return new Response(`${detached}  ${url.split("/").at(-1)?.slice(0, -7)}\n`);
    return new Response(binary);
  });
}

async function contractRequest(contract: string) {
  const doc = await readFile(docFixture, "utf8");
  const shapes = await readFile(
    join(repoRoot, "packages/protocol/src/fixtures/event-shapes.json"),
    "utf8",
  );
  return vi.fn(
    async (url: string) =>
      new Response(
        url.endsWith("contract.ts")
          ? `export const contractVersion = "${contract}";\n`
          : url.endsWith("openapi-document.fixture.json")
            ? doc
            : shapes,
      ),
  );
}
