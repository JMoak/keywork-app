import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contractVersion } from "@keywork-app/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  digestOf,
  expectedDigest,
  fetchSidecar,
  hostTarget,
  identityReport,
  releaseAsset,
  releaseAssetName,
  type SidecarHost,
  sidecarDestination,
  sidecarIdentityLine,
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

const windowsTarget = { platform: "win32", arch: "x64" } as const;
const linuxTarget = { platform: "linux", arch: "x64" } as const;

interface RecordingHost extends SidecarHost {
  probed: string[];
  seen: Uint8Array[];
}

function hostReporting(
  line: string,
  platform: NodeJS.Platform = "win32",
  arch = "x64",
): RecordingHost {
  const probed: string[] = [];
  const seen: Uint8Array[] = [];
  return {
    platform,
    arch,
    probed,
    seen,
    versionLineOf: (path) => {
      probed.push(path);
      seen.push(new Uint8Array(readFileSync(path)));
      return `${line}\r\n`;
    },
  };
}

describe("sidecarIdentityLine", () => {
  it("is the exact line keywork --version prints for this console's contract", () => {
    expect(sidecarIdentityLine("0.2.2")).toBe(`keywork 0.2.2 · contract ${contractVersion}`);
  });
});

describe("identityReport", () => {
  it("says a confirmed binary reported its identity", () => {
    expect(
      identityReport("keywork-linux-x64", {
        kind: "confirmed",
        line: "keywork 0.2.2 · contract 1.28",
      }),
    ).toBe("keywork-linux-x64 reports keywork 0.2.2 · contract 1.28");
  });

  it("says plainly when the identity was not checked", () => {
    expect(
      identityReport("keywork-linux-arm64", {
        kind: "unchecked",
        reason: "this host cannot run it",
      }),
    ).toBe("keywork-linux-arm64 identity not checked: this host cannot run it");
  });
});

describe("fetchSidecar", () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  });

  const serving = (checksum: string) => async (url: string) =>
    url.endsWith(".sha256") ? new TextEncoder().encode(checksum) : binary;
  const serveWindows = serving(`${binaryDigest}  keywork-windows-x64.exe\n`);
  const serveLinux = serving(`${binaryDigest}  keywork-linux-x64\n`);
  const expectedLine = sidecarIdentityLine("0.2.0");

  it("writes the verified binary and returns its digest", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork.exe");
    const host = hostReporting(expectedLine);
    const fetched = await fetchSidecar("0.2.0", windowsTarget, destination, serveWindows, host);
    expect(fetched).toEqual({
      digest: binaryDigest,
      destination,
      identity: { kind: "confirmed", line: expectedLine },
    });
    expect(new Uint8Array(await readFile(destination))).toEqual(binary);
    expect(host.seen).toEqual([binary]);
    expect(host.probed).toHaveLength(1);
    expect(host.probed[0]).not.toBe(destination);
    expect(host.probed[0]).toMatch(/keywork\.exe$/);
    expect(readdirSync(join(directory, "sidecar"))).toEqual(["keywork.exe"]);
  });

  it("refuses a binary that reports another contract, writing nothing", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork.exe");
    await expect(
      fetchSidecar(
        "0.2.0",
        windowsTarget,
        destination,
        serveWindows,
        hostReporting("keywork 0.2.0 · contract 0.1"),
      ),
    ).rejects.toThrow(
      /refusing keywork-windows-x64\.exe: it reports "keywork 0\.2\.0 · contract 0\.1"/,
    );
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(join(directory, "sidecar"))).toEqual([]);
  });

  it("refuses a binary that reports another version, writing nothing", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork");
    await expect(
      fetchSidecar(
        "0.2.0",
        linuxTarget,
        destination,
        serveLinux,
        hostReporting(`keywork 0.3.0 · contract ${contractVersion}`, "linux"),
      ),
    ).rejects.toThrow(/refusing keywork-linux-x64: it reports "keywork 0\.3\.0/);
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(join(directory, "sidecar"))).toEqual([]);
  });

  it("refuses a binary that cannot report at all, writing nothing", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork.exe");
    await expect(
      fetchSidecar("0.2.0", windowsTarget, destination, serveWindows, {
        platform: "win32",
        arch: "x64",
        versionLineOf: () => {
          throw new Error("exited 1: boom");
        },
      }),
    ).rejects.toThrow(
      /refusing keywork-windows-x64\.exe: it could not report its version \(exited 1: boom\)/,
    );
    expect(existsSync(destination)).toBe(false);
    expect(readdirSync(join(directory, "sidecar"))).toEqual([]);
  });

  it("never runs a binary whose digest failed", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork.exe");
    const host = hostReporting(expectedLine);
    await expect(
      fetchSidecar(
        "0.2.0",
        windowsTarget,
        destination,
        serving(`${"0".repeat(64)}  keywork-windows-x64.exe\n`),
        host,
      ),
    ).rejects.toThrow(/digest mismatch/);
    expect(host.probed).toEqual([]);
  });

  it("writes a binary this host cannot run and says it was not checked", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "linux-x64", "keywork");
    const host = hostReporting(expectedLine);
    const fetched = await fetchSidecar("0.2.0", linuxTarget, destination, serveLinux, host);
    expect(fetched.identity.kind).toBe("unchecked");
    expect(identityReport("keywork-linux-x64", fetched.identity)).toBe(
      "keywork-linux-x64 identity not checked: this win32-x64 host cannot run a linux-x64 binary, so --version was not run; the digest matched",
    );
    expect(host.probed).toEqual([]);
    expect(new Uint8Array(await readFile(destination))).toEqual(binary);
  });

  it("treats another architecture on the same platform as not runnable here", async () => {
    directory = await mkdtemp(join(tmpdir(), "sidecar-"));
    const destination = join(directory, "sidecar", "keywork");
    const host = hostReporting(expectedLine, "linux", "arm64");
    const fetched = await fetchSidecar("0.2.0", linuxTarget, destination, serveLinux, host);
    expect(fetched.identity).toEqual({
      kind: "unchecked",
      reason:
        "this linux-arm64 host cannot run a linux-x64 binary, so --version was not run; the digest matched",
    });
    expect(host.probed).toEqual([]);
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
