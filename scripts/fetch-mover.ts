import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { moverBinaryName, sidecarDirectory } from "../packages/desktop/src/shared/sidecar.ts";
import { downloadBytes, expectedDigest, verifyDigest } from "./fetch-sidecar.ts";
import { repoRoot } from "./lib/repo-files.ts";

// The pane mover is Vignette's `kw-panes-mover`: a small Windows program the app starts to move
// its panes outside the window together. Moving this pin is a dependency update like any other.
export const moverRelease = { owner: "JMoak", repo: "vignette-mcp", version: "0.3.0" } as const;

export const moverAssetName = "kw-panes-mover-windows-x64.exe";

export interface MoverAsset {
  name: string;
  url: string;
  checksumUrl: string;
}

export interface FetchedMover {
  digest: string;
  destination: string;
}

export const usage = `fetch-mover: download the pinned pane mover and verify its SHA-256

  bun scripts/fetch-mover.ts                     into packages/desktop/sidecar/ (Windows only)
  bun scripts/fetch-mover.ts --version <x.y.z>   defaults to the pinned version (${moverRelease.version})

Nothing is written until the download matches the release's published .sha256. On any other
system there is nothing to fetch: panes are moved from JavaScript there.`;

export function moverAsset(version: string = moverRelease.version): MoverAsset {
  const { owner, repo } = moverRelease;
  const base = `https://github.com/${owner}/${repo}/releases/download/v${version}`;
  return {
    name: moverAssetName,
    url: `${base}/${moverAssetName}`,
    checksumUrl: `${base}/${moverAssetName}.sha256`,
  };
}

export function moverDestination(packageDir: string): string {
  return join(packageDir, sidecarDirectory, moverBinaryName);
}

export function shipsTheMover(platform: NodeJS.Platform, arch: string): boolean {
  return platform === "win32" && arch === "x64";
}

export async function fetchMover(
  destination: string,
  version: string = moverRelease.version,
  download: (url: string) => Promise<Uint8Array> = downloadBytes,
): Promise<FetchedMover> {
  const asset = moverAsset(version);
  const [bytes, checksum] = await Promise.all([
    download(asset.url),
    download(asset.checksumUrl).then((text) => new TextDecoder().decode(text)),
  ]);
  const verified = verifyDigest(bytes, expectedDigest(checksum, asset.name));
  if (!verified.ok) {
    throw new Error(
      `digest mismatch for ${asset.name}: expected ${verified.expected}, got ${verified.actual}`,
    );
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { digest: verified.digest, destination };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", default: false },
      version: { type: "string", default: moverRelease.version },
    },
  });
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!shipsTheMover(process.platform, process.arch)) {
    console.log(
      `fetch-mover: nothing to fetch for ${process.platform}-${process.arch}; panes are moved from JavaScript here`,
    );
    process.exit(0);
  }
  const destination = moverDestination(join(repoRoot, "packages", "desktop"));
  const fetched = await fetchMover(destination, values.version);
  console.log(`${moverAssetName} sha256 ${fetched.digest} → ${fetched.destination}`);
}
