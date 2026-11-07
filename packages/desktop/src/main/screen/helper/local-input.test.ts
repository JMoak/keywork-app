import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { fakeSeams, manualTimers, scriptedConsent, settle, viewerContents } from "../fakes.ts";
import { screenHost } from "../host.ts";
import { bannerLine } from "../indicator.ts";
import { type HelperPort, openHelper } from "./port.ts";
import type { HelperReply } from "./protocol.ts";
import { localInputSignal, standInScript, standInSpawn } from "./stand-in.ts";

const run = promisify(execFile);
const ports: HelperPort[] = [];
let pipes = 0;

afterEach(async () => {
  await Promise.all(ports.splice(0).map((port) => port.stop()));
});

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function freshPipe(): string {
  pipes += 1;
  return `keywork-stand-in-test-${process.pid}-${pipes}`;
}

function standInOnPipe(pipe: string) {
  const replies: HelperReply[] = [];
  return {
    replies,
    open: async (): Promise<HelperPort | undefined> => {
      const port = await openHelper(standInSpawn(pipe));
      if (port === undefined) return undefined;
      ports.push(port);
      port.onReply((reply) => replies.push(reply));
      return {
        ...port,
        grant: (grant) => port.grant({ ...grant, expiresAt: Date.now() + 60_000 }),
      };
    },
  };
}

function driverSendsLocalInput(pipe: string) {
  return run(process.execPath, [standInScript, localInputSignal], {
    env: { ...process.env, KEYWORK_STAND_IN_PIPE: pipe },
  });
}

describe("simulated physical input through the stand-in, end to end", () => {
  it("pauses control when the driver signals local input, offers Resume, and logs the pause", async () => {
    const pipe = freshPipe();
    const helper = standInOnPipe(pipe);
    const time = manualTimers();
    const fake = fakeSeams({
      consent: scriptedConsent([0]).ask,
      timers: time.timers,
      clock: time.clock,
    });
    const host = screenHost({ ...fake.seams, helper: helper.open });
    host.listen();
    const start = await host.viewer.view(viewerContents, { peer: "nSparkStable1", control: true });
    const sessionId = start.ok ? start.sessionId : "";
    await until(() => fake.shown.at(-1)?.banner.mode === "control");
    const key = (seq: number) => ({ kind: "key", seq, code: "KeyA", down: true });
    expect(host.sharer.senderInput(sessionId, "ctl", key(1))).toBe("applied");
    await until(() => helper.replies.some((reply) => reply.kind === "applied"));

    await driverSendsLocalInput(pipe);
    await until(() => fake.shown.at(-1)?.banner.paused === true);

    const paused = fake.shown.at(-1);
    expect(bannerLine(paused?.banner ?? { who: "", mode: "view", shortcut: undefined })).toContain(
      "control is paused while you use this machine",
    );
    expect(paused?.resume).toBeTypeOf("function");
    expect(helper.replies).toContainEqual({ v: 1, kind: "local-input" });
    expect(helper.replies).toContainEqual({ v: 1, kind: "released", keys: ["KeyA"], buttons: [] });
    expect(fake.events.at(-1)).toMatchObject({ kind: "control", state: "paused" });
    expect(fake.rows.filter((row) => row.kind === "control").at(-1)).toMatchObject({
      state: "paused",
      reason: "physical input on this machine",
    });
    expect(host.sharer.senderInput(sessionId, "ctl", key(2))).toBe("paused");

    paused?.resume?.();
    await settle();
    expect(host.sharer.senderInput(sessionId, "ctl", key(3))).toBe("applied");
    expect(fake.rows.filter((row) => row.kind === "control").map((row) => row.state)).toEqual([
      "granted",
      "paused",
      "resumed",
    ]);
    await host.shutdown();
  });

  it("tells the driver in words when no stand-in listens on that pipe", async () => {
    await expect(driverSendsLocalInput(freshPipe())).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("no stand-in listens on"),
    });
  });
});
