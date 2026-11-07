import { describe, expect, it } from "vitest";
import { helperLaunch, type LaunchingRuntime, launchSpawn } from "./launch.ts";
import { openHelper } from "./port.ts";
import { standInScript } from "./stand-in.ts";

const hosts: ReadonlyArray<{
  readonly os: string;
  readonly electron: LaunchingRuntime;
  readonly bun: LaunchingRuntime;
  readonly native: string;
  readonly script: string;
  readonly launchers: readonly string[];
}> = [
  {
    os: "Windows",
    electron: { execPath: "C:\\Program Files\\keywork\\keywork.exe", electron: true },
    bun: { execPath: "C:\\Users\\keeper\\.bun\\bin\\bun.exe", electron: false },
    native: "C:\\Program Files\\keywork\\keywork-input-helper.exe",
    script: "C:\\src\\keywork-app\\packages\\desktop\\src\\main\\screen\\helper\\stand-in.ts",
    launchers: ["C:\\scratch\\stand-in.cmd", "C:\\scratch\\stand-in.BAT"],
  },
  {
    os: "POSIX",
    electron: { execPath: "/opt/keywork/keywork", electron: true },
    bun: { execPath: "/home/keeper/.bun/bin/bun", electron: false },
    native: "/opt/keywork/resources/keywork-input-helper",
    script: "/home/keeper/src/keywork-app/packages/desktop/src/main/screen/helper/stand-in.mjs",
    launchers: ["/tmp/stand-in.cmd", "/tmp/stand-in.bat"],
  },
];

describe("launching the input helper named by KEYWORK_INPUT_HELPER", () => {
  for (const host of hosts) {
    describe(`on ${host.os}`, () => {
      it("spawns a native executable as itself, with no shell and no arguments", () => {
        expect(helperLaunch(host.native, host.electron)).toEqual({
          ok: true,
          launch: { command: host.native, args: [], env: {} },
        });
      });

      it("runs a script on Electron's own node, with the script as its only argument", () => {
        expect(helperLaunch(host.script, host.electron)).toEqual({
          ok: true,
          launch: {
            command: host.electron.execPath,
            args: [host.script],
            env: { ELECTRON_RUN_AS_NODE: "1" },
          },
        });
      });

      it("runs a script on bun or node as they are", () => {
        expect(helperLaunch(host.script, host.bun)).toEqual({
          ok: true,
          launch: { command: host.bun.execPath, args: [host.script], env: {} },
        });
      });

      it("refuses a .cmd or .bat launcher in words, because it would need a shell", () => {
        for (const launcher of host.launchers) {
          const plan = helperLaunch(launcher, host.electron);
          expect(plan.ok).toBe(false);
          expect(plan.ok ? "" : plan.refusal).toContain(
            `the input helper ${launcher} is a ${launcher.slice(-4).toLowerCase()} launcher`,
          );
          expect(plan.ok ? "" : plan.refusal).toContain("never starts its helper through one");
        }
      });
    });
  }

  it("starts the stand-in script on this runtime, and it says hello", async () => {
    const plan = helperLaunch(standInScript);
    if (!plan.ok) throw new Error(plan.refusal);
    const port = await openHelper(launchSpawn(plan.launch));
    expect(port?.impl).toBe("stand-in");
    expect((await port?.stop())?.exited).toBe(true);
  });
});
