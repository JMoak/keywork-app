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

export const engineUpdateBranch = "automation/keywork-engine";
export const enginePinPath = "packages/protocol/src/routes.ts";
const upstream = "JMoak/keywork";
const downstream = "JMoak/keywork-app";
type Request = (url: string, init?: RequestInit) => Promise<Response>;

export interface EngineRelease {
  version: string;
  tag: string;
  sourceSha: string;
  assets: { name: string; digest: string | null }[];
}

export async function publishedEngine(request: Request = fetch): Promise<EngineRelease> {
  const release = await github<{
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: { name: string; state: string; digest?: string | null }[];
  }>(upstream, "releases/latest", request);
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

export function shouldAdopt(candidate: string, current: string, pending?: string): boolean {
  [candidate, current, ...(pending ? [pending] : [])].forEach(stableVersion);
  return gt(candidate, current) && (pending === undefined || !gt(pending, candidate));
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

export function requireOwnedChanges(before: string, after: string, paths: readonly string[]): void {
  if (
    paths.length !== 1 ||
    paths[0] !== enginePinPath ||
    updateEnginePin(before, enginePinOf(after)) !== after
  ) {
    throw new Error(
      "The automation branch contains changes beyond its engine pin; review it manually",
    );
  }
}

export async function verifyEngineContract(
  release: EngineRelease,
  pinned: EventShapes,
  request: Request = fetch,
): Promise<void> {
  const root = `https://raw.githubusercontent.com/${upstream}/${release.sourceSha}/packages/server/src`;
  const [contract, doc, shapes] = await Promise.all([
    downloadText(`${root}/contract.ts`, request),
    downloadText(`${root}/openapi-document.fixture.json`, request),
    downloadText(`${root}/event-shapes.fixture.json`, request),
  ]);
  const servedContract = contract.match(/^export const contractVersion = "(\d+\.\d+)";$/m)?.[1];
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

async function run(): Promise<void> {
  if (
    process.env.GITHUB_REPOSITORY !== downstream ||
    process.env.GITHUB_REF !== "refs/heads/main"
  ) {
    throw new Error("Engine adoption runs only from JMoak/keywork-app main");
  }
  const bot = process.env.DEPENDENCY_BOT_LOGIN ?? "";
  const botId = process.env.DEPENDENCY_BOT_ID ?? "";
  if (!/^[a-zA-Z0-9-]+\[bot\]$/.test(bot) || !/^\d+$/.test(botId) || !process.env.GH_TOKEN) {
    throw new Error(
      "Configure DEPENDENCY_APP_ID and DEPENDENCY_APP_PRIVATE_KEY with contents and pull requests write permissions",
    );
  }
  if (git("status", "--porcelain")) throw new Error("Engine adoption requires a clean checkout");
  const mainSha = git("rev-parse", "HEAD");
  const pending = await pendingUpdate(bot);
  const release = await publishedEngine();
  if (!shouldAdopt(release.version, protocolVersion, pending?.version)) {
    await summarize(
      `No engine update: App pins ${protocolVersion}; published ${release.version}${pending ? `; pending ${pending.version}` : ""}.`,
    );
    return;
  }
  await verifyEngineContract(release, await pinnedEventShapes());
  const digests = await verifyEngineAssets(release);
  const temporary = await mkdtemp(join(tmpdir(), "keywork-engine-update-"));
  const binary = join(temporary, process.platform === "win32" ? "keywork.exe" : "keywork");
  await fetchSidecar(release.version, hostTarget(), binary);
  const source = await readFile(join(repoRoot, enginePinPath), "utf8");
  const updated = updateEnginePin(source, release.version);
  const title = `fix(deps): adopt keywork ${release.version}`;
  let head = pending?.sha;
  const replaceBranch = pending?.version !== release.version || pending.base !== mainSha;
  if (replaceBranch) {
    git("checkout", "-B", engineUpdateBranch, mainSha);
    await writeFile(join(repoRoot, enginePinPath), updated);
    git("add", "--", enginePinPath);
    git(
      "-c",
      `user.name=${bot}`,
      "-c",
      `user.email=${botId}+${bot}@users.noreply.github.com`,
      "commit",
      "-m",
      title,
    );
    head = git("rev-parse", "HEAD");
  } else git("checkout", "--detach", pending.sha);
  if (!head) throw new Error("No verified update commit");
  command("bun", [
    "run",
    "test",
    "scripts/engine-update.test.ts",
    "scripts/fetch-sidecar.test.ts",
    "scripts/check-contract.test.ts",
  ]);
  if (git("rev-parse", "HEAD") !== head || git("status", "--porcelain"))
    throw new Error("Focused checks must leave the exact update commit unchanged");
  if ((await publishedTagSha(release.tag)) !== release.sourceSha)
    throw new Error("Published engine tag moved during verification");
  git("fetch", "origin", "main");
  if (git("rev-parse", "origin/main") !== mainSha)
    throw new Error("App main advanced; rerun adoption against its current contract");
  if (replaceBranch)
    git(
      "push",
      `--force-with-lease=refs/heads/${engineUpdateBranch}:${pending?.sha ?? ""}`,
      "origin",
      `HEAD:refs/heads/${engineUpdateBranch}`,
    );
  const body = join(temporary, "pull-request.md");
  await writeFile(
    body,
    [
      `Adopts [keywork ${release.tag}](https://github.com/${upstream}/releases/tag/${release.tag}) at ${release.sourceSha}.`,
      ``,
      `Only the bundled engine pin changes. Contract ${contractVersion}, routes, request bodies, events, and event shapes match the App. Every native artifact agrees with its published checksums; the Linux binary reports the expected version and contract. Focused adoption, sidecar, and contract tests pass.`,
      ``,
      ...Object.entries(digests).map(([name, digest]) => `- \`${name}\`: \`${digest}\``),
      ``,
      `This branch coalesces compatible public engine releases. The fix(deps) squash commit starts the App patch release after merge.`,
    ].join("\n"),
  );
  const pr =
    pending?.pr ??
    gh(
      "pr",
      "create",
      "--repo",
      downstream,
      "--base",
      "main",
      "--head",
      engineUpdateBranch,
      "--title",
      title,
      "--body-file",
      body,
    );
  if (pending?.pr)
    gh("pr", "edit", pr, "--repo", downstream, "--title", title, "--body-file", body);
  gh(
    "pr",
    "merge",
    pr,
    "--repo",
    downstream,
    "--auto",
    "--squash",
    "--match-head-commit",
    head,
    "--subject",
    title,
  );
  await summarize(
    `Verified engine ${release.version} and enabled squash auto-merge for ${pr} at ${head}. Required repository checks still apply.`,
  );
}

async function pendingUpdate(
  bot: string,
): Promise<{ version: string; sha: string; base: string; pr?: string } | undefined> {
  const refs = git("ls-remote", "--heads", "origin", `refs/heads/${engineUpdateBranch}`);
  const pulls = await github<
    {
      html_url: string;
      user: { login: string; type: string };
      head: { sha: string };
    }[]
  >(
    downstream,
    `pulls?state=open&base=main&head=${encodeURIComponent(`JMoak:${engineUpdateBranch}`)}&per_page=100`,
    fetch,
  );
  if (pulls.length > 1) throw new Error("Multiple engine adoption PRs require review");
  const pr = pulls[0];
  if (!refs) {
    if (pr) throw new Error("Engine PR has no matching branch");
    return undefined;
  }
  git(
    "fetch",
    "origin",
    `refs/heads/${engineUpdateBranch}:refs/remotes/origin/${engineUpdateBranch}`,
  );
  const sha = git("rev-parse", `origin/${engineUpdateBranch}`);
  if (pr && (pr.user.login !== bot || pr.user.type !== "Bot" || pr.head.sha !== sha))
    throw new Error("Engine PR is not the dependency App's current branch");
  const base = git("merge-base", "HEAD", sha);
  if (base === sha) {
    if (pr) throw new Error("Engine PR has already merged; refresh its state before retrying");
    return { version: "0.0.0", sha, base };
  }
  if (git("log", "-1", "--format=%an", sha) !== bot)
    throw new Error("Engine branch is not owned by the dependency App");
  const before = git("show", `${base}:${enginePinPath}`);
  const after = git("show", `${sha}:${enginePinPath}`);
  requireOwnedChanges(before, after, git("diff", "--name-only", `${base}..${sha}`).split("\n"));
  return { version: enginePinOf(after), sha, base, ...(pr ? { pr: pr.html_url } : {}) };
}

function enginePinOf(source: string): string {
  return stableVersion(source.match(/^export const protocolVersion = "([^"]+)";$/m)?.[1] ?? "");
}

function stableVersion(version: string): string {
  if (valid(version) !== version || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(`Invalid stable engine version: ${version}`);
  return version;
}

async function publishedTagSha(tag: string, request: Request = fetch): Promise<string> {
  const ref = await github<{ object: { type: string; sha: string } }>(
    upstream,
    `git/ref/tags/${tag}`,
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

async function github<T>(repository: string, path: string, request: Request): Promise<T> {
  const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
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
