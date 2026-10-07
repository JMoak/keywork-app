import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PtyExit } from "../shared/channels.ts";
import {
  batchLimitBytes,
  chunkBatcher,
  commandLine,
  defaultShell,
  findOnPath,
  idMinter,
  launchFor,
  type PtyLaunch,
  type PtyProcess,
  type PtySeams,
  ptyHost,
  scrubEnv,
  windowsTreeKill,
} from "./pty.ts";

const windowsPath =
  "C:\\Program Files\\PowerShell\\7;C:\\Windows\\System32\\WindowsPowerShell\\v1.0";

describe("the default shell", () => {
  it("prefers pwsh, then Windows PowerShell, then COMSPEC on Windows", () => {
    const env = { PATH: windowsPath, COMSPEC: "C:\\Windows\\system32\\cmd.exe" };
    const only = (name: string) => (path: string) => path.endsWith(name);
    expect(defaultShell("win32", env, only("7\\pwsh.exe"))).toBe(
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    );
    expect(defaultShell("win32", env, only("v1.0\\powershell.exe"))).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(defaultShell("win32", env, () => false)).toBe("C:\\Windows\\system32\\cmd.exe");
    expect(defaultShell("win32", { PATH: "" }, () => false)).toBe("cmd.exe");
  });

  it("uses $SHELL elsewhere and falls back to /bin/sh", () => {
    expect(defaultShell("linux", { SHELL: "/usr/bin/fish" }, () => true)).toBe("/usr/bin/fish");
    expect(defaultShell("darwin", {}, () => true)).toBe("/bin/sh");
  });

  it("walks PATH entries in order and skips empty ones", () => {
    const seen: string[] = [];
    const found = findOnPath("pwsh.exe", { PATH: `;${windowsPath};` }, (path) => {
      seen.push(path);
      return false;
    });
    expect(found).toBeUndefined();
    expect(seen).toHaveLength(2);
  });
});

describe("the command line", () => {
  it("runs .cmd shims through the shell on Windows and anything else directly", () => {
    const env = { COMSPEC: "cmd.exe" };
    expect(commandLine("C:\\kw\\keywork.cmd", ["attach"], "win32", env)).toEqual({
      file: "cmd.exe",
      args: ["/d", "/c", "C:\\kw\\keywork.cmd", "attach"],
    });
    expect(commandLine("C:\\kw\\keywork.exe", ["attach"], "win32", env)).toEqual({
      file: "C:\\kw\\keywork.exe",
      args: ["attach"],
    });
    expect(commandLine("/usr/bin/keywork", ["attach"], "linux", env)).toEqual({
      file: "/usr/bin/keywork",
      args: ["attach"],
    });
  });
});

describe("env scrubbing", () => {
  it("drops keywork token variables and any value carrying a held secret", () => {
    const clean = scrubEnv(
      {
        PATH: "/bin",
        KEYWORK_TOKEN: "abc",
        KEYWORK_SERVER_TOKEN: "abc",
        keywork_api_secret: "x",
        SOMETHING: "Bearer secret-ticket-token",
        EMPTY: undefined,
        HOME: "/home/j",
      },
      ["secret-ticket-token", ""],
      "linux",
    );
    expect(Object.keys(clean).sort()).toEqual(
      ["COLORTERM", "HOME", "PATH", "TERM", "TERM_PROGRAM"].sort(),
    );
    expect(clean.TERM).toBe("xterm-256color");
  });

  it("leaves TERM alone on Windows, where ConPTY owns the terminal type", () => {
    const clean = scrubEnv({ PATH: "C:\\" }, [], "win32");
    expect(clean.TERM).toBeUndefined();
    expect(clean.TERM_PROGRAM).toBe("keywork-app");
  });
});

describe("chunk batching", () => {
  it("joins pushes into one frame and flushes early at the byte limit", () => {
    const emitted: string[] = [];
    const frames: Array<() => void> = [];
    const batch = chunkBatcher((text) => emitted.push(text), {
      limit: 8,
      schedule: (flush) => frames.push(flush),
    });
    batch.push("ab");
    batch.push("cd");
    expect(emitted).toEqual([]);
    expect(frames).toHaveLength(1);
    frames[0]?.();
    expect(emitted).toEqual(["abcd"]);
    batch.push("12345");
    batch.push("678");
    expect(emitted).toEqual(["abcd", "12345678"]);
    frames.at(-1)?.();
    expect(emitted).toEqual(["abcd", "12345678"]);
  });

  it("keeps order across a limit flush followed by a frame flush", () => {
    const emitted: string[] = [];
    let frame: (() => void) | undefined;
    const batch = chunkBatcher((text) => emitted.push(text), {
      limit: 4,
      schedule: (flush) => {
        frame = flush;
      },
    });
    batch.push("1234");
    batch.push("5");
    frame?.();
    expect(emitted).toEqual(["1234", "5"]);
    expect(batchLimitBytes).toBe(4096);
  });
});

describe("ids and tree kill", () => {
  it("mints increasing ids from one", () => {
    const ids = idMinter();
    expect([ids.next(), ids.next(), ids.next()]).toEqual([1, 2, 3]);
  });

  it("kills the whole tree with taskkill on Windows", () => {
    const run = vi.fn();
    windowsTreeKill(4242, run);
    expect(run).toHaveBeenCalledWith("taskkill", ["/pid", "4242", "/T", "/F"]);
  });
});

describe("the pty host", () => {
  function fakeSeams(platform: NodeJS.Platform = "win32") {
    const launches: PtyLaunch[] = [];
    const processes: FakeProcess[] = [];
    const frames: Array<() => void> = [];
    const killed: number[] = [];
    const seams: PtySeams = {
      spawn: (launch) => {
        launches.push(launch);
        const process = fakeProcess(100 + launches.length);
        processes.push(process);
        return process;
      },
      platform,
      env: { PATH: "C:\\pwsh", KEYWORK_TOKEN: "t", COMSPEC: "cmd.exe" },
      exists: (path) => path.endsWith("pwsh.exe"),
      keyworkBinary: async () => "C:\\kw\\keywork.cmd",
      secretsFor: () => ["ticket-token"],
      treeKill: (pid) => killed.push(pid),
      schedule: (flush) => frames.push(flush),
    };
    return { seams, launches, processes, frames, killed };
  }

  const silent = { data: () => {}, exit: () => {} };

  it("spawns the shell in the workspace with a scrubbed env and streams batched bytes", async () => {
    const fake = fakeSeams();
    const host = ptyHost(fake.seams);
    const data: Array<[number, string]> = [];
    const exits: PtyExit[] = [];
    const opened = await host.open(
      { workspace: "C:\\work", program: "shell", args: [], cols: 80, rows: 24 },
      7,
      {
        data: (id, bytes) => data.push([id, new TextDecoder().decode(bytes)]),
        exit: (exit) => exits.push(exit),
      },
    );
    expect(opened).toEqual({ id: 1, title: "pwsh" });
    expect(fake.launches[0]).toMatchObject({
      file: "C:\\pwsh\\pwsh.exe",
      cwd: "C:\\work",
      cols: 80,
      rows: 24,
    });
    expect(fake.launches[0]?.env.KEYWORK_TOKEN).toBeUndefined();
    const process = fake.processes[0] as FakeProcess;
    process.emit("PS C:\\work> ");
    process.emit("dir\r\n");
    expect(data).toEqual([]);
    fake.frames[0]?.();
    expect(data).toEqual([[1, "PS C:\\work> dir\r\n"]]);
    host.write(1, "dir\r");
    host.resize(1, 120, 40);
    host.resize(1, 0, 40);
    expect(process.written).toEqual(["dir\r"]);
    expect(process.sizes).toEqual([[120, 40]]);
    process.exit(0);
    expect(exits).toEqual([{ id: 1, exitCode: 0, signal: undefined }]);
    host.write(1, "late");
    expect(process.written).toEqual(["dir\r"]);
  });

  it("bridges to the resolved keywork binary through the shell for .cmd shims", async () => {
    const fake = fakeSeams();
    const host = ptyHost(fake.seams);
    const opened = await host.open(
      { workspace: "C:\\work", program: "keywork", args: ["attach"], cols: 80, rows: 24 },
      7,
      silent,
    );
    expect(opened.title).toBe("keywork attach");
    expect(fake.launches[0]).toMatchObject({
      file: "cmd.exe",
      args: ["/d", "/c", "C:\\kw\\keywork.cmd", "attach"],
    });
  });

  it("kills a window's ptys as a tree on Windows and everything on quit", async () => {
    const fake = fakeSeams();
    const host = ptyHost(fake.seams);
    const request = {
      workspace: "C:\\work",
      program: "shell" as const,
      args: [],
      cols: 1,
      rows: 1,
    };
    await host.open(request, 1, silent);
    await host.open(request, 2, silent);
    await host.open(request, 1, silent);
    host.closeOwned(1);
    expect(fake.killed).toEqual([101, 103]);
    expect(fake.processes.map((process) => process.alive)).toEqual([false, true, false]);
    host.closeAll();
    expect(fake.killed).toEqual([101, 103, 102]);
    host.close(2);
    expect(fake.killed).toHaveLength(3);
  });

  it("skips the tree kill elsewhere, where the pty's hangup reaches the children", async () => {
    const fake = fakeSeams("linux");
    const host = ptyHost(fake.seams);
    await host.open({ workspace: "/w", program: "shell", args: [], cols: 1, rows: 1 }, 1, silent);
    host.close(1);
    expect(fake.killed).toEqual([]);
    expect(fake.processes[0]?.alive).toBe(false);
  });

  it("names the launch after the shell binary", async () => {
    const fake = fakeSeams("linux");
    fake.seams.env = { SHELL: "/usr/bin/zsh" };
    const launch = await launchFor(
      { workspace: "/w", program: "shell", args: [], cols: 1, rows: 1 },
      fake.seams,
    );
    expect(launch.file).toBe("/usr/bin/zsh");
  });
});

describe("the bundling exception", () => {
  const desktop = join(import.meta.dirname, "..", "..");

  it("externalizes node-pty from main and ships it as a production dependency", async () => {
    const config = await readFile(join(desktop, "electron.vite.config.ts"), "utf8");
    const manifest = JSON.parse(await readFile(join(desktop, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(config).toContain('nativeModules = ["node-pty"]');
    expect(config).toContain("external: nativeModules");
    expect(manifest.dependencies["node-pty"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("asks electron-builder to rebuild and unpack it", async () => {
    const builder = await readFile(join(desktop, "electron-builder.yml"), "utf8");
    expect(builder).toContain("npmRebuild: true");
    expect(builder).toContain("node_modules/node-pty/**");
  });
});

interface FakeProcess extends PtyProcess {
  written: string[];
  sizes: Array<[number, number]>;
  alive: boolean;
  emit(text: string): void;
  exit(code: number): void;
}

function fakeProcess(pid: number): FakeProcess {
  let dataListener: (data: string) => void = () => {};
  let exitListener: (exit: { exitCode: number }) => void = () => {};
  const process: FakeProcess = {
    pid,
    written: [],
    sizes: [],
    alive: true,
    write: (data) => process.written.push(data),
    resize: (cols, rows) => process.sizes.push([cols, rows]),
    kill: () => {
      process.alive = false;
    },
    onData: (listener) => {
      dataListener = listener;
    },
    onExit: (listener) => {
      exitListener = listener;
    },
    emit: (text) => dataListener(text),
    exit: (code) => exitListener({ exitCode: code }),
  };
  return process;
}
