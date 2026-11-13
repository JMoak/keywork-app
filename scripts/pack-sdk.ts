import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { contractVersion, protocolVersion } from "@keywork-app/protocol";
import { repoRoot } from "./lib/repo-files.ts";

export const sdkRepository = "JMoak/keywork-app";

export interface DesktopManifest {
  version: string;
  dependencies: Record<string, string>;
  devDependencies: { electron: string };
}

export interface SdkBuild {
  version: string;
  engine: string;
  contract: string;
  electron: string;
}

export interface SdkReleasePin extends SdkBuild {
  sha256: string;
  source: { repository: string; tag: string; asset: string };
}

export interface PackedSdk {
  archive: string;
  checksum: string;
  pin: SdkReleasePin;
}

export function sdkManifest(desktop: DesktopManifest, sourceSha?: string): object {
  return {
    name: "@jmoak/keywork-desktop",
    version: desktop.version,
    description:
      "The Keywork desktop shell, renderer and product profiles for native applications.",
    type: "module",
    exports: { ".": { types: "./index.d.ts", import: "./out/main/runtime.js" } },
    files: ["out", "index.d.ts", "product.d.ts", "build.json", "installer.nsh", "NOTICE"],
    dependencies: Object.fromEntries(
      Object.entries(desktop.dependencies).filter(
        ([, version]) => !version.startsWith("workspace:"),
      ),
    ),
    peerDependencies: { electron: desktop.devDependencies.electron },
    engines: { node: ">=22.14.0" },
    repository: { type: "git", url: `git+https://github.com/${sdkRepository}.git` },
    publishConfig: { access: "public", provenance: true },
    ...(sourceSha === undefined ? {} : { gitHead: sourceSha }),
  };
}

export function sdkAssetName(sha256: string): string {
  return `sdk-${sha256.slice(0, 12)}.tgz`;
}

export function releaseTag(version: string): string {
  return `v${version}`;
}

export function requireReleaseTag(tag: string, version: string): void {
  if (tag !== releaseTag(version)) {
    throw new Error(
      `tag ${tag} cannot release desktop SDK ${version}; tag ${releaseTag(version)} instead`,
    );
  }
}

export function checksumLine(sha256: string, asset: string): string {
  return `${sha256}  ${asset}\n`;
}

export function sdkReleasePin(build: SdkBuild, sha256: string): SdkReleasePin {
  return {
    sha256,
    source: {
      repository: sdkRepository,
      tag: releaseTag(build.version),
      asset: sdkAssetName(sha256),
    },
    ...build,
  };
}

export async function packDesktopSdk(output: string, expectedTag?: string): Promise<PackedSdk> {
  const desktop = join(repoRoot, "packages", "desktop");
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const manifest: DesktopManifest = JSON.parse(
    await readFile(join(desktop, "package.json"), "utf8"),
  );
  if (expectedTag !== undefined) requireReleaseTag(expectedTag, manifest.version);
  const runtime = await readFile(join(desktop, "out", "main", "runtime.js"), "utf8");
  if (!runtime.includes("startDesktop"))
    throw new Error("build the desktop library before packing it");
  const build: SdkBuild = {
    version: manifest.version,
    engine: protocolVersion,
    contract: contractVersion,
    electron: manifest.devDependencies.electron,
  };
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(join(output, ".sdk-"));
  try {
    await cp(join(desktop, "out"), join(stage, "out"), { recursive: true });
    await cp(join(repoRoot, "NOTICE"), join(stage, "NOTICE"));
    await cp(join(desktop, "resources", "installer.nsh"), join(stage, "installer.nsh"));
    await cp(
      join(repoRoot, "packages", "product", "dist", "index.d.ts"),
      join(stage, "product.d.ts"),
    );
    await writeFile(
      join(stage, "index.d.ts"),
      'export * from "./product.js";\nimport type { ProductProfile } from "./product.js";\nexport declare function startDesktop(profile: ProductProfile): void;\n',
    );
    await writeFile(
      join(stage, "package.json"),
      `${JSON.stringify(sdkManifest(manifest, sourceSha), null, 2)}\n`,
    );
    await writeFile(join(stage, "build.json"), `${JSON.stringify(build, null, 2)}\n`);
    return await nameByChecksum(await npmPack(stage, output), output, build);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function npmPack(stage: string, output: string): Promise<string> {
  const packed = Bun.spawn(
    ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", output],
    {
      cwd: stage,
      stdout: "pipe",
      stderr: "inherit",
    },
  );
  const [code, result] = await Promise.all([packed.exited, new Response(packed.stdout).text()]);
  if (code !== 0) throw new Error(`npm pack failed (${code})`);
  const entries = JSON.parse(result) as { filename: string }[];
  const filename = entries[0]?.filename;
  if (filename === undefined) throw new Error("npm pack did not return an archive");
  return join(output, filename);
}

async function nameByChecksum(packed: string, output: string, build: SdkBuild): Promise<PackedSdk> {
  const sha256 = createHash("sha256")
    .update(await readFile(packed))
    .digest("hex");
  const asset = sdkAssetName(sha256);
  const archive = join(output, asset);
  await rename(packed, archive);
  const checksum = `${archive}.sha256`;
  await writeFile(checksum, checksumLine(sha256, asset));
  return { archive, checksum, pin: sdkReleasePin(build, sha256) };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { output: { type: "string" }, "expect-tag": { type: "string" } },
  });
  const packed = await packDesktopSdk(
    resolve(values.output ?? join(repoRoot, "dist", "sdk")),
    values["expect-tag"],
  );
  console.log(packed.archive);
  console.log(packed.checksum);
  console.log(JSON.stringify(packed.pin, null, 2));
}

import { execFileSync } from "node:child_process";
