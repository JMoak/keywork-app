import { describe, expect, it } from "vitest";
import { commandFamilies, isManifest, scriptsOfPackage } from "./toolchains.ts";

const commands = (manifests: string[], scripts: string[] = []): string[] =>
  commandFamilies(manifests, scripts).map((family) => family.command);

describe("command families from the manifests the server lists", () => {
  it("names the package manager by its lockfile and offers its install, run and test", () => {
    expect(commandFamilies(["package-lock.json", "package.json"], ["build", "test"])).toEqual([
      {
        command: "npm install *",
        manifest: "package-lock.json",
        reason: "package-lock.json · installs what it pins",
      },
      {
        command: "npm run *",
        manifest: "package.json",
        reason: "package.json scripts build, test · runs any of them",
      },
      {
        command: "npm test *",
        manifest: "package.json",
        reason: "package.json script test · runs it",
      },
    ]);
  });

  it("never offers bun test for a test script, since bun test is bun's own runner", () => {
    expect(commands(["bun.lock", "package.json"], ["test", "lint"])).toEqual([
      "bun install *",
      "bun run *",
    ]);
    expect(commands(["package.json", "pnpm-lock.yaml"], ["test"])).toContain("pnpm test *");
    expect(commands(["package.json", "yarn.lock"], ["test"])).toContain("yarn test *");
  });

  it("falls back to npm when package.json has no lockfile beside it, and says so", () => {
    expect(commandFamilies(["package.json"], [])).toEqual([
      {
        command: "npm install *",
        manifest: "package.json",
        reason: "package.json · installs its dependencies",
      },
    ]);
  });

  it("offers nothing for a lockfile without a package.json", () => {
    expect(commands(["bun.lock"])).toEqual([]);
  });

  it("names every script run * would cover, so a deploy script is never hidden", () => {
    const [, run] = commandFamilies(
      ["bun.lock", "package.json"],
      ["build", "test", "lint", "check", "deploy", "clean"],
    );
    expect(run?.reason).toBe(
      "package.json scripts build, test, lint, check, deploy, clean · runs any of them",
    );
  });

  it("offers each toolchain's verbs in keywork's derived grammar", () => {
    expect(commands(["Cargo.toml"])).toEqual([
      "cargo build *",
      "cargo test *",
      "cargo check *",
      "cargo fmt *",
      "cargo clippy *",
    ]);
    expect(commands(["go.mod"])).toEqual(["go build *", "go test *", "go vet *", "go fmt *"]);
    expect(commands(["deno.jsonc"])).toEqual([
      "deno test *",
      "deno fmt *",
      "deno lint *",
      "deno task *",
    ]);
    expect(commands(["uv.lock"])).toEqual(["uv run *", "uv sync *"]);
    expect(commands(["poetry.lock"])).toEqual(["poetry run *", "poetry install *"]);
  });

  it("recognises only the files that name a toolchain", () => {
    for (const name of ["package.json", "bun.lockb", "Cargo.toml", "go.mod", "uv.lock"]) {
      expect(isManifest(name), name).toBe(true);
    }
    for (const name of ["README.md", "pyproject.toml", "Makefile", "src"]) {
      expect(isManifest(name), name).toBe(false);
    }
  });
});

describe("the scripts of a package.json", () => {
  it("lists script names in the order the author wrote them", () => {
    expect(scriptsOfPackage('{"scripts":{"test":"vitest","build":"tsc"}}')).toEqual([
      "test",
      "build",
    ]);
  });

  it("reads no scripts when the field is missing or not an object", () => {
    expect(scriptsOfPackage('{"name":"x"}')).toEqual([]);
    expect(scriptsOfPackage('{"scripts":["test"]}')).toEqual([]);
  });

  it("refuses text that is not json, so the caller can say it could not read it", () => {
    expect(() => scriptsOfPackage("{ not json")).toThrow();
  });
});
