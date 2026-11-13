import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { childLaunch, spawnChild } from "./child.ts";

describe("launching a child", () => {
  it("runs an executable directly with its arguments untouched", () => {
    expect(childLaunch("C:\\kw\\keywork.exe", ["serve", "--port", "1"], "win32")).toEqual({
      file: "C:\\kw\\keywork.exe",
      args: ["serve", "--port", "1"],
      verbatim: false,
    });
    expect(childLaunch("/usr/bin/keywork.cmd", ["serve"], "linux").verbatim).toBe(false);
  });

  it("runs a Windows batch shim through cmd with one escaped line and no shell option", () => {
    const launch = childLaunch("C:\\kw\\keywork.cmd", ["serve", "a b"], "win32", "C:\\cmd.exe");
    expect(launch.file).toBe("C:\\cmd.exe");
    expect(launch.args).toEqual([
      "/d",
      "/s",
      "/c",
      '"C:\\kw\\keywork.cmd ^^^"serve^^^" ^^^"a^^^ b^^^""',
    ]);
    expect(launch.verbatim).toBe(true);
  });
});

describe.runIf(process.platform === "win32")("a batch shim on Windows", () => {
  let folder: string;

  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), "keywork child (shim) & co "));
    await writeFile(join(folder, "args.js"), "console.log(JSON.stringify(process.argv.slice(2)));");
    await writeFile(join(folder, "print args.cmd"), `@"${process.execPath}" "%~dp0args.js" %*\r\n`);
  });

  afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("receives every argument exactly, however cmd would otherwise read it", async () => {
    const tricky = [
      "serve",
      "with space",
      "amp&ersand",
      "pipe|less<more>",
      'quote"inside',
      "trailing\\",
      "100%",
      "%PATH%",
      "caret^",
      "(paren)",
      "semi;comma,equals=",
      "bang!",
      "",
    ];
    const child = spawnChild(join(folder, "print args.cmd"), tricky, folder);
    let output = "";
    for await (const chunk of child.stdout) output += chunk;
    expect(await child.exited).toBe(0);
    expect(JSON.parse(output.trim())).toEqual(tricky);
  });
});
