import { compose, mirrorCell, type Placement, place } from "../kid/cell.ts";
import {
  anvil,
  bell,
  bench,
  chisel,
  crate,
  hammerSwing,
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
} from "../kid/parts.ts";
import type { Clip } from "../kid/poses.ts";
import { handOf, type Offset } from "../kid/rig.ts";
import type { PoseName, Row } from "../kid/types.ts";
import type { StockConfig, StockExtras, StockRig } from "./rig.ts";

export interface StockFrame<Ears extends string, Gear extends string> {
  readonly config: Partial<StockConfig<Ears, Gear>>;
  readonly extras?: StockExtras;
}

export interface Looks<Ears extends string, Gear extends string> {
  readonly flick: Partial<StockConfig<Ears, Gear>>;
  readonly settle: Partial<StockConfig<Ears, Gear>>;
  readonly atBench: Partial<StockConfig<Ears, Gear>>;
  readonly windUp: Partial<StockConfig<Ears, Gear>>;
  readonly apex: Partial<StockConfig<Ears, Gear>>;
  readonly studying: Partial<StockConfig<Ears, Gear>>;
  readonly onThePorch: Partial<StockConfig<Ears, Gear>>;
  readonly stuck: Partial<StockConfig<Ears, Gear>>;
  readonly glad: Partial<StockConfig<Ears, Gear>>;
  readonly chest: Offset;
  carrying(lag: number): StockFrame<Ears, Gear>;
}

export type StockClips = Readonly<Record<Exclude<PoseName, "nap">, () => Clip>>;

export const beat = (frames: number, hold: number, last: number): number[] =>
  Array.from({ length: frames }, (_, index) => (index === frames - 1 ? last : hold));

export function clipOf(row: Row, placements: readonly (readonly Placement[])[]): Clip {
  return { row, placements, frames: placements.map(compose) };
}

export function stockClips<Ears extends string, Gear extends string>(
  rig: StockRig<Ears, Gear>,
  looks: Looks<Ears, Gear>,
): StockClips {
  type Config = Partial<StockConfig<Ears, Gear>>;
  type Frame = StockFrame<Ears, Gear>;

  const placed = (frame: Frame): Placement[] => rig(frame.config, frame.extras);
  const still = (config: Config): Frame => ({ config });
  const loop = (ms: readonly number[], frames: readonly Frame[]): Clip =>
    clipOf({ frames: frames.length, ms: [...ms], loop: true }, frames.map(placed));
  const once = (ms: readonly number[], fallback: PoseName, frames: readonly Frame[]): Clip =>
    clipOf({ frames: frames.length, ms: [...ms], loop: false, fallback }, frames.map(placed));
  const atChest = (part: Parameters<typeof place>[0], dx = 0, dy = 0): Placement =>
    place(part, { dx: looks.chest.dx + dx, dy: looks.chest.dy + dy });

  const atBench: Config = { dx: 3, headDx: -1, tool: "swing", left: "reach", ...looks.atBench };
  const benchProps: StockExtras = {
    behind: [place(bench, { layer: "behind" }), place(workpiece, { layer: "behind" })],
  };

  const walkFrames = (config: Config, carried?: (lag: number) => Frame): Frame[] => {
    const bobs = [0, 0, -1, 0, 0, 0, -1, 0];
    return bobs.map((dy, index) => {
      const lag = (bobs[(index + 7) % 8] ?? 0) - dy;
      const mirror = index >= 4;
      const load = carried?.(lag);
      return {
        config: {
          left: mirror ? "tucked" : "swing",
          right: mirror ? "swing" : "tucked",
          ...config,
          ...load?.config,
          legs: { walk: (index % 4) as 0 | 1 | 2 | 3, mirror },
          dy,
          earDy: lag,
        },
        ...(load?.extras === undefined ? {} : { extras: load.extras }),
      };
    });
  };

  const walkLeft = (): Clip => loop(beat(8, 120, 220), walkFrames({ headDx: -2, gazeDx: -1 }));

  return {
    idle: () =>
      loop(
        [1680, 660, 660, 840, 840, 1920],
        [
          still({}),
          still({ eyes: "closed" }),
          still({ breath: 1 }),
          still({ breath: 1, ...looks.flick }),
          still(looks.settle),
          still({}),
        ],
      ),

    work: () => {
      const taps = [0, -1, -2, -1, -2, 0];
      const nods = [0, 0, 1, 0, 0, 1];
      return loop(
        beat(6, 120, 220),
        taps.map((leftDy, index) => ({
          config: { ...atBench, leftDy, headDy: nods[index] ?? 0 },
          extras: benchProps,
        })),
      );
    },

    hammer: () => {
      const anvilProps: StockExtras = { behind: [place(anvil, { layer: "behind" })] };
      const lifted: Frame = { config: { ...atBench, ...looks.windUp }, extras: anvilProps };
      return loop(
        [110, 160, 90, 260],
        [
          lifted,
          { config: { ...atBench, ...looks.apex }, extras: anvilProps },
          {
            config: { ...atBench, squash: 1 },
            extras: { ...anvilProps, front: [place(spark, { dx: 2, dy: 33 })] },
          },
          lifted,
        ],
      );
    },

    read: () => {
      const reading: Config = {
        headDy: 1,
        gazeDy: 1,
        left: "hug",
        right: "hug",
        ...looks.studying,
      };
      const page = (part: typeof sheet): StockExtras => ({ held: [atChest(part)] });
      return loop(beat(4, 400, 700), [
        { config: { ...reading, gazeDx: -1 }, extras: page(sheet) },
        { config: reading, extras: page(sheet) },
        { config: { ...reading, gazeDx: 1 }, extras: page(sheet) },
        { config: reading, extras: page(sheetTurning) },
      ]);
    },

    carve: () => {
      const carving: Config = { ...atBench, ...looks.studying, tool: "stowed", headDy: 1 };
      const pushes = [0, -1, -2, -1, -2, 0];
      const curls = [undefined, shavings[0], shavings[1], shavings[1], shavings[2], shavings[3]];
      return loop(
        beat(6, 130, 260),
        pushes.map((leftDx, index) => {
          const hand = handOf("reach", { dx: 3 + leftDx, dy: 0 });
          const curl = curls[index];
          return {
            config: { ...carving, leftDx },
            extras: {
              behind: [
                place(bench, { layer: "behind" }),
                place(workpiece, { dx: 1, layer: "behind" }),
              ],
              front: [
                place(chisel, { dx: hand.dx - 3, dy: hand.dy - 2 }),
                ...(curl === undefined ? [] : [place(curl)]),
              ],
            },
          };
        }),
      );
    },

    "walk-left": walkLeft,

    "walk-right": () => {
      const left = walkLeft();
      return { ...left, frames: left.frames.map(mirrorCell) };
    },

    carry: () => loop(beat(8, 120, 220), walkFrames({}, looks.carrying)),

    deliver: () => {
      const porch: Config = { dx: 2 };
      const grounded: StockExtras = { front: [place(crate, { dx: -17, dy: 12 })] };
      return once([200, 200, 300, 160, 400], "idle", [
        {
          config: {
            ...porch,
            headDy: 2,
            squash: 1,
            left: "hug",
            right: "hug",
            leftDy: 3,
            rightDy: 3,
          },
          extras: { held: [atChest(crate, 2, 3)] },
        },
        { config: { ...porch, headDy: 2, squash: 1, left: "reach", leftDy: 3 }, extras: grounded },
        { config: porch, extras: grounded },
        { config: { ...porch, left: "dust", right: "dust" }, extras: grounded },
        {
          config: { ...porch, left: "dust", right: "dust", leftDx: -1, rightDx: 1 },
          extras: grounded,
        },
      ]);
    },

    ring: () => {
      const ringing: Config = {
        legs: "tiptoe",
        left: "up",
        leftDx: 1,
        right: "across",
        headDx: -1,
        gazeDx: -1,
        gazeDy: -1,
        ...looks.onThePorch,
      };
      const porchBell = (tilt: -1 | 0 | 1, swung: boolean, pull: number): StockExtras => ({
        behind: [
          place(bell(tilt, swung), { dx: 2, layer: "behind" }),
          place(rope, { dx: 2, dy: pull, rows: pull, layer: "behind" }),
        ],
      });
      return once([160, 120, 200, 200, 320], "wait", [
        { config: { ...ringing, squash: -1 }, extras: porchBell(0, false, 0) },
        { config: { ...ringing, leftDy: 2, rightDy: 2 }, extras: porchBell(1, true, 2) },
        { config: { ...ringing, leftDy: 3, rightDy: 3 }, extras: porchBell(-1, true, 3) },
        { config: { ...ringing, squash: -1 }, extras: porchBell(1, true, 0) },
        { config: { ...ringing, squash: -1 }, extras: porchBell(0, false, 0) },
      ]);
    },

    wait: () => {
      const waiting: Config = { left: "half", ...looks.onThePorch };
      const sways = [-1, -1, 0, 1, 1, 0];
      return loop(
        beat(6, 150, 260),
        sways.map((sway, index) =>
          still({ ...waiting, sway, eyes: index === 3 ? "closed" : "glint" }),
        ),
      );
    },

    celebrate: () =>
      once(beat(6, 150, 280), "idle", [
        still({ squash: 1 }),
        still({ squash: -1, lift: 1, left: "up", right: "up", ...looks.glad }),
        still({ lift: 2, left: "out", right: "out", eyes: "happy", ...looks.glad }),
        still({ squash: 1, eyes: "happy" }),
        still({ eyes: "happy" }),
        still({ eyes: "glint" }),
      ]),

    stumble: () => {
      const slipping: Config = { ...atBench, tool: "stowed", left: "up" };
      const loose = (dx: number, dy: number): StockExtras => ({
        ...benchProps,
        front: [place(hammerSwing, { dx, dy })],
      });
      return once([90, 120, 160, 300], "work", [
        { config: { ...slipping, sway: 1, headDx: 1 }, extras: loose(9, 21) },
        { config: { ...slipping, sway: 2, headDx: 1, leftDx: 1 }, extras: loose(10, 21) },
        { config: { ...atBench, sway: 1, headDx: 0 }, extras: benchProps },
        { config: atBench, extras: benchProps },
      ]);
    },

    blocked: () => {
      const sat: Config = {
        dx: -3,
        dy: 4,
        legs: "haunch",
        eyes: "x",
        tool: "ground",
        headDy: 1,
        ...looks.stuck,
      };
      return loop(
        beat(8, 140, 240),
        sweatDrops.map((drop, index) => {
          const sway = index < 4 ? -1 : 1;
          return {
            config: { ...sat, sway },
            extras: drop === undefined ? {} : { front: [place(drop, { dx: -3 + sway, dy: 5 })] },
          };
        }),
      );
    },

    stretch: () => {
      const reaching: Config = { left: "raise", right: "raise", squash: -1, eyes: "closed" };
      return once([200, 200, 150, 150, 400], "idle", [
        still({ left: "up", right: "up", eyes: "closed" }),
        still(reaching),
        still({ ...reaching, headDx: -1 }),
        still({ ...reaching, headDx: 1 }),
        still(reaching),
      ]);
    },

    look: () =>
      once(
        beat(8, 3000, 3000),
        "idle",
        gazeDirections.map(([gazeDx, gazeDy]) => {
          const diagonal = gazeDx !== 0 && gazeDy !== 0;
          return still({
            gazeDx,
            gazeDy,
            headDx: diagonal ? gazeDx : 0,
            headDy: diagonal ? gazeDy : 0,
          });
        }),
      ),

    wave: () => {
      const waving: Config = { left: "raise", leftDy: -2, eyes: "glint" };
      return once(beat(4, 140, 280), "idle", [
        still(waving),
        still({ ...waving, leftDx: -1 }),
        still({ ...waving, leftDx: 1 }),
        still(waving),
      ]);
    },

    greet: () =>
      once(beat(5, 140, 280), "idle", [
        still({ squash: 1 }),
        still({ squash: -1, lift: 1 }),
        still({ lift: 2, eyes: "happy", ...looks.glad }),
        still({ squash: 1, eyes: "happy" }),
        still({ eyes: "glint" }),
      ]),

    raise: () => {
      const site: Config = { dx: 3 };
      const carrying: Config = { ...site, left: "hug", right: "hug" };
      const building: Config = { ...site, ...looks.atBench, left: "reach", tool: "stowed" };
      const strike: Config = { ...building, tool: "swing", leftDy: -2, squash: 1 };
      const standing: StockExtras = { behind: [place(post, { layer: "behind" })] };
      return once(beat(8, 180, 360), "idle", [
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
        { config: { ...building, left: "raise", tool: "hand" }, extras: standing },
        { config: strike, extras: standing },
        { config: { dx: 6, legs: { walk: 0, mirror: true } }, extras: standing },
        { config: { dx: 6, left: "hip", right: "hip" }, extras: standing },
      ]);
    },

    sit: () => {
      const seated: Config = {
        dy: 1,
        legs: "sit",
        left: "lap",
        right: "lap",
        headDy: -1,
        gazeDx: -1,
        gazeDy: -1,
      };
      const onStool: StockExtras = { behind: [place(stool, { layer: "behind" })] };
      return loop(beat(4, 800, 1600), [
        { config: seated, extras: onStool },
        { config: { ...seated, eyes: "closed" }, extras: onStool },
        { config: { ...seated, headDy: 0 }, extras: onStool },
        { config: seated, extras: onStool },
      ]);
    },
  };
}

export const sweatDrops = [
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  sweat[0],
  sweat[1],
  sweat[2],
] as const;

const gazeDirections: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];
