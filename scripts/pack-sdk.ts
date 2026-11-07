import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { contractVersion, protocolVersion } from "@keywork-app/protocol";
import { repoRoot } from "./lib/repo-files.ts";

export interface DesktopManifest {
  version: string;
  dependencies: Record<string, string>;
  devDependencies: { electron: string };
}

export function sdkManifest(desktop: DesktopManifest): object {
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
    repository: { type: "git", url: "git+https://github.com/JMoak/keywork-app.git" },
  };
}

export async function packDesktopSdk(output: string): Promise<string> {
  const desktop = join(repoRoot, "packages", "desktop");
  const manifest: DesktopManifest = JSON.parse(
    await readFile(join(desktop, "package.json"), "utf8"),
  );
  const runtime = await readFile(join(desktop, "out", "main", "runtime.js"), "utf8");
  if (!runtime.includes("startDesktop"))
    throw new Error("build the desktop library before packing it");
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
      `${JSON.stringify(sdkManifest(manifest), null, 2)}\n`,
    );
    await writeFile(
      join(stage, "build.json"),
      `${JSON.stringify(
        {
          version: manifest.version,
          engine: protocolVersion,
          contract: contractVersion,
          electron: manifest.devDependencies.electron,
        },
        null,
        2,
      )}\n`,
    );
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
    const archive = join(output, filename);
    const digest = createHash("sha256")
      .update(await readFile(archive))
      .digest("hex");
    await writeFile(`${archive}.sha256`, `${digest}  ${filename}\n`);
    return archive;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { output: { type: "string" } },
  });
  console.log(await packDesktopSdk(resolve(values.output ?? join(repoRoot, "dist", "sdk"))));
}
