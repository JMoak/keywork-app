import { execFileSync } from "node:child_process";
import { appendFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contractVersion, protocolVersion } from "@keywork-app/protocol";
import { gt, valid } from "semver";
import {
  contractViolations,
  documentOfOpenApi,
  type EventShapes,
  type OpenApiShape,
  pinnedEventShapes,
} from "./check-contract.ts";
import {
  digestOf,
  expectedDigest,
  fetchSidecar,
  hostTarget,
  releaseAssetName,
  sidecarTargets,
} from "./fetch-sidecar.ts";
import { repoRoot } from "./lib/repo-files.ts";

export const enginePinPath = "packages/protocol/src/routes.ts";
export const releaseWorkflow = "release.yml";
export const automationCommitter: Identity = {
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com",
};
const upstream = "JMoak/keywork";
const downstream = "JMoak/keywork-app";
const focusedTests = [
  "scripts/engine-update.test.ts",
  "scripts/fetch-sidecar.test.ts",
  "scripts/check-contract.test.ts",
];
type Request = (url: string, init?: RequestInit) => Promise<Response>;

export interface EngineRelease {
  version: string;
  tag: string;
  sourceSha: string;
  assets: { name: string; digest: string | null }[];
}

export interface Identity {
  name: string;
  email: string;
}

export async function publishedEngine(request: Request = fetch): Promise<EngineRelease> {
  const release = await github<{
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: { name: string; state: string; digest?: string | null }[];
  }>(`repos/${upstream}/releases/latest`, request);
  const version = release.tag_name?.slice(1);
  if (
    release.draft !== false ||
    release.prerelease !== false ||
    release.tag_name !== `v${stableVersion(version)}` ||
    !Array.isArray(release.assets) ||
    !release.assets.every((asset) => typeof asset.name === "string" && asset.state === "uploaded")
  )
    throw new Error("The latest engine release must be public, stable, and fully uploaded");
  return {
    version,
    tag: release.tag_name,
    sourceSha: await publishedTagSha(release.tag_name, request),
    assets: release.assets.map(({ name, digest }) => ({ name, digest: digest ?? null })),
  };
}

export function shouldAdopt(candidate: string, current: string): boolean {
  [candidate, current].forEach(stableVersion);
  return gt(candidate, current);
}

export function updateEnginePin(source: string, version: string): string {
  stableVersion(version);
  if ([...source.matchAll(/^export const protocolVersion = "[^"]+";$/gm)].length !== 1) {
    throw new Error("Expected exactly one engine pin");
  }
  return source.replace(
    /^export const protocolVersion = "[^"]+";$/m,
    `export const protocolVersion = "${version}";`,
  );
}

export async function publishedContract(
  release: EngineRelease,
  request: Request = fetch,
): Promise<string | undefined> {
  const contract = await downloadText(`${sourceRoot(release)}/contract.ts`, request);
  return contract.match(/^export const contractVersion = "(\d+\.\d+)";$/m)?.[1];
}

export async function verifyEngineContract(
  release: EngineRelease,
  pinned: EventShapes,
  request: Request = fetch,
): Promise<void> {
  const root = sourceRoot(release);
  const [servedContract, doc, shapes] = await Promise.all([
    publishedContract(release, request),
    downloadText(`${root}/openapi-document.fixture.json`, request),
    downloadText(`${root}/event-shapes.fixture.json`, request),
  ]);
  if (servedContract !== contractVersion) {
    throw new Error(
      `Engine contract ${servedContract ?? "missing"} differs from App ${contractVersion}; protocol adaptation requires review`,
    );
  }
  const document = {
    ...documentOfOpenApi(JSON.parse(doc) as OpenApiShape, `${upstream}@${release.sourceSha}`),
    shapes: JSON.parse(shapes) as EventShapes,
  };
  const violations = contractViolations(document, pinned);
  if (violations.length)
    throw new Error(`Published engine contract drift:\n${violations.join("\n")}`);
}

export async function verifyEngineAssets(
  release: EngineRelease,
  request: Request = fetch,
): Promise<Record<string, string>> {
  const root = `https://github.com/${upstream}/releases/download/${release.tag}`;
  requireAsset(release, "SHA256SUMS");
  const sums = await downloadText(`${root}/SHA256SUMS`, request);
  const digests: Record<string, string> = {};
  for (const target of sidecarTargets) {
    const name = releaseAssetName(target);
    const asset = requireAsset(release, name);
    requireAsset(release, `${name}.sha256`);
    const digest = expectedDigest(sums, name);
    const detached = expectedDigest(await downloadText(`${root}/${name}.sha256`, request), name);
    if (digest !== detached) throw new Error(`Published checksums disagree for ${name}`);
    const actual = asset.digest ?? `sha256:${digestOf(await download(`${root}/${name}`, request))}`;
    if (actual !== `sha256:${digest}`)
      throw new Error(`Published artifact digest disagrees for ${name}`);
    digests[name] = digest;
  }
  return digests;
}

export async function ownerIdentity(owner: string, request: Request = fetch): Promise<Identity> {
  if (!/^[a-zA-Z0-9-]+$/.test(owner)) throw new Error(`Invalid repository owner: ${owner}`);
  const user = await github<{ id: number; login: string; name?: string | null }>(
    `users/${owner}`,
    request,
  );
  if (!Number.isSafeInteger(user.id) || user.login !== owner)
    throw new Error(`GitHub returned another account for ${owner}`);
  const name = user.name?.replace(/\s+/g, " ").trim();
  return { name: name || owner, email: `${user.id}+${owner}@users.noreply.github.com` };
}

async function run(): Promise<void> {
  if (
    process.env.GITHUB_REPOSITORY !== downstream ||
    process.env.GITHUB_REF !== "refs/heads/main"
  ) {
    throw new Error("Engine adoption runs only from JMoak/keywork-app main");
  }
  if (!process.env.GH_TOKEN)
    throw new Error("Engine adoption needs the workflow token as GH_TOKEN");
  if (git("status", "--porcelain")) throw new Error("Engine adoption requires a clean checkout");
  const mainSha = git("rev-parse", "HEAD");
  const release = await publishedEngine();
  if (!shouldAdopt(release.version, protocolVersion)) {
    await summarize(`No engine update: App pins ${protocolVersion}; published ${release.version}.`);
    return;
  }
  const served = await publishedContract(release);
  if (served !== contractVersion) {
    await hold(
      `Holding keywork ${release.version}: it serves contract ${served ?? "unknown"} and the App speaks ${contractVersion}. Adopt that contract in the App; the pin follows on the next run.`,
    );
    return;
  }
  await verifyEngineContract(release, await pinnedEventShapes());
  await verifyEngineAssets(release);
  await verifyHostBinary(release.version);
  const author = await ownerIdentity(process.env.GITHUB_REPOSITORY_OWNER ?? "");
  const head = await commitPin(release.version, author);
  command("bun", ["run", "test", ...focusedTests]);
  if (git("rev-parse", "HEAD") !== head || git("status", "--porcelain"))
    throw new Error("Focused checks must leave the exact update commit unchanged");
  if ((await publishedTagSha(release.tag)) !== release.sourceSha)
    throw new Error("Published engine tag moved during verification");
  git("fetch", "origin", "main");
  if (git("rev-parse", "origin/main") !== mainSha) {
    await hold(
      `App main advanced while keywork ${release.version} was verified; the next run adopts it against the new main.`,
    );
    return;
  }
  git("push", "origin", `${head}:refs/heads/main`);
  gh("workflow", "run", releaseWorkflow, "--repo", downstream, "--ref", "main");
  await summarize(
    `Adopted keywork ${release.version} on main at ${head} and started ${releaseWorkflow}.`,
  );
}

async function verifyHostBinary(version: string): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "keywork-engine-update-"));
  const binary = join(temporary, process.platform === "win32" ? "keywork.exe" : "keywork");
  await fetchSidecar(version, hostTarget(), binary);
}

async function commitPin(version: string, author: Identity): Promise<string> {
  const pin = join(repoRoot, enginePinPath);
  await writeFile(pin, updateEnginePin(await readFile(pin, "utf8"), version));
  git("add", "--", enginePinPath);
  execFileSync("git", ["commit", "-m", `fix(deps): adopt keywork ${version}`], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: automationCommitter.name,
      GIT_COMMITTER_EMAIL: automationCommitter.email,
    },
  });
  return git("rev-parse", "HEAD");
}

function sourceRoot(release: EngineRelease): string {
  return `https://raw.githubusercontent.com/${upstream}/${release.sourceSha}/packages/server/src`;
}

function stableVersion(version: string): string {
  if (valid(version) !== version || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`Invalid stable engine version: ${version}`);
  return version;
}

async function publishedTagSha(tag: string, request: Request = fetch): Promise<string> {
  const ref = await github<{ object: { type: string; sha: string } }>(
    `repos/${upstream}/git/ref/tags/${tag}`,
    request,
  );
  if (ref.object?.type !== "commit" || !/^[a-f0-9]{40}$/.test(ref.object.sha))
    throw new Error("Published engine must have an immutable lightweight commit tag");
  return ref.object.sha;
}

function requireAsset(release: EngineRelease, name: string): EngineRelease["assets"][number] {
  const assets = release.assets.filter((asset) => asset.name === name);
  if (assets.length !== 1 || !assets[0]) throw new Error(`Expected one published ${name} asset`);
  return assets[0];
}

async function github<T>(path: string, request: Request): Promise<T> {
  const response = await request(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GH_TOKEN ?? ""}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub ${path} failed: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function download(url: string, request: Request): Promise<Uint8Array> {
  const response = await request(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok)
    throw new Error(`Published engine download failed: HTTP ${response.status}: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function downloadText(url: string, request: Request): Promise<string> {
  return new TextDecoder().decode(await download(url, request));
}

async function hold(message: string): Promise<void> {
  console.log(`::notice::${message}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

async function summarize(message: string): Promise<void> {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
}

function command(program: string, args: string[]): void {
  execFileSync(program, args, { cwd: repoRoot, stdio: "inherit" });
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function gh(...args: string[]): string {
  return execFileSync("gh", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

if (import.meta.main) await run();
