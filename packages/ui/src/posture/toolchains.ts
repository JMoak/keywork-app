export interface CommandFamily {
  readonly command: string;
  readonly manifest: string;
  readonly reason: string;
}

export function isManifest(name: string): boolean {
  return recognisedManifests.has(name);
}

export function commandFamilies(
  manifests: readonly string[],
  scripts: readonly string[],
): CommandFamily[] {
  const seen = new Set(manifests);
  return [
    ...(seen.has(packageManifest) ? packageFamilies(seen, scripts) : []),
    ...manifests.flatMap(toolchainFamilies),
  ];
}

export function scriptsOfPackage(text: string): string[] {
  const parsed: unknown = JSON.parse(text);
  const scripts = isRecord(parsed) ? parsed.scripts : undefined;
  return isRecord(scripts) ? Object.keys(scripts) : [];
}

export const packageManifest = "package.json";

interface PackageManager {
  readonly program: string;
  readonly lockfiles: readonly string[];
  readonly testRunsTheScript: boolean;
}

const packageManagers: readonly PackageManager[] = [
  { program: "bun", lockfiles: ["bun.lock", "bun.lockb"], testRunsTheScript: false },
  { program: "pnpm", lockfiles: ["pnpm-lock.yaml"], testRunsTheScript: true },
  { program: "yarn", lockfiles: ["yarn.lock"], testRunsTheScript: true },
  { program: "npm", lockfiles: ["package-lock.json"], testRunsTheScript: true },
];

const npmByDefault = packageManagers.at(-1) as PackageManager;

type Verb = readonly [command: string, does: string];

const denoVerbs: readonly Verb[] = [
  ["deno test", "runs the project's tests"],
  ["deno fmt", "formats the project"],
  ["deno lint", "lints the project"],
  ["deno task", "runs the project's tasks"],
];

const toolchainVerbs: Readonly<Record<string, readonly Verb[]>> = {
  "Cargo.toml": [
    ["cargo build", "builds the crate"],
    ["cargo test", "runs the crate's tests"],
    ["cargo check", "type-checks the crate"],
    ["cargo fmt", "formats the crate"],
    ["cargo clippy", "lints the crate"],
  ],
  "go.mod": [
    ["go build", "builds the module"],
    ["go test", "runs the module's tests"],
    ["go vet", "vets the module"],
    ["go fmt", "formats the module"],
  ],
  "deno.json": denoVerbs,
  "deno.jsonc": denoVerbs,
  "uv.lock": [
    ["uv run", "runs the project's tools"],
    ["uv sync", "installs what it pins"],
  ],
  "poetry.lock": [
    ["poetry run", "runs the project's tools"],
    ["poetry install", "installs what it pins"],
  ],
};

const recognisedManifests: ReadonlySet<string> = new Set([
  packageManifest,
  ...packageManagers.flatMap((manager) => manager.lockfiles),
  ...Object.keys(toolchainVerbs),
]);

function packageFamilies(seen: ReadonlySet<string>, scripts: readonly string[]): CommandFamily[] {
  const pinned = packageManagers
    .flatMap((manager) => manager.lockfiles.map((lockfile) => ({ manager, lockfile })))
    .find(({ lockfile }) => seen.has(lockfile));
  const { program, testRunsTheScript } = pinned?.manager ?? npmByDefault;
  return [
    pinned === undefined
      ? family(`${program} install`, packageManifest, "installs its dependencies")
      : family(`${program} install`, pinned.lockfile, "installs what it pins"),
    ...(scripts.length === 0
      ? []
      : [
          family(
            `${program} run`,
            packageManifest,
            "runs any of them",
            `scripts ${scripts.join(", ")}`,
          ),
        ]),
    ...(testRunsTheScript && scripts.includes("test")
      ? [family(`${program} test`, packageManifest, "runs it", "script test")]
      : []),
  ];
}

function toolchainFamilies(manifest: string): CommandFamily[] {
  return (toolchainVerbs[manifest] ?? []).map(([command, does]) => family(command, manifest, does));
}

function family(command: string, manifest: string, does: string, detail?: string): CommandFamily {
  const source = detail === undefined ? manifest : `${manifest} ${detail}`;
  return { command: `${command} *`, manifest, reason: `${source} · ${does}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
