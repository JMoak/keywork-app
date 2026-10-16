import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  digestOf,
  expectedDigest,
  fetchSidecar,
  hostTarget,
  releaseAsset,
  releaseAssetName,
  sidecarDestination,
  sidecarTargets,
  verifyDigest,
} from "./fetch-sidecar.ts";

const binary = new TextEncoder().encode("#!keywork\n");
const binaryDigest = digestOf(binary);

describe("releaseAssetName", () => {
  it("mirrors keywork's release asset names", () => {
    expect(sidecarTargets.map(releaseAssetName)).toEqual([
      "keywork-windows-x64.exe",
      "keywork-darwin-arm64",
      "keywork-darwin-x64",
      "keywork-linux-x64",
      "keywork-linux-arm64",
    ]);
  });

  it("refuses a platform keywork does not publish", () => {
    expect(() => releaseAssetName({ platform: "freebsd", arch: "x64" })).toThrow(/freebsd/);
  });
});

describe("releaseAsset", () => {
  it("points at the tagged GitHub release and its .sha256 sibling", () => {
    expect(releaseAsset("0.2.0", { platform: "win32", arch: "x64" })).toEqual({
      name: "keywork-windows-x64.exe",
      url: "https://github.com/JMoak/keywork/releases/download/v0.2.0/keywork-windows-x64.exe",
      checksumUrl:
        "https://github.com/JMoak/keywork/releases/download/v0.2.0/keywork-windows-x64.exe.sha256",
    });
  });
});

describe("expectedDigest", () => {
  it("reads the sha256sum line keywork publishes", () => {
    expect(expectedDigest(`${"a".repeat(64)}  keywork-linux-x64\n`, "keywork-linux-x64")).toBe(
      "a".repeat(64),
    );
  });

  it("finds the asset inside a combined SHA256SUMS", () => {
    const sums = [
      `${"1".repeat(64)}  keywork-darwin-arm64`,
      `${"2".repeat(64)}  keywork-darwin-arm64.exe`,
      `${"3".repeat(64)} *keywork-windows-x64.exe`,
    ].join("\n");
    expect(expectedDigest(sums, "keywork-windows-x64.exe")).toBe("3".repeat(64));
    expect(expectedDigest(sums, "keywork-darwin-arm64")).toBe("1".repeat(64));
  });

  it("fails loudly when the asset is missing or the digest is malformed", () => {
    expect(() => expectedDigest("", "keywork-linux-x64")).toThrow(/no SHA-256/);
    expect(() => expectedDigest("nothex  keywork-linux-x64", "keywork-linux-x64")).toThrow(
      /no SHA-256/,
    );
  });
});

describe("verifyDigest", () => {
  it("accepts matching bytes and reports both digests on a mismatch", () => {
    expect(verifyDigest(binary, binaryDigest)).toEqual({ ok: true, digest: binaryDigest });
    expect(verifyDigest(binary, "f".repeat(64))).toEqual({
      ok: false,
      expected: "f".repeat(64),
      actual: binaryDigest,
    });
  });
});

describe("sidecarDestination", () => {
  const tail = (path: string) => path.split(/[\\/]/).slice(-3);

  it("places the host binary where electron-builder's extraResources picks it up", () => {
    expect(
      tail(sidecarDestination("/repo/packages/desktop", hostTarget("win32", "x64"), false)),
    ).toEqual(["desktop", "sidecar", "keywork.exe"]);
  });

  it("fans every platform out under its own sidecar slot", () => {
    expect(
      tail(sidecarDestination("/repo/packages/desktop", hostTarget("linux", "arm64"), true)),
    ).toEqual(["sidecar", "linux-arm64", "keywork"]);
  });

  it("refuses an architecture keywork does not ship", () => {
    expect(() => hostTarget("linux", "ia32")).toThrow(/ia32/);
  });
});

describe("fetchSidecar", () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  });

  const serving = (checksum: string) => async (url: string) =>
    url.endsWith(".sha256") ? new TextEncoder().encode(checksum) : binary;

  it("writes the verified binary and returns its digest", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork.exe");
    const fetched = await fetchSidecar(
      "0.2.0",
      { platform: "win32", arch: "x64" },
      destination,
      serving(`${binaryDigest}  keywork-windows-x64.exe\n`),
    );
    expect(fetched).toEqual({ digest: binaryDigest, destination });
    expect(new Uint8Array(await readFile(destination))).toEqual(binary);
  });

  it("writes nothing on a digest mismatch", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork");
    await expect(
      fetchSidecar(
        "0.2.0",
        { platform: "linux", arch: "x64" },
        destination,
        serving(`${"0".repeat(64)}  keywork-linux-x64\n`),
      ),
    ).rejects.toThrow(/digest mismatch for keywork-linux-x64/);
    await expect(readFile(destination)).rejects.toThrow();
  });
});
