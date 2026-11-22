import { describe, expect, it } from "vitest";
import { type FakeClock, fakeClock } from "../companion/testing.ts";
import type { ScreenPoint, ScreenRect } from "./channels.ts";
import { easedToRest, type Glidable, type GlideClock, glider, type Shapeable } from "./glide.ts";
import { glideFrameMs } from "./pacer.ts";

interface Body extends Glidable {
  path: ScreenPoint[];
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
  };
}

function framesOf(clock: FakeClock, said: string[] = []): GlideClock {
  return {
    now: clock.now,
    everyFrame: (tick) => {
      said.push("start");
      const timer = clock.setInterval(tick, glideFrameMs);
      return () => {
        said.push("stop");
        clock.clearInterval(timer);
      };
    },
  };
}

function settledFlag(run: Promise<void>): { settled: boolean } {
  const flag = { settled: false };
  void run.then(() => {
    flag.settled = true;
  });
  return flag;
}

const origin = { x: 0, y: 0 };
const far = { x: 1000, y: -400 };

describe("easedToRest", () => {
  it("runs from nothing to all of the way and never past it", () => {
    expect(easedToRest(0)).toBe(0);
    expect(easedToRest(1)).toBe(1);
    expect(easedToRest(-3)).toBe(0);
    expect(easedToRest(7)).toBe(1);
    let last = 0;
    for (let step = 1; step <= 200; step += 1) {
      const eased = easedToRest(step / 200);
      expect(eased).toBeGreaterThanOrEqual(last);
      expect(eased).toBeLessThanOrEqual(1);
      last = eased;
    }
  });
});

describe("a glide", () => {
  it("moves each body from where it stands to its place and settles there exactly", async () => {
    const clock = fakeClock();
    const body = bodyAt(origin);
    const run = settledFlag(
      glider<string>(framesOf(clock)).run([{ key: "a", body, to: far }], 240),
    );
    clock.advance(239);
    await Promise.resolve();
    expect(run.settled).toBe(false);
    clock.advance(glideFrameMs);
    await Promise.resolve();
    expect(run.settled).toBe(true);
    expect(body.path.at(-1)).toEqual(far);
  });

  it("never overshoots its place on the way", () => {
    const clock = fakeClock();
    const body = bodyAt(origin);
    void glider<string>(framesOf(clock)).run([{ key: "a", body, to: far }], 240);
    clock.advance(400);
    expect(body.path.length).toBeGreaterThan(10);
    for (const point of body.path) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(far.x);
      expect(point.y).toBeLessThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(far.y);
    }
    const xs = body.path.map((point) => point.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("drives every glide from one ticker and stops it when the last one settles", () => {
    const clock = fakeClock();
    const ticker: string[] = [];
    const glides = glider<string>(framesOf(clock, ticker));
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 200);
    clock.advance(100);
    void glides.run([{ key: "b", body: bodyAt(origin), to: far }], 200);
    expect(ticker).toEqual(["start"]);
    clock.advance(150);
    expect(ticker).toEqual(["start"]);
    clock.advance(100);
    expect(ticker).toEqual(["start", "stop"]);
    void glides.run([{ key: "a", body: bodyAt(origin), to: far }], 200);
    expect(ticker).toEqual(["start", "stop", "start"]);
  });

  it("jumps at once when it is given no time", async () => {
    const clock = fakeClock();
    const body = bodyAt(origin);
    const glides = glider<string>(framesOf(clock));
    await glides.run([{ key: "a", body, to: far }], 0);
    expect(body.path).toEqual([far]);
    expect(glides.gliding("a")).toBe(false);
    const again = bodyAt(origin);
    await glides.run([{ key: "a", body: again, to: far }], Number.NaN);
    expect(again.path).toEqual([far]);
  });

  it("gives a body to its newest glide, which starts from where the old one left it", async () => {
    const clock = fakeClock();
    const glides = glider<string>(framesOf(clock));
    const body = bodyAt(origin);
    const first = settledFlag(glides.run([{ key: "a", body, to: far }], 240));
    clock.advance(40);
    const turnedAt = body.position();
    expect(turnedAt.x).toBeGreaterThan(0);
    const second = settledFlag(glides.run([{ key: "a", body, to: origin }], 240));
    await Promise.resolve();
    expect(first.settled).toBe(true);
    const turn = body.path.length;
    clock.advance(300);
    await Promise.resolve();
    expect(second.settled).toBe(true);
    expect(body.path.at(-1)).toEqual(origin);
    for (const point of body.path.slice(turn)) expect(point.x).toBeLessThanOrEqual(turnedAt.x);
  });

  it("keeps the rest of a glide going when one body is taken out of it", async () => {
    const clock = fakeClock();
    const glides = glider<string>(framesOf(clock));
    const taken = bodyAt(origin);
    const kept = bodyAt(origin);
    const run = settledFlag(
      glides.run(
        [
          { key: "taken", body: taken, to: far },
          { key: "kept", body: kept, to: far },
        ],
        240,
      ),
    );
    clock.advance(40);
    glides.drop("taken");
    const left = taken.path.length;
    expect(glides.gliding("taken")).toBe(false);
    expect(glides.gliding("kept")).toBe(true);
    clock.advance(300);
    await Promise.resolve();
    expect(taken.path).toHaveLength(left);
    expect(kept.path.at(-1)).toEqual(far);
    expect(run.settled).toBe(true);
  });

  it("stops everything where it stands when told to, and settles what was waiting", async () => {
    const clock = fakeClock();
    const glides = glider<string>(framesOf(clock));
    const body = bodyAt(origin);
    const run = settledFlag(glides.run([{ key: "a", body, to: far }], 240));
    clock.advance(40);
    glides.stop();
    const stoppedAt = body.path.length;
    clock.advance(300);
    await Promise.resolve();
    expect(run.settled).toBe(true);
    expect(body.path).toHaveLength(stoppedAt);
  });
});

describe("playing without a helper", () => {
  interface Framed extends Shapeable {
    shapes: ScreenRect[];
    moves: ScreenPoint[];
  }

  function framedAt(start: ScreenRect): Framed {
    const shapes: ScreenRect[] = [];
    const moves: ScreenPoint[] = [];
    let at = start;
    return {
      shapes,
      moves,
      position: () => ({ x: at.x, y: at.y }),
      moveTo: (point) => {
        at = { ...at, ...point };
        moves.push(point);
      },
      frame: () => at,
      reshape: (frame) => {
        at = frame;
        shapes.push(frame);
      },
    };
  }

  const small = { x: 0, y: 0, width: 400, height: 300 };
  const large = { x: 1000, y: -400, width: 800, height: 600 };

  it("leaves a body alone until its wait is over, then sizes it and glides it to its place", async () => {
    const clock = fakeClock();
    const glides = glider<string>(framesOf(clock));
    const first = framedAt(small);
    const second = framedAt(small);
    const run = settledFlag(
      glides.play([
        { key: "first", body: first, to: large, delayMs: 0, durationMs: 160 },
        { key: "second", body: second, to: large, delayMs: 120, durationMs: 160 },
      ]),
    );
    expect(first.shapes).toEqual([{ x: 0, y: 0, width: 800, height: 600 }]);
    clock.advance(100);
    expect(first.moves.length).toBeGreaterThan(3);
    expect(second.shapes).toEqual([]);
    expect(second.moves).toEqual([]);
    expect(glides.gliding("second")).toBe(true);
    clock.advance(40);
    expect(second.shapes).toEqual([{ x: 0, y: 0, width: 800, height: 600 }]);
    clock.advance(300);
    await aFewTurns();
    expect(first.frame()).toEqual(large);
    expect(second.frame()).toEqual(large);
    expect(run.settled).toBe(true);
  });

  it("answers for a body that is taken while it waits, and stops ticking when nothing is left", async () => {
    const clock = fakeClock();
    const said: string[] = [];
    const glides = glider<string>(framesOf(clock, said));
    const body = framedAt(small);
    const run = settledFlag(
      glides.play([{ key: "a", body, to: large, delayMs: 500, durationMs: 160 }]),
    );
    clock.advance(100);
    glides.drop("a");
    await aFewTurns();
    expect(run.settled).toBe(true);
    expect(glides.gliding("a")).toBe(false);
    clock.advance(1000);
    expect(body.shapes).toEqual([]);
    expect(body.moves).toEqual([]);
    expect(said).toEqual(["start", "stop"]);
  });
});

async function aFewTurns(): Promise<void> {
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
}
