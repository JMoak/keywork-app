import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { contractVersion, protocolVersion } from "@keywork-app/protocol";
import {
  bundledSidecar,
  sidecarBinaryName,
  sidecarDirectory,
} from "../packages/desktop/src/shared/sidecar.ts";
import { repoRoot } from "./lib/repo-files.ts";

export const sidecarRelease = { owner: "JMoak", repo: "keywork" } as const;

export type SidecarArch = "x64" | "arm64";

export interface SidecarTarget {
  platform: NodeJS.Platform;
  arch: SidecarArch;
}

export interface SidecarAsset {
  name: string;
  url: string;
  checksumUrl: string;
}

export interface SidecarHost {
  platform: NodeJS.Platform;
  arch: string;
  versionLineOf: (binary: string) => string;
}

export type SidecarIdentity =
  | { kind: "confirmed"; line: string }
  | { kind: "unchecked"; reason: string };

export interface FetchedSidecar {
  digest: string;
  destination: string;
  identity: SidecarIdentity;
}

export const sidecarTargets: readonly SidecarTarget[] = [
  { platform: "win32", arch: "x64" },
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "linux", arch: "x64" },
  { platform: "linux", arch: "arm64" },
];

export const usage = `fetch-sidecar: download the pinned keywork binary, verify its SHA-256, and confirm its identity

  bun scripts/fetch-sidecar.ts                        host platform into packages/desktop/sidecar/
  bun scripts/fetch-sidecar.ts --all                  every platform into packages/desktop/sidecar/<platform>-<arch>/
  bun scripts/fetch-sidecar.ts --platform linux --arch arm64
  bun scripts/fetch-sidecar.ts --version <x.y.z>      defaults to the protocol version (${protocolVersion})

Nothing is written until the download matches the release's published .sha256. A binary this
host can run must then report the version asked for and contract ${contractVersion} exactly;
one it cannot run is written and reported as unchecked.`;

export function releaseAssetName(target: SidecarTarget): string {
  switch (target.platform) {
    case "win32":
      return `keywork-windows-${target.arch}.exe`;
    case "darwin":
      return `keywork-darwin-${target.arch}`;
    case "linux":
      return `keywork-linux-${target.arch}`;
    default:
      throw new Error(`keywork publishes no sidecar for ${target.platform}`);
  }
}

export function releaseAsset(version: string, target: SidecarTarget): SidecarAsset {
  const name = releaseAssetName(target);
  const base = `https://github.com/${sidecarRelease.owner}/${sidecarRelease.repo}/releases/download/v${version}`;
  return { name, url: `${base}/${name}`, checksumUrl: `${base}/${name}.sha256` };
}

export function expectedDigest(checksumText: string, assetName: string): string {
  const line = checksumText
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find(
      (candidate) => candidate.endsWith(` ${assetName}`) || candidate.endsWith(`*${assetName}`),
    );
  const digest = line?.split(/\s+/)[0];
  if (digest === undefined || !/^[0-9a-f]{64}$/i.test(digest)) {
    throw new Error(`no SHA-256 for ${assetName} in the published checksum`);
  }
  return digest.toLowerCase();
}

export function digestOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyDigest(
  bytes: Uint8Array,
  expected: string,
): { ok: true; digest: string } | { ok: false; expected: string; actual: string } {
  const actual = digestOf(bytes);
  return actual === expected ? { ok: true, digest: actual } : { ok: false, expected, actual };
}

export function sidecarDestination(
  packageDir: string,
  target: SidecarTarget,
  everyPlatform: boolean,
): string {
  if (!everyPlatform) return bundledSidecar(packageDir, target.platform);
  const slot = `${target.platform}-${target.arch}`;
  return join(packageDir, sidecarDirectory, slot, sidecarBinaryName(target.platform));
}

export function hostTarget(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): SidecarTarget {
  if (arch !== "x64" && arch !== "arm64") throw new Error(`no keywork sidecar for ${arch}`);
  return { platform, arch };
}

export function sidecarIdentityLine(version: string): string {
  return `keywork ${version} · contract ${contractVersion}`;
}

export const thisHost: SidecarHost = {
  platform: process.platform,
  arch: process.arch,
  versionLineOf: reportedVersionLine,
};

export async function fetchSidecar(
  version: string,
  target: SidecarTarget,
  destination: string,
  download: (url: string) => Promise<Uint8Array> = downloadBytes,
  host: SidecarHost = thisHost,
): Promise<FetchedSidecar> {
  const asset = releaseAsset(version, target);
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
  const identity = hostCanRun(host, target)
    ? await installConfirmedBinary(bytes, version, target, destination, host, asset.name)
    : await installUncheckedBinary(bytes, target, destination, host);
  return { digest: verified.digest, destination, identity };
}

export function identityReport(assetName: string, identity: SidecarIdentity): string {
  return identity.kind === "confirmed"
    ? `${assetName} reports ${identity.line}`
    : `${assetName} identity not checked: ${identity.reason}`;
}

function hostCanRun(host: SidecarHost, target: SidecarTarget): boolean {
  return host.platform === target.platform && host.arch === target.arch;
}

async function installConfirmedBinary(
  bytes: Uint8Array,
  version: string,
  target: SidecarTarget,
  destination: string,
  host: SidecarHost,
  assetName: string,
): Promise<SidecarIdentity> {
  const staging = await mkdtemp(join(dirname(destination), ".fetch-sidecar-"));
  try {
    const staged = join(staging, basename(destination));
    await writeBinary(staged, bytes, target);
    const reported = reportedIdentity(host, staged, assetName);
    const expected = sidecarIdentityLine(version);
    if (reported !== expected) {
      throw new Error(
        `refusing ${assetName}: it reports "${reported}", but this console needs "${expected}"; fix the pinned version or republish that keywork release`,
      );
    }
    await rename(staged, destination);
    return { kind: "confirmed", line: expected };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function installUncheckedBinary(
  bytes: Uint8Array,
  target: SidecarTarget,
  destination: string,
  host: SidecarHost,
): Promise<SidecarIdentity> {
  await writeBinary(destination, bytes, target);
  return {
    kind: "unchecked",
    reason: `this ${host.platform}-${host.arch} host cannot run a ${target.platform}-${target.arch} binary, so --version was not run; the digest matched`,
  };
}

async function writeBinary(path: string, bytes: Uint8Array, target: SidecarTarget): Promise<void> {
  await writeFile(path, bytes);
  if (target.platform !== "win32") await chmod(path, 0o755);
}

function reportedIdentity(host: SidecarHost, binary: string, assetName: string): string {
  try {
    return host.versionLineOf(binary).trim();
  } catch (cause) {
    throw new Error(
      `refusing ${assetName}: it could not report its version (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }
}

function reportedVersionLine(binary: string): string {
  const directory = dirname(binary);
  const child = spawnSync(binary, ["--version"], {
    cwd: directory,
    env: minimalEnvironment(directory),
    encoding: "utf8",
    timeout: 30_000,
  });
  if (child.error !== undefined) throw child.error;
  if (child.status !== 0) throw new Error(`exited ${child.status}: ${child.stderr.trim()}`);
  return child.stdout;
}

function minimalEnvironment(home: string): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot;
  return {
    HOME: home,
    USERPROFILE: home,
    ...(systemRoot === undefined ? {} : { SystemRoot: systemRoot }),
  };
}

async function downloadBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} fetching ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      all: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      platform: { type: "string" },
      arch: { type: "string" },
      version: { type: "string", default: protocolVersion },
    },
  });
  if (values.help) {
    console.log(usage);
    process.exit(0);
  }
  const packageDir = join(repoRoot, "packages", "desktop");
  const targets = values.all
    ? sidecarTargets
    : [hostTarget(values.platform as NodeJS.Platform | undefined, values.arch)];
  for (const target of targets) {
    const destination = sidecarDestination(packageDir, target, values.all);
    const fetched = await fetchSidecar(values.version, target, destination);
    console.log(`${releaseAssetName(target)} sha256 ${fetched.digest} → ${fetched.destination}`);
    console.log(identityReport(releaseAssetName(target), fetched.identity));
  }
}
