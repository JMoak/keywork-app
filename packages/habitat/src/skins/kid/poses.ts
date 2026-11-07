import { compose, mirrorCell, type Placement, place } from "./cell.ts";
import {
  anvil,
  bell,
  bench,
  chisel,
  crate,
  hammerSwing,
  hay,
  napBody,
  napEyes,
  napHead,
  plankHeld,
  post,
  rope,
  shavings,
  sheet,
  sheetTurning,
  spark,
  stool,
  sweat,
  workpiece,
} from "./parts.ts";
import { handOf, type KidConfig, type KidExtras, kid } from "./rig.ts";
import type { PoseName, Row } from "./types.ts";

export interface Clip {
  readonly row: Row;
  readonly placements: readonly (readonly Placement[])[];
  readonly frames: readonly Uint8Array[];
}

export const airborneFrames: Readonly<Partial<Record<PoseName, readonly number[]>>> = {
  celebrate: [1, 2],
  greet: [1, 2],
};

export const clipBuilders: Readonly<Record<PoseName, () => Clip>> = {
  idle,
  work,
  hammer,
  read,
  carve,
  "walk-left": walkLeft,
  "walk-right": walkRight,
  carry,
  deliver,
  ring,
  wait,
  celebrate,
  stumble,
  blocked,
  nap,
  stretch,
  look,
  wave,
  greet,
  raise,
  sit,
};

interface Frame {
  readonly config: Partial<KidConfig>;
  readonly extras?: KidExtras;
}

const beat = (frames: number, hold: number, last: number): number[] =>
  Array.from({ length: frames }, (_, index) => (index === frames - 1 ? last : hold));

function loopClip(ms: readonly number[], frames: readonly Frame[]): Clip {
  return clipOf({ frames: frames.length, ms: [...ms], loop: true }, frames.map(placed));
}

function oneShotClip(ms: readonly number[], fallback: PoseName, frames: readonly Frame[]): Clip {
  return clipOf({ frames: frames.length, ms: [...ms], loop: false, fallback }, frames.map(placed));
}

function clipOf(row: Row, placements: readonly (readonly Placement[])[]): Clip {
  return { row, placements, frames: placements.map(compose) };
}

function placed(frame: Frame): Placement[] {
  return kid(frame.config, frame.extras);
}

const still = (config: Partial<KidConfig>): Frame => ({ config });

function idle(): Clip {
  return loopClip(
    [1680, 660, 660, 840, 840, 1920],
    [
      still({}),
      still({ eyes: "closed" }),
      still({ breath: 1 }),
      still({ breath: 1, ears: "flick", glint: 1 }),
      still({ earDy: -1, glint: 2 }),
      still({}),
    ],
  );
}

const atBench: Partial<KidConfig> = {
  dx: 3,
  headDx: -1,
  goggles: "down",
  hammer: "swing",
  left: "reach",
};

const benchProps: KidExtras = {
  behind: [place(bench, { layer: "behind" }), place(workpiece, { layer: "behind" })],
};

function work(): Clip {
  const taps = [0, -1, -2, -1, -2, 0];
  const nods = [0, 0, 1, 0, 0, 1];
  return loopClip(
    beat(6, 120, 220),
    taps.map((leftDy, index) => ({
      config: { ...atBench, leftDy, headDy: nods[index] ?? 0 },
      extras: benchProps,
    })),
  );
}

function hammer(): Clip {
  const anvilProps: KidExtras = { behind: [place(anvil, { layer: "behind" })] };
  const lifted: Frame = { config: { ...atBench, left: "up", hammer: "hand" }, extras: anvilProps };
  return loopClip(
    [110, 160, 90, 260],
    [
      lifted,
      { config: { ...atBench, left: "raise", hammer: "hand", squash: -1 }, extras: anvilProps },
      {
        config: { ...atBench, squash: 1 },
        extras: { ...anvilProps, front: [place(spark, { dx: 2, dy: 33 })] },
      },
      lifted,
    ],
  );
}

function read(): Clip {
  const reading: Partial<KidConfig> = { headDy: 1, gazeDy: 1, left: "hug", right: "hug" };
  const page = (part: typeof sheet): KidExtras => ({ held: [place(part)] });
  return loopClip(beat(4, 400, 700), [
    { config: { ...reading, gazeDx: -1 }, extras: page(sheet) },
    { config: reading, extras: page(sheet) },
    { config: { ...reading, gazeDx: 1 }, extras: page(sheet) },
    { config: reading, extras: page(sheetTurning) },
  ]);
}

function carve(): Clip {
  const carving: Partial<KidConfig> = { ...atBench, hammer: "none", headDy: 1 };
  const pushes = [0, -1, -2, -1, -2, 0];
  const curls = [undefined, shavings[0], shavings[1], shavings[1], shavings[2], shavings[3]];
  return loopClip(
    beat(6, 130, 260),
    pushes.map((leftDx, index) => {
      const hand = handOf("reach", { dx: 3 + leftDx, dy: 0 });
      const curl = curls[index];
      return {
        config: { ...carving, leftDx },
        extras: {
          behind: [place(bench, { layer: "behind" }), place(workpiece, { dx: 1, layer: "behind" })],
          front: [
            place(chisel, { dx: hand.dx - 3, dy: hand.dy - 2 }),
            ...(curl === undefined ? [] : [place(curl)]),
          ],
        },
      };
    }),
  );
}

function walkFrames(config: Partial<KidConfig>, extrasAt?: (lag: number) => KidExtras): Frame[] {
  const bobs = [0, 0, -1, 0, 0, 0, -1, 0];
  return bobs.map((dy, index) => {
    const lag = (bobs[(index + 7) % 8] ?? 0) - dy;
    const phase = (index % 4) as 0 | 1 | 2 | 3;
    const mirror = index >= 4;
    return {
      config: {
        ...config,
        legs: { walk: phase, mirror },
        dy,
        apronDy: lag,
        left: config.left ?? (mirror ? "tucked" : "swing"),
        right: config.right ?? (mirror ? "swing" : "tucked"),
      },
      ...(extrasAt === undefined ? {} : { extras: extrasAt(lag) }),
    };
  });
}

function walkLeft(): Clip {
  return loopClip(beat(8, 120, 220), walkFrames({ headDx: -2, gazeDx: -1 }));
}

function walkRight(): Clip {
  const left = walkLeft();
  return { ...left, frames: left.frames.map(mirrorCell) };
}

function carry(): Clip {
  return loopClip(
    beat(8, 120, 220),
    walkFrames({ left: "hug", right: "hug" }, (lag) => ({ held: [place(crate, { dy: lag })] })),
  );
}

function deliver(): Clip {
  const porch: Partial<KidConfig> = { dx: 2 };
  const grounded: KidExtras = { front: [place(crate, { dx: -17, dy: 12 })] };
  return oneShotClip([200, 200, 300, 160, 400], "idle", [
    {
      config: { ...porch, headDy: 2, squash: 1, left: "hug", right: "hug", leftDy: 3, rightDy: 3 },
      extras: { held: [place(crate, { dx: 2, dy: 3 })] },
    },
    { config: { ...porch, headDy: 2, squash: 1, left: "reach", leftDy: 3 }, extras: grounded },
    { config: porch, extras: grounded },
    { config: { ...porch, left: "dust", right: "dust" }, extras: grounded },
    {
      config: { ...porch, left: "dust", right: "dust", leftDx: -1, rightDx: 1 },
      extras: grounded,
    },
  ]);
}

function ring(): Clip {
  const ringing: Partial<KidConfig> = {
    legs: "tiptoe",
    left: "up",
    leftDx: 1,
    right: "across",
    headDx: -1,
    gazeDx: -1,
    gazeDy: -1,
  };
  const porchBell = (tilt: -1 | 0 | 1, swung: boolean, pull: number): KidExtras => ({
    behind: [
      place(bell(tilt, swung), { dx: 2, layer: "behind" }),
      place(rope, { dx: 2, dy: pull, rows: pull, layer: "behind" }),
    ],
  });
  return oneShotClip([160, 120, 200, 200, 320], "wait", [
    { config: { ...ringing, squash: -1 }, extras: porchBell(0, false, 0) },
    { config: { ...ringing, leftDy: 2, rightDy: 2 }, extras: porchBell(1, true, 2) },
    { config: { ...ringing, leftDy: 3, rightDy: 3 }, extras: porchBell(-1, true, 3) },
    { config: { ...ringing, squash: -1 }, extras: porchBell(1, true, 0) },
    { config: { ...ringing, squash: -1 }, extras: porchBell(0, false, 0) },
  ]);
}

function wait(): Clip {
  const waiting: Partial<KidConfig> = { left: "half", eyes: "glint" };
  const sways = [-1, -1, 0, 1, 1, 0];
  return loopClip(
    beat(6, 150, 260),
    sways.map((sway, index) => still({ ...waiting, sway, eyes: index === 3 ? "closed" : "glint" })),
  );
}

function celebrate(): Clip {
  return oneShotClip(beat(6, 150, 280), "idle", [
    still({ squash: 1 }),
    still({ squash: -1, lift: 1, left: "up", right: "up" }),
    still({ lift: 2, left: "out", right: "out", eyes: "happy" }),
    still({ squash: 1, eyes: "happy" }),
    still({ eyes: "happy" }),
    still({ eyes: "glint" }),
  ]);
}

function stumble(): Clip {
  const slipping: Partial<KidConfig> = { ...atBench, hammer: "none", left: "up" };
  const loose = (dx: number, dy: number): KidExtras => ({
    ...benchProps,
    front: [place(hammerSwing, { dx, dy })],
  });
  return oneShotClip([90, 120, 160, 300], "work", [
    { config: { ...slipping, sway: 1, headDx: 1 }, extras: loose(9, 21) },
    { config: { ...slipping, sway: 2, headDx: 1, leftDx: 1 }, extras: loose(10, 21) },
    { config: { ...atBench, sway: 1, headDx: 0 }, extras: benchProps },
    { config: atBench, extras: benchProps },
  ]);
}

function blocked(): Clip {
  const sat: Partial<KidConfig> = {
    dx: -3,
    dy: 4,
    legs: "haunch",
    goggles: "fogged",
    eyes: "x",
    hammer: "ground",
    headDy: 1,
  };
  const drops = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    sweat[0],
    sweat[1],
    sweat[2],
  ];
  return loopClip(
    beat(8, 140, 240),
    drops.map((drop, index) => {
      const sway = index < 4 ? -1 : 1;
      return {
        config: { ...sat, sway },
        extras: drop === undefined ? {} : { front: [place(drop, { dx: -3 + sway, dy: 5 })] },
      };
    }),
  );
}

function nap(): Clip {
  const curled = (rows: number): Placement[] => [
    place(hay, { layer: "behind" }),
    place(napBody, { rows, layer: "skin" }),
    place(napHead, { layer: "skin" }),
    place(napEyes, { outline: false }),
  ];
  return clipOf({ frames: 4, ms: beat(4, 1200, 2400), loop: true }, [0, 1, 1, 0].map(curled));
}

function stretch(): Clip {
  const reaching: Partial<KidConfig> = {
    left: "raise",
    right: "raise",
    squash: -1,
    eyes: "closed",
  };
  return oneShotClip([200, 200, 150, 150, 400], "idle", [
    still({ left: "up", right: "up", eyes: "closed" }),
    still(reaching),
    still({ ...reaching, headDx: -1 }),
    still({ ...reaching, headDx: 1 }),
    still(reaching),
  ]);
}

function look(): Clip {
  const directions: readonly (readonly [number, number])[] = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  return oneShotClip(
    beat(8, 3000, 3000),
    "idle",
    directions.map(([gazeDx, gazeDy]) => {
      const diagonal = gazeDx !== 0 && gazeDy !== 0;
      return still({
        gazeDx,
        gazeDy,
        headDx: diagonal ? gazeDx : 0,
        headDy: diagonal ? gazeDy : 0,
      });
    }),
  );
}

function wave(): Clip {
  const waving: Partial<KidConfig> = { left: "raise", leftDy: -2, eyes: "glint" };
  return oneShotClip(beat(4, 140, 280), "idle", [
    still(waving),
    still({ ...waving, leftDx: -1 }),
    still({ ...waving, leftDx: 1 }),
    still(waving),
  ]);
}

function greet(): Clip {
  return oneShotClip(beat(5, 140, 280), "idle", [
    still({ squash: 1 }),
    still({ squash: -1, lift: 1 }),
    still({ lift: 2, eyes: "happy", ears: "flick" }),
    still({ squash: 1, eyes: "happy" }),
    still({ eyes: "glint" }),
  ]);
}

function raise(): Clip {
  const site: Partial<KidConfig> = { dx: 3 };
  const carrying: Partial<KidConfig> = { ...site, left: "hug", right: "hug" };
  const building: Partial<KidConfig> = { ...site, goggles: "down", left: "reach", hammer: "none" };
  const strike: Partial<KidConfig> = { ...building, hammer: "swing", leftDy: -2, squash: 1 };
  const standing: KidExtras = { behind: [place(post, { layer: "behind" })] };
  return oneShotClip(beat(8, 180, 360), "idle", [
    {
      config: { ...carrying, legs: { walk: 0, mirror: false } },
      extras: { held: [place(plankHeld)] },
    },
    {
      config: { ...carrying, legs: { walk: 2, mirror: false }, dy: -1 },
      extras: { held: [place(plankHeld, { dy: -1 })] },
    },
    { config: building, extras: standing },
    { config: strike, extras: standing },
    { config: { ...building, left: "raise", hammer: "hand" }, extras: standing },
    { config: strike, extras: standing },
    { config: { dx: 6, legs: { walk: 0, mirror: true } }, extras: standing },
    { config: { dx: 6, left: "hip", right: "hip" }, extras: standing },
  ]);
}

function sit(): Clip {
  const seated: Partial<KidConfig> = {
    dy: 1,
    legs: "sit",
    left: "lap",
    right: "lap",
    headDy: -1,
    gazeDx: -1,
    gazeDy: -1,
  };
  const onStool: KidExtras = { behind: [place(stool, { layer: "behind" })] };
  return loopClip(beat(4, 800, 1600), [
    { config: seated, extras: onStool },
    { config: { ...seated, eyes: "closed" }, extras: onStool },
    { config: { ...seated, headDy: 0 }, extras: onStool },
    { config: seated, extras: onStool },
  ]);
}
