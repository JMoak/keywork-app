import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { frameColour, type HelperWatcher, helperPipes, panesHelper } from "./helper.ts";
import { fakeHelperPipes, helperParentPid, readyHelper } from "./testing.ts";

function watching(): HelperWatcher & { heard: string[] } {
  const heard: string[] = [];
  return {
    heard,
    settled: (glide) => void heard.push(`settled ${glide}`),
    refused: (window, reason) => void heard.push(`refused ${window} ${reason}`),
    synced: () => void heard.push("synced"),
    retired: () => void heard.push("retired"),
  };
}

const journey = { window: "1a2b", at: { x: 160, y: 160 }, to: { x: 2080, y: 640 } };

describe("the helper's greeting", () => {
  it("puts it in use once it says ready in the protocol the host speaks, for the host's own process", () => {
    const pipes = fakeHelperPipes();
    const helper = panesHelper(pipes, helperParentPid);
    expect(helper.inUse()).toBe(false);
    helper.release("1a2b");
    expect(pipes.written).toEqual([]);
    pipes.says(`ready 1 ${helperParentPid}`);
    expect(helper.inUse()).toBe(true);
    expect(pipes.killed).toBe(false);
  });

  it("retires a helper that speaks another protocol, serves another process, or says anything else first", () => {
    for (const greeting of ["ready 2 4242", "ready 1 999", "settled 1", "ready", "hello"]) {
      const pipes = fakeHelperPipes();
      const said: string[] = [];
      const helper = panesHelper(pipes, helperParentPid, (news) => void said.push(news));
      pipes.says(greeting);
      expect(helper.inUse()).toBe(false);
      expect(pipes.killed).toBe(true);
      expect(said).toEqual([
        `the panes mover is retired for this session: it greeted with "${greeting}"`,
      ]);
      pipes.says(`ready 1 ${helperParentPid}`);
      expect(helper.inUse()).toBe(false);
    }
  });
});

describe("what the host tells the helper", () => {
  it("is one line a command: a glide with two points a window, a release, a frame colour, a sync", () => {
    const pipes = fakeHelperPipes();
    const helper = readyHelper(pipes);
    helper.glide(7, 180, [
      journey,
      { window: "1a40", at: { x: -8, y: 0 }, to: { x: -1520, y: -4 } },
    ]);
    helper.release("1a2b");
    helper.frame("1a2b", "ff8800");
    helper.frame("1a2b", undefined);
    helper.sync();
    expect(pipes.written).toEqual([
      "glide 7 180 1a2b@160,160>2080,640 1a40@-8,0>-1520,-4",
      "release 1a2b",
      "border 1a2b ff8800",
      "border 1a2b clear",
      "stats",
    ]);
  });

  it("is in whole pixels, whatever a scaled display made of a point", () => {
    const pipes = fakeHelperPipes();
    readyHelper(pipes).glide(1, 0, [
      { window: "f", at: { x: 151.5, y: -0.4 }, to: { x: 99.49, y: 7 } },
    ]);
    expect(pipes.written).toEqual(["glide 1 0 f@152,0>99,7"]);
  });
});

describe("what the helper tells the host", () => {
  it("is a glide settled, a window refused, or a sync answered", () => {
    const pipes = fakeHelperPipes();
    const watcher = watching();
    readyHelper(pipes).watch(watcher);
    pipes.says("settled 7");
    pipes.says("refused 1a2b not-parent-window");
    pipes.says("stats frames=90 missed=1 mean_us=85 worst_us=240\r");
    pipes.says("");
    pipes.says("something a later helper might say");
    expect(watcher.heard).toEqual(["settled 7", "refused 1a2b not-parent-window", "synced"]);
  });

  it("does not count a frame the desktop would not colour as a window refused", () => {
    const pipes = fakeHelperPipes();
    const watcher = watching();
    const helper = readyHelper(pipes);
    helper.watch(watcher);
    pipes.says("refused 1a2b border-failed:80070057");
    expect(watcher.heard).toEqual([]);
    expect(helper.inUse()).toBe(true);
  });
});

describe("a helper that fails", () => {
  it("is retired once, killed, and told nothing more when its process ends", () => {
    const pipes = fakeHelperPipes();
    const said: string[] = [];
    const watcher = watching();
    const helper = readyHelper(pipes, said);
    helper.watch(watcher);
    pipes.ends();
    pipes.ends();
    helper.glide(1, 100, [journey]);
    pipes.says("settled 1");
    expect(helper.inUse()).toBe(false);
    expect(pipes.killed).toBe(true);
    expect(pipes.written).toEqual([]);
    expect(watcher.heard).toEqual(["retired"]);
    expect(said).toEqual(["the panes mover is retired for this session: its process ended"]);
  });

  it("is retired when its pipe will not take a line", () => {
    const pipes = fakeHelperPipes();
    const watcher = watching();
    const helper = readyHelper(pipes);
    helper.watch(watcher);
    pipes.jammed = true;
    expect(() => helper.glide(1, 100, [journey])).not.toThrow();
    expect(helper.inUse()).toBe(false);
    expect(pipes.killed).toBe(true);
    expect(watcher.heard).toEqual(["retired"]);
  });

  it("is retired when it could not read a line the host wrote", () => {
    const pipes = fakeHelperPipes();
    const said: string[] = [];
    const helper = readyHelper(pipes, said);
    pipes.says("refused - bad-point");
    expect(helper.inUse()).toBe(false);
    expect(said).toEqual([
      "the panes mover is retired for this session: it could not read a command (bad-point)",
    ]);
  });

  it("is retired by the host for a reason of the host's own, and closed quietly when the app is done", () => {
    const retiredPipes = fakeHelperPipes();
    const said: string[] = [];
    const watcher = watching();
    const retired = readyHelper(retiredPipes, said);
    retired.watch(watcher);
    retired.retire("it stopped answering");
    retired.retire("it stopped answering");
    expect(said).toEqual(["the panes mover is retired for this session: it stopped answering"]);
    expect(watcher.heard).toEqual(["retired"]);

    const closedPipes = fakeHelperPipes();
    const quiet = watching();
    const closed = readyHelper(closedPipes, said);
    closed.watch(quiet);
    closed.close();
    closedPipes.ends();
    expect(closed.inUse()).toBe(false);
    expect(closedPipes.killed).toBe(true);
    expect(quiet.heard).toEqual([]);
    expect(said).toHaveLength(1);
  });
});

describe("a frame colour", () => {
  it("is six hex digits as the helper reads them, with or without the hash", () => {
    expect(frameColour("#FF8800")).toBe("ff8800");
    expect(frameColour("1b1d22")).toBe("1b1d22");
  });

  it("is nothing when the page named no colour or one the helper cannot read", () => {
    for (const none of [undefined, "", "#f80", "#ff8800cc", "orange", "rgb(1,2,3)", 0xff8800]) {
      expect(frameColour(none)).toBeUndefined();
    }
  });
});

describe("the helper's process", () => {
  it("that cannot be started is reported closed, and takes writes and a kill without throwing", async () => {
    const pipes = helperPipes(join(import.meta.dirname, "no-such-panes-mover.exe"));
    const closed = new Promise<void>((resolve) => pipes.onClosed(resolve));
    expect(() => pipes.write("stats")).not.toThrow();
    await closed;
    expect(() => pipes.write("stats")).not.toThrow();
    expect(() => pipes.kill()).not.toThrow();
  });

  it("that ends with lines still being written to it is reported closed, with no error left unheard", async () => {
    const pipes = helperPipes(process.execPath);
    const closed = new Promise<void>((resolve) => pipes.onClosed(resolve));
    const writeMany = (): void => {
      for (let line = 0; line < 200; line += 1) pipes.write("stats");
    };
    writeMany();
    pipes.kill();
    writeMany();
    await closed;
    writeMany();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(() => pipes.kill()).not.toThrow();
  });
});
