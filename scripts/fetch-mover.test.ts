import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fetchMover,
  moverAsset,
  moverAssetName,
  moverDestination,
  moverRelease,
  shipsTheMover,
} from "./fetch-mover.ts";
import { digestOf } from "./fetch-sidecar.ts";

const made: string[] = [];

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fetch-mover-"));
  made.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function published(bytes: Uint8Array, checksumOf: Uint8Array = bytes) {
  const asset = moverAsset("1.2.3");
  const checksum = new TextEncoder().encode(`${digestOf(checksumOf)} *${moverAssetName}\n`);
  return async (url: string): Promise<Uint8Array> => {
    if (url === asset.url) return bytes;
    if (url === asset.checksumUrl) return checksum;
    throw new Error(`unexpected download: ${url}`);
  };
}

describe("the pinned pane mover", () => {
  it("is one asset of a Vignette release, with its checksum beside it", () => {
    expect(moverAsset()).toEqual({
      name: "kw-panes-mover-windows-x64.exe",
      url: `https://github.com/JMoak/vignette-mcp/releases/download/v${moverRelease.version}/kw-panes-mover-windows-x64.exe`,
      checksumUrl: `https://github.com/JMoak/vignette-mcp/releases/download/v${moverRelease.version}/kw-panes-mover-windows-x64.exe.sha256`,
    });
    expect(moverRelease.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("goes beside the engine, and only where it can run", () => {
    expect(moverDestination(join("x", "desktop"))).toBe(
      join("x", "desktop", "sidecar", "kw-panes-mover.exe"),
    );
    expect(shipsTheMover("win32", "x64")).toBe(true);
    expect(shipsTheMover("win32", "arm64")).toBe(false);
    expect(shipsTheMover("linux", "x64")).toBe(false);
    expect(shipsTheMover("darwin", "arm64")).toBe(false);
  });

  it("is written once its bytes match the published SHA-256", async () => {
    const bytes = new TextEncoder().encode("the mover");
    const destination = join(await scratch(), "sidecar", "kw-panes-mover.exe");

    const fetched = await fetchMover(destination, "1.2.3", published(bytes));

    expect(fetched).toEqual({ digest: digestOf(bytes), destination });
    expect(new Uint8Array(await readFile(destination))).toEqual(bytes);
  });

  it("is refused, and nothing is written, when the bytes do not match", async () => {
    const destination = join(await scratch(), "sidecar", "kw-panes-mover.exe");
    const tampered = published(
      new TextEncoder().encode("something else"),
      new TextEncoder().encode("the mover"),
    );

    await expect(fetchMover(destination, "1.2.3", tampered)).rejects.toThrow(
      /^digest mismatch for kw-panes-mover-windows-x64\.exe: /,
    );
    await expect(readFile(destination)).rejects.toThrow();
  });
});
