import { execFileSync, spawnSync } from "node:child_process";
import { appendFile, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyzeCommits } from "@semantic-release/commit-analyzer";
import { gt, gte, inc, valid } from "semver";
import { repoRoot } from "./lib/repo-files.ts";

export interface ReleasePlan {
  version: string;
  tag: string;
}

export interface GithubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string }[];
}

export type GithubRequest = (url: string, init?: RequestInit) => Promise<Response>;

export interface ReleaseInput {
  refType: string;
  refName: string;
  latestTag?: string;
  commits: readonly { hash: string; message: string }[];
}

export async function planRelease(input: ReleaseInput): Promise<ReleasePlan | undefined> {
  const latest = input.latestTag === undefined ? undefined : versionOfTag(input.latestTag);
  if (input.refType === "tag") {
    const version = versionOfTag(input.refName);
    if (latest === version) return undefined;
    if (latest !== undefined && !gt(version, latest)) {
      throw new Error(`Tag ${input.refName} cannot replace newer published v${latest}`);
    }
    return { version, tag: input.refName };
  }
  if (input.refName !== "main") throw new Error("Automatic releases require main");
  if (latest === undefined) return undefined;
  const bump = await analyzeCommits(
    {
      preset: "conventionalcommits",
      releaseRules: [
        { breaking: true, release: "major" },
        { revert: true, release: false },
      ],
    },
    { cwd: repoRoot, commits: input.commits, logger: { log() {} } },
  );
  if (bump === null) return undefined;
  const version = inc(latest, bump);
  if (version === null) throw new Error(`Cannot increment ${latest} by ${bump}`);
  return { version, tag: `v${version}` };
}

export function versionOfTag(tag: string): string {
  const version = tag.slice(1);
  if (tag !== `v${valid(version)}` || version.includes("-") || !gte(version, "0.2.2")) {
    throw new Error(`Expected a stable v<version> tag at or above v0.2.2, got ${tag}`);
  }
  return version;
}

export function requireTagCommit(tag: string, expected: string, actual?: string): void {
  if (actual !== undefined && actual !== expected) {
    throw new Error(`${tag} already identifies ${actual}; rerun its original release workflow`);
  }
}

export async function assignDesktopVersion(version: string, root = repoRoot): Promise<void> {
  versionOfTag(`v${version}`);
  const path = join(root, "packages", "desktop", "package.json");
  const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  manifest.version = version;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function obsoleteSdkAssets(
  existing: readonly string[],
  incoming: readonly string[],
): string[] {
  return existing.filter(
    (name) => /^sdk-[a-f0-9]{12}\.tgz(?:\.sha256)?$/.test(name) && !incoming.includes(name),
  );
}

export async function releaseForTag(
  repository: string,
  tag: string,
  request: GithubRequest = fetch,
): Promise<GithubRelease | undefined> {
  const published = await github<unknown>(repository, `releases/tags/${tag}`, undefined, request);
  if (published !== undefined) {
    const release = parseGithubRelease(published);
    if (release.tag_name !== tag) throw new Error(`GitHub returned another release for ${tag}`);
    return release;
  }
  for (let page = 1; ; page++) {
    const entries = await github<unknown>(
      repository,
      `releases?per_page=100&page=${page}`,
      undefined,
      request,
    );
    if (!Array.isArray(entries)) throw new Error("GitHub returned an invalid releases list");
    const releases = entries.map(parseGithubRelease);
    const release = releases.find((candidate) => candidate.tag_name === tag);
    if (release !== undefined) return release;
    if (releases.length < 100) return undefined;
  }
}

async function run(): Promise<void> {
  if (process.argv[2] === "version") {
    const version = process.argv[3];
    if (version === undefined) throw new Error("Expected a release version");
    await assignDesktopVersion(version);
    return;
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository !== "JMoak/keywork-app") throw new Error("Unexpected release repository");
  const refType = process.env.GITHUB_REF_TYPE ?? "";
  const refName = process.env.GITHUB_REF_NAME ?? "";
  const sha = git("rev-parse", "HEAD");
  if (sha !== process.env.GITHUB_SHA)
    throw new Error("Checkout does not match the workflow commit");
  if (process.argv[2] === "publish") {
    const tag = process.env.RELEASE_TAG ?? "";
    versionOfTag(tag);
    await publishRelease(repository, tag, sha);
    return;
  }
  if (process.argv[2] !== "plan") throw new Error("Expected plan, version, or publish");
  const latestTag = await latestReleaseTag(repository);
  if (latestTag !== undefined) {
    versionOfTag(latestTag);
    git("merge-base", "--is-ancestor", `refs/tags/${latestTag}`, "HEAD");
    if (latestTag === refName) requireTagCommit(latestTag, sha, tagCommit(latestTag));
  }
  const plan = await planRelease({
    refType,
    refName,
    ...(latestTag === undefined ? {} : { latestTag }),
    commits: latestTag === undefined ? [] : commitsSince(latestTag),
  });
  if (plan !== undefined) requireTagCommit(plan.tag, sha, tagCommit(plan.tag));
  const output = process.env.GITHUB_OUTPUT;
  if (output === undefined) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(
    output,
    `publish=${plan !== undefined}\nversion=${plan?.version ?? ""}\ntag=${plan?.tag ?? ""}\n`,
  );
  const summary =
    plan === undefined
      ? "No release is due. Main requires the published v0.2.2 baseline and an unreleased conventional release commit."
      : `Release ${plan.tag} from ${sha} after all desktop and SDK checks pass.`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}

async function latestReleaseTag(repository: string): Promise<string | undefined> {
  const release = await github<{ tag_name: string; draft: boolean; prerelease: boolean }>(
    repository,
    "releases/latest",
  );
  if (release === undefined) return undefined;
  if (release.draft || release.prerelease)
    throw new Error("Latest release must be public and stable");
  return release.tag_name;
}

async function publishRelease(repository: string, tag: string, sha: string): Promise<void> {
  const ref = await github<{ object: { sha: string; type: string } }>(
    repository,
    `git/ref/tags/${tag}`,
  );
  if (ref !== undefined) {
    if (ref.object.type !== "commit") throw new Error(`${tag} must be a lightweight release tag`);
    requireTagCommit(tag, sha, ref.object.sha);
  } else {
    await github(repository, "git/refs", { ref: `refs/tags/${tag}`, sha });
  }
  const release = await releaseForTag(repository, tag);
  if (release !== undefined && !release.draft) {
    if (release.prerelease) throw new Error(`${tag} is already published as a prerelease`);
    console.log(`${tag} is already published; its assets remain unchanged`);
    return;
  }
  if (release === undefined) {
    gh(
      "release",
      "create",
      tag,
      "--repo",
      repository,
      "--draft",
      "--verify-tag",
      "--generate-notes",
      "--title",
      `keywork-app ${tag}`,
    );
  }
  const directory = join(repoRoot, "dist", "release");
  const names = await readdir(directory);
  const assets = names.map((name) => join(directory, name));
  if (assets.length === 0) throw new Error("No verified desktop release assets were downloaded");
  for (const asset of obsoleteSdkAssets(release?.assets.map(({ name }) => name) ?? [], names)) {
    gh("release", "delete-asset", tag, asset, "--repo", repository, "--yes");
  }
  gh("release", "upload", tag, "--repo", repository, "--clobber", ...assets);
  gh(
    "release",
    "edit",
    tag,
    "--repo",
    repository,
    "--draft=false",
    "--prerelease=false",
    "--latest",
  );
}

function parseGithubRelease(value: unknown): GithubRelease {
  if (
    typeof value !== "object" ||
    value === null ||
    !("tag_name" in value) ||
    typeof value.tag_name !== "string" ||
    !("draft" in value) ||
    typeof value.draft !== "boolean" ||
    !("prerelease" in value) ||
    typeof value.prerelease !== "boolean" ||
    !("assets" in value) ||
    !Array.isArray(value.assets) ||
    !value.assets.every(isReleaseAsset)
  ) {
    throw new Error("GitHub returned invalid release metadata");
  }
  return {
    tag_name: value.tag_name,
    draft: value.draft,
    prerelease: value.prerelease,
    assets: value.assets,
  };
}

function isReleaseAsset(value: unknown): value is { name: string } {
  return (
    typeof value === "object" && value !== null && "name" in value && typeof value.name === "string"
  );
}

async function github<T>(
  repository: string,
  route: string,
  body?: object,
  request: GithubRequest = fetch,
): Promise<T | undefined> {
  const response = await request(`https://api.github.com/repos/${repository}/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GH_TOKEN ?? ""}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404 && body === undefined) return undefined;
  if (!response.ok) throw new Error(`GitHub ${route} failed: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function gh(...args: string[]): void {
  execFileSync("gh", args, { cwd: repoRoot, stdio: "inherit" });
}

function commitsSince(tag: string): { hash: string; message: string }[] {
  const fields = git("log", "--format=%H%x00%B%x00", `${tag}..HEAD`).split("\0");
  const commits = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const hash = fields[index]?.trim();
    const message = fields[index + 1];
    if (hash && message !== undefined) commits.push({ hash, message });
  }
  return commits;
}

function tagCommit(tag: string): string | undefined {
  const ref = `refs/tags/${tag}`;
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", ref], { cwd: repoRoot });
  if (result.status === 1) return undefined;
  if (result.status !== 0) throw new Error(`Cannot inspect ${ref}`);
  return git("rev-parse", `${ref}^{commit}`);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

if (import.meta.main) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
