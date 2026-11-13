import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { contractVersion, protocolVersion } from "@keywork-app/protocol";
import { gt, valid } from "semver";
import { repoRoot } from "./lib/repo-files.ts";
import type { DesktopManifest, SdkBuild } from "./pack-sdk.ts";
import { versionOfTag } from "./release.ts";

export const sdkPackage = "@jmoak/keywork-desktop";
const registry = `https://registry.npmjs.org/${sdkPackage}`;

export interface SdkPublication extends SdkBuild {
  sourceSha: string;
}

export function verifyRegistryIdentity(
  value: unknown,
  expected: SdkPublication,
): { tarball: string; integrity: string } {
  if (!isRecord(value) || value.name !== sdkPackage || value.version !== expected.version)
    throw new Error("npm returned another SDK package or version");
  if (value.gitHead !== expected.sourceSha)
    throw new Error(`${sdkPackage}@${expected.version} belongs to another source commit`);
  const dist = value.dist;
  if (!isRecord(dist)) throw new Error("npm did not return SDK distribution metadata");
  const tarball = `${registry}/-/keywork-desktop-${expected.version}.tgz`;
  if (dist.tarball !== tarball || typeof dist.integrity !== "string")
    throw new Error("npm returned an unexpected SDK tarball");
  if (!/^sha512-[A-Za-z0-9+/]{86}==$/.test(dist.integrity))
    throw new Error("npm did not return a SHA-512 SDK integrity digest");
  if (
    !isRecord(dist.attestations) ||
    !isRecord(dist.attestations.provenance) ||
    !["https://slsa.dev/provenance/v0.2", "https://slsa.dev/provenance/v1"].includes(
      String(dist.attestations.provenance.predicateType),
    )
  ) {
    throw new Error("npm has not exposed the SDK provenance attestation");
  }
  return { tarball, integrity: dist.integrity };
}

export function verifySdkContents(
  manifest: unknown,
  build: unknown,
  expected: SdkPublication,
): void {
  if (
    !isRecord(manifest) ||
    manifest.name !== sdkPackage ||
    manifest.version !== expected.version ||
    manifest.gitHead !== expected.sourceSha
  ) {
    throw new Error("SDK archive does not match its immutable package identity");
  }
  for (const field of ["version", "engine", "contract", "electron"] as const) {
    if (!isRecord(build) || build[field] !== expected[field])
      throw new Error(`SDK archive has a different ${field}`);
  }
}

export function publicationDistTag(version: string, latest?: string): string {
  if (latest !== undefined && valid(latest) === null)
    throw new Error("npm returned an invalid latest SDK version");
  return latest !== undefined && gt(latest, version) ? `release-${version}` : "latest";
}

export function sdkNotification(publication: SdkPublication): object {
  return { event_type: "keywork-sdk-published", client_payload: publication };
}

async function run(): Promise<void> {
  const command = process.argv[2];
  if (command !== "publish" && command !== "notify") throw new Error("Expected publish or notify");
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (process.env.GITHUB_REPOSITORY !== "JMoak/keywork-app" || sourceSha !== process.env.GITHUB_SHA)
    throw new Error("SDK publication requires the release workflow's source commit");
  const desktop: DesktopManifest = JSON.parse(
    await readFile(join(repoRoot, "packages", "desktop", "package.json"), "utf8"),
  );
  const expected: SdkPublication = {
    version: versionOfTag(process.env.RELEASE_TAG ?? ""),
    sourceSha,
    engine: protocolVersion,
    contract: contractVersion,
    electron: desktop.devDependencies.electron,
  };
  if (command === "notify") {
    await verifyPublishedSdk(expected);
    await notifyStead(expected);
    return;
  }
  const directory = join(repoRoot, "dist", "sdk");
  const archives = (await readdir(directory)).filter((name) =>
    /^sdk-[a-f0-9]{12}\.tgz$/.test(name),
  );
  if (archives.length !== 1) throw new Error("Expected exactly one built SDK archive");
  const archive = join(directory, archives[0] ?? "");
  const contents = await readFile(archive);
  verifyArchive(contents, expected);
  if ((await registryVersion(expected.version)) !== undefined) {
    await verifyPublishedSdk(expected);
    await report("published", `${sdkPackage}@${expected.version} already exists and is verified.`);
    return;
  }
  if (process.env.NPM_TRUSTED_PUBLISHING_READY !== "true") {
    await report(
      "setup-needed",
      "SDK publication needs npm bootstrap and the release.yml trusted publisher; set NPM_TRUSTED_PUBLISHING_READY=true after setup.",
    );
    return;
  }
  const latest = await registryVersion("latest");
  if (latest !== undefined && (!isRecord(latest) || typeof latest.version !== "string"))
    throw new Error("npm returned invalid latest SDK metadata");
  const tag = publicationDistTag(
    expected.version,
    isRecord(latest) && typeof latest.version === "string" ? latest.version : undefined,
  );
  execFileSync(
    "npm",
    ["publish", archive, "--access", "public", "--provenance", "--ignore-scripts", "--tag", tag],
    { cwd: repoRoot, stdio: "inherit" },
  );
  await verifyPublishedSdk(expected, integrityOf(contents));
  await report("published", `Published and verified ${sdkPackage}@${expected.version}.`);
}

async function verifyPublishedSdk(expected: SdkPublication, integrity?: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const dist = verifyRegistryIdentity(await registryVersion(expected.version), expected);
      if (integrity !== undefined && dist.integrity !== integrity)
        throw new Error("npm published bytes differ from the built SDK archive");
      const response = await fetch(dist.tarball, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`SDK tarball download failed: HTTP ${response.status}`);
      const contents = Buffer.from(await response.arrayBuffer());
      if (integrityOf(contents) !== dist.integrity)
        throw new Error("Published SDK tarball failed its integrity check");
      verifyArchive(contents, expected);
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function notifyStead(publication: SdkPublication): Promise<void> {
  const token = process.env.DEPENDENCY_TOKEN;
  if (!token) {
    await report(
      "setup-needed",
      "SDK is verified; Stead notification needs the dependency GitHub App credentials.",
    );
    return;
  }
  const response = await fetch("https://api.github.com/repos/JMoak/stead/dispatches", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sdkNotification(publication)),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== 204)
    throw new Error(`Stead notification failed: HTTP ${response.status}`);
  await report("notified", `Notified Stead of verified SDK ${publication.version}.`);
}

function verifyArchive(contents: Buffer, expected: SdkPublication): void {
  const read = (name: string): unknown =>
    JSON.parse(
      execFileSync("tar", ["-xzOf", "-", `package/${name}`], { input: contents, encoding: "utf8" }),
    );
  verifySdkContents(read("package.json"), read("build.json"), expected);
}

async function registryVersion(version: string): Promise<unknown | undefined> {
  const response = await fetch(`${registry}/${version}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`npm SDK lookup failed: HTTP ${response.status}`);
  return response.json();
}

function integrityOf(contents: Buffer): string {
  return `sha512-${createHash("sha512").update(contents).digest("base64")}`;
}

async function report(status: string, message: string): Promise<void> {
  console.log(`${status === "setup-needed" ? "::warning::" : ""}${message}`);
  if (process.env.GITHUB_OUTPUT !== undefined)
    await appendFile(process.env.GITHUB_OUTPUT, `status=${status}\n`);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

if (import.meta.main) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
