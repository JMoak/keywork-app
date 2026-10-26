export interface CommandFamily {
  readonly command: string;
  readonly manifest: string;
  readonly reason: string;
}

export interface ScriptRunner {
  readonly program: string;
  readonly scripts: readonly string[];
}

export function isManifest(name: string): boolean {
  return recognisedManifests.has(name);
}

export function commandFamilies(
  manifests: readonly string[],
  scripts: readonly string[],
  runners: readonly ScriptRunner[] = [],
): CommandFamily[] {
  const seen = new Set(manifests);
  return [
    ...(seen.has(packageManifest) ? packageFamilies(seen, scripts, runners) : []),
    ...manifests.flatMap(toolchainFamilies),
  ];
}

export function scriptsOfPackage(text: string): string[] {
  return Object.keys(scriptBodiesOf(JSON.parse(text)));
}

export function runnersOfPackage(text: string): ScriptRunner[] {
  const parsed: unknown = JSON.parse(text);
  const installed = installedPrograms(parsed);
  const runners = new Map<string, string[]>();
  for (const [script, body] of Object.entries(scriptBodiesOf(parsed))) {
    for (const program of programsRunBy(body).filter((name) => installed.has(name))) {
      runners.set(program, [...new Set([...(runners.get(program) ?? []), script])]);
    }
  }
  return [...runners].map(([program, scripts]) => ({ program, scripts }));
}

export const packageManifest = "package.json";

interface PackageManager {
  readonly program: string;
  readonly lockfiles: readonly string[];
  readonly testRunsTheScript: boolean;
  readonly runsInstalled: string;
}

const packageManagers: readonly PackageManager[] = [
  {
    program: "bun",
    lockfiles: ["bun.lock", "bun.lockb"],
    testRunsTheScript: false,
    runsInstalled: "bunx",
  },
  {
    program: "pnpm",
    lockfiles: ["pnpm-lock.yaml"],
    testRunsTheScript: true,
    runsInstalled: "pnpm exec",
  },
  { program: "yarn", lockfiles: ["yarn.lock"], testRunsTheScript: true, runsInstalled: "yarn" },
  {
    program: "npm",
    lockfiles: ["package-lock.json"],
    testRunsTheScript: true,
    runsInstalled: "npx",
  },
];

const npmByDefault = packageManagers.at(-1) as PackageManager;

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;

const typingsScope = "@types/";

const commandSeparators = /&&|\|\||[;|]/;

const programsNamedOtherwise: Readonly<Record<string, readonly string[]>> = {
  typescript: ["tsc"],
  "@playwright/test": ["playwright"],
};

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

function packageFamilies(
  seen: ReadonlySet<string>,
  scripts: readonly string[],
  runners: readonly ScriptRunner[],
): CommandFamily[] {
  const pinned = packageManagers
    .flatMap((manager) => manager.lockfiles.map((lockfile) => ({ manager, lockfile })))
    .find(({ lockfile }) => seen.has(lockfile));
  const manager = pinned?.manager ?? npmByDefault;
  const { program, testRunsTheScript } = manager;
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
    ...runners.map((runner) => directFamily(manager, runner)),
  ];
}

function directFamily(manager: PackageManager, runner: ScriptRunner): CommandFamily {
  const named = runner.scripts.length === 1 ? "script" : "scripts";
  return family(
    `${manager.runsInstalled} ${runner.program}`,
    packageManifest,
    `runs ${runner.program} directly`,
    `${named} ${runner.scripts.join(", ")}`,
  );
}

function toolchainFamilies(manifest: string): CommandFamily[] {
  return (toolchainVerbs[manifest] ?? []).map(([command, does]) => family(command, manifest, does));
}

function family(command: string, manifest: string, does: string, detail?: string): CommandFamily {
  const source = detail === undefined ? manifest : `${manifest} ${detail}`;
  return { command: `${command} *`, manifest, reason: `${source} · ${does}` };
}

function scriptBodiesOf(parsed: unknown): Record<string, string> {
  const scripts = isRecord(parsed) ? parsed.scripts : undefined;
  if (!isRecord(scripts)) return {};
  return Object.fromEntries(
    Object.entries(scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function installedPrograms(parsed: unknown): ReadonlySet<string> {
  if (!isRecord(parsed)) return new Set();
  const packages = dependencyFields.flatMap((field) => {
    const listed = parsed[field];
    return isRecord(listed) ? Object.keys(listed) : [];
  });
  return new Set(packages.flatMap(programsOfPackage));
}

function programsOfPackage(name: string): readonly string[] {
  if (name.startsWith(typingsScope)) return [];
  return programsNamedOtherwise[name] ?? [name.slice(name.lastIndexOf("/") + 1)];
}

function programsRunBy(body: string): string[] {
  return body.split(commandSeparators).flatMap((command) => {
    const program = command.trim().split(/\s+/).find(namesAProgram);
    return program === undefined ? [] : [program];
  });
}

function namesAProgram(word: string): boolean {
  return word !== "" && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
