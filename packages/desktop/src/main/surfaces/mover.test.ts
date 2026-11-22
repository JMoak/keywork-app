import { describe, expect, it } from "vitest";
import { type FakeClock, fakeClock } from "../companion/testing.ts";
import type { ScreenPoint } from "./channels.ts";
import { type Glidable, type Glider, glider } from "./glide.ts";
import { type PanesHelper, panesHelper } from "./helper.ts";
import { helpedGlider, helperPatienceMs } from "./mover.ts";
import { glideFrameMs } from "./pacer.ts";
import { type FakeHelperPipes, fakeHelperPipes, helperParentPid, readyHelper } from "./testing.ts";

interface Body extends Glidable {
  path: ScreenPoint[];
  carriedTo(point: ScreenPoint): void;
}

function bodyAt(start: ScreenPoint): Body {
  const path: ScreenPoint[] = [];
  let at = start;
  return {
    path,
    position: () => at,
    moveTo: (point) => {
      at = point;
      path.push(point);
    },
    carriedTo: (point) => {
      at = point;
    },
  };
}

interface Bench {
  clock: FakeClock;
  pipes: FakeHelperPipes;
  helper: PanesHelper;
  glides: Glider<string>;
  letGo: string[];
}

function bench(options: { greeted?: boolean; pixelsPerPoint?: number } = {}): Bench {
  const clock = fakeClock();
  const pipes = fakeHelperPipes();
  const helper =
    options.greeted === false ? panesHelper(pipes, helperParentPid) : readyHelper(pipes);
  const letGo: string[] = [];
  const scale = options.pixelsPerPoint ?? 2;
  const unaided = glider<string>({
    now: clock.now,
    everyFrame: (tick) => {
      const timer = clock.setInterval(tick, glideFrameMs);
      return () => clock.clearInterval(timer);
    },
  });
  const glides = helpedGlider<string>({
    helper,
    unaided,
    clock,
    windowOf: (key) => `${key}0`,
    pixelsOf: (point) => ({ x: Math.round(point.x * scale), y: Math.round(point.y * scale) }),
    letGo: (key) => void letGo.push(key),
  });
  return { clock, pipes, helper, glides, letGo };
}

function settledFlag(run: Promise<void>): { settled: boolean } {
  const flag = { settled: false };
  void run.then(() => {
    flag.settled = true;
  });
  return flag;
}

async function aTurn(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const origin = { x: 0, y: 0 };
const far = { x: 1000, y: -400 };
const partWay = { x: 400, y: -160 };

describe("choosing who moves the panes", () => {
  it("moves them itself until the helper has said it is ready", () => {
    const { clock, pipes, glides } = bench({ greeted: false });
    const body = bodyAt(origin);
    void glides.run([{ key: "a", body, to: far }], 240);
    clock.advance(300);
    expect(pipes.written).toEqual([]);
    expect(body.path.length).toBeGreaterThan(10);
    expect(body.position()).toEqual(far);
  });

  it("hands a glide to a helper in use as one command, and moves nothing itself", () => {
    const { clock, pipes, glides } = bench();
    const first = bodyAt(origin);
    const second = bodyAt({ x: 40, y: 40 });
    void glides.run(
      [
        { key: "a", body: first, to: far },
        { key: "b", body: second, to: origin },
      ],
      240,
    );
    clock.advance(200);
    expect(pipes.written).toEqual(["glide 1 240 a0@0,0>2000,-800 b0@80,80>0,0"]);
    expect([first.path, second.path]).toEqual([[], []]);
    expect(glides.gliding("a")).toBe(true);
  });

  it("moves them itself for the rest of the session once the helper is retired", async () => {
    const { clock, pipes, helper, glides } = bench();
    helper.retire("the test says so");
    const body = bodyAt(origin);
    const run = settledFlag(glides.run([{ key: "a", body, to: far }], 240));
    clock.advance(300);
    await aTurn();
    expect(pipes.written).toEqual([]);
    expect(body.position()).toEqual(far);
    expect(run.settled).toBe(true);
  });
});

describe("a glide through the helper", () => {
  it("names where the app sees each window and where it should go, in the display's pixels", () => {
    const fractional = bench({ pixelsPerPoint: 1.5 });
    void fractional.glides.run([{ key: "a", body: bodyAt({ x: 101, y: 7 }), to: far }], 180);
    expect(fractional.pipes.written).toEqual(["glide 1 180 a0@152,11>1500,-600"]);
  });

  it("answers once the helper says the glide has settled, and not before", async () => {
    const { clock, pipes, glides } = bench();
    const body = bodyAt(origin);
    const run = settledFlag(glides.run([{ key: "a", body, to: far }], 240));
    clock.advance(240);
    await aTurn();
    expect(run.settled).toBe(false);
    body.carriedTo(far);
    pipes.says("settled 1");
    await aTurn();
    expect(run.settled).toBe(true);
    expect(body.path).toEqual([]);
    expect(glides.gliding("a")).toBe(false);
  });

  it("puts a pane on its place itself when the helper left it beside it", async () => {
    const { pipes, glides } = bench();
    const body = bodyAt(origin);
    const run = settledFlag(glides.run([{ key: "a", body, to: far }], 240));
    body.carriedTo({ x: far.x - 3, y: far.y });
    pipes.says("settled 1");
    await aTurn();
    expect(body.path).toEqual([far]);
    expect(run.settled).toBe(true);
  });

  it("asks the helper to jump when it is given no time", () => {
    const { pipes, glides } = bench();
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 0);
    void glides.run([{ key: "b", body: bodyAt(origin), to: far }], Number.NaN);
    void glides.run([{ key: "c", body: bodyAt(origin), to: far }], 180.4);
    expect(pipes.written).toEqual([
      "glide 1 0 a0@0,0>2000,-800",
      "glide 2 0 b0@0,0>2000,-800",
      "glide 3 180 c0@0,0>2000,-800",
    ]);
  });

  it("gives a pane to its newest glide without letting it go in between, and answers the older one", async () => {
    const { pipes, glides } = bench();
    const body = bodyAt(origin);
    const first = settledFlag(glides.run([{ key: "a", body, to: far }], 240));
    const second = settledFlag(glides.run([{ key: "a", body, to: origin }], 240));
    await aTurn();
    expect(pipes.written.map((line) => line.split(" ")[0])).toEqual(["glide", "glide"]);
    expect(first.settled).toBe(true);
    expect(second.settled).toBe(false);
    pipes.says("settled 1");
    pipes.says("settled 2");
    await aTurn();
    expect(second.settled).toBe(true);
  });

  it("names a pane once when a request names it twice, with the later place", () => {
    const { pipes, glides } = bench();
    const body = bodyAt(origin);
    void glides.run(
      [
        { key: "a", body, to: partWay },
        { key: "a", body, to: far },
      ],
      100,
    );
    expect(pipes.written).toEqual(["glide 1 100 a0@0,0>2000,-800"]);
  });

  it("tells the helper to release a pane taken out of its glide, and carries the others on", async () => {
    const { pipes, glides } = bench();
    const run = settledFlag(
      glides.run(
        [
          { key: "a", body: bodyAt(origin), to: far },
          { key: "b", body: bodyAt(origin), to: far },
        ],
        240,
      ),
    );
    glides.drop("a");
    await aTurn();
    expect(pipes.written.slice(1)).toEqual(["release a0", "stats"]);
    expect(glides.gliding("b")).toBe(true);
    expect(run.settled).toBe(false);
    glides.drop("b");
    await aTurn();
    expect(run.settled).toBe(true);
  });

  it("calls a released pane gliding until the helper has answered, then says it is let go", () => {
    const { pipes, glides, letGo } = bench();
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 240);
    void glides.run([{ key: "b", body: bodyAt(origin), to: far }], 240);
    glides.drop("a");
    glides.drop("b");
    expect([glides.gliding("a"), glides.gliding("b")]).toEqual([true, true]);
    pipes.says("stats frames=3 missed=0 mean_us=80 worst_us=90");
    expect([glides.gliding("a"), glides.gliding("b")]).toEqual([false, true]);
    expect(letGo).toEqual(["a"]);
    pipes.says("stats frames=0 missed=0 mean_us=0 worst_us=0");
    expect(glides.gliding("b")).toBe(false);
    expect(letGo).toEqual(["a", "b"]);
  });

  it("moves a pane itself while the helper has yet to let it go", () => {
    const { clock, pipes, glides } = bench();
    const body = bodyAt(origin);
    void glides.run([{ key: "a", body, to: far }], 240);
    glides.drop("a");
    void glides.run([{ key: "a", body, to: partWay }], 0);
    expect(body.path).toEqual([partWay]);
    void glides.run([{ key: "a", body, to: far }], 240);
    clock.advance(300);
    expect(body.position()).toEqual(far);
    expect(pipes.written.filter((line) => line.startsWith("glide "))).toHaveLength(1);
  });

  it("releases every pane and answers every glide when it is stopped, and leaves no timer", async () => {
    const { clock, pipes, helper, glides } = bench();
    const run = settledFlag(
      glides.run(
        [
          { key: "a", body: bodyAt(origin), to: far },
          { key: "c", body: bodyAt(origin), to: far },
        ],
        240,
      ),
    );
    glides.drop("c");
    glides.stop();
    await aTurn();
    expect(pipes.written.slice(1)).toEqual(["release c0", "stats", "release a0"]);
    expect(run.settled).toBe(true);
    expect([glides.gliding("a"), glides.gliding("c")]).toEqual([false, false]);
    clock.advance(60_000);
    expect(helper.inUse()).toBe(true);
  });
});

describe("falling back to moving the panes itself", () => {
  const failures: ReadonlyArray<[string, (bench: Bench) => void]> = [
    ["exits", ({ pipes }) => pipes.ends()],
    [
      "will not take a line",
      ({ pipes, glides }) => {
        pipes.jammed = true;
        glides.drop("bystander");
        void glides.run([{ key: "other", body: bodyAt(origin), to: origin }], 0);
      },
    ],
    ["refuses a window it is gliding", ({ pipes }) => pipes.says("refused a0 not-parent-window")],
    ["cannot read a command", ({ pipes }) => pipes.says("refused - too-many-windows")],
    ["stops answering", ({ clock }) => clock.advance(240 + 2 * helperPatienceMs)],
  ];

  for (const [how, fail] of failures) {
    it(`carries a glide on from where each pane stands when the helper ${how}`, async () => {
      const made = bench();
      const { clock, pipes, helper, glides } = made;
      const body = bodyAt(origin);
      const run = settledFlag(glides.run([{ key: "a", body, to: far }], 240));
      clock.advance(60);
      body.carriedTo(partWay);
      fail(made);
      expect(helper.inUse()).toBe(false);
      expect(pipes.killed).toBe(true);
      clock.advance(400);
      await aTurn();
      expect(run.settled).toBe(true);
      expect(body.position()).toEqual(far);
      for (const point of body.path) {
        expect(point.x).toBeGreaterThanOrEqual(partWay.x);
        expect(point.x).toBeLessThanOrEqual(far.x);
      }

      const next = bodyAt(origin);
      const written = pipes.written.length;
      void glides.run([{ key: "b", body: next, to: far }], 240);
      clock.advance(300);
      expect(next.position()).toEqual(far);
      expect(pipes.written).toHaveLength(written);
    });
  }

  it("keeps the time a glide had left, and jumps one that was already due", async () => {
    const { clock, pipes, glides } = bench();
    const early = bodyAt(origin);
    const late = bodyAt(origin);
    void glides.run([{ key: "early", body: early, to: far }], 1_000);
    void glides.run([{ key: "late", body: late, to: far }], 80);
    clock.advance(100);
    pipes.ends();
    expect(late.path).toEqual([far]);
    clock.advance(600);
    expect(early.position()).not.toEqual(far);
    clock.advance(400);
    expect(early.position()).toEqual(far);
  });

  it("keeps the helper when it refuses a window that is in no glide", () => {
    const { pipes, helper, glides } = bench();
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 240);
    glides.drop("a");
    pipes.says("refused a0 no-such-window");
    pipes.says("refused ffff not-parent-window");
    expect(helper.inUse()).toBe(true);
  });

  it("believes the helper has stopped answering only after a second wait past the glide's end", () => {
    const { clock, helper, glides } = bench();
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 240);
    clock.advance(240 + helperPatienceMs);
    expect(helper.inUse()).toBe(true);
    clock.advance(helperPatienceMs - 1);
    expect(helper.inUse()).toBe(true);
    clock.advance(1);
    expect(helper.inUse()).toBe(false);
  });

  it("does not wait on a glide the helper settled in time", () => {
    const { clock, pipes, helper, glides } = bench();
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 240);
    clock.advance(250);
    pipes.says("settled 1");
    clock.advance(60_000);
    expect(helper.inUse()).toBe(true);
  });

  it("retires a helper that never says it has let a pane go, and lets the pane go itself", () => {
    const { clock, helper, glides, letGo } = bench();
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 240);
    glides.drop("a");
    clock.advance(2 * helperPatienceMs);
    expect(helper.inUse()).toBe(false);
    expect(letGo).toEqual(["a"]);
    expect(glides.gliding("a")).toBe(false);
  });
});
