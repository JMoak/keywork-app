import { cellHeight, cellWidth, groundLine } from "../kid/cell.ts";
import { eyes as kidEyes, torso } from "../kid/parts.ts";
import { airborneFrames, type Clip } from "../kid/poses.ts";
import { type Part, part } from "../kid/sprite.ts";
import { type PoseName, poseNames, type Row, type Skin } from "../kid/types.ts";
import { beat, clipOf, type Looks, stockClips } from "../stock/clips.ts";
import { type Stamp, stamped, symmetric } from "../stock/draw.ts";
import { type Species, shifted, stockRig, type Worn } from "../stock/rig.ts";

export type CarterEars = "easy" | "up" | "perked" | "flat" | "side";
export type CarterGear = "empty" | "loaded";

export const carterAirborne = airborneFrames;

export function carterSkin(): Skin {
  const clips = poseNames.map((name) => [name, carterClips[name]()] as const);
  const columns = Math.max(...clips.map(([, clip]) => clip.frames.length));
  const width = cellWidth * columns;
  const indices = new Uint8Array(width * cellHeight * poseNames.length);
  clips.forEach(([, clip], row) => {
    clip.frames.forEach((frame, column) => {
      for (let y = 0; y < cellHeight; y += 1) {
        const source = frame.subarray(y * cellWidth, (y + 1) * cellWidth);
        indices.set(source, (row * cellHeight + y) * width + column * cellWidth);
      }
    });
  });
  return {
    id: "carter",
    displayName: "The carter",
    cell: { width: cellWidth, height: cellHeight },
    atlas: { width, height: cellHeight * poseNames.length, indices },
    palette: { identity: [1, 2, 3, 4], ground: [5, 6, 7, 8], outline: 9, accent: [10, 11, 12] },
    rows: Object.fromEntries(clips.map(([name, clip]) => [name, clip.row])) as Record<
      PoseName,
      Row
    >,
    groundLine,
    gaze: { row: poseNames.indexOf("look"), directions: 8 },
  };
}

const longFace = [
  19, 19, 21, 21, 23, 23, 23, 23, 23, 23, 21, 21, 19, 17, 15, 13, 13, 11, 11, 11, 11, 11, 9,
] as const;
const muzzleFrom = 14;
const eyeRings: readonly Stamp[] = [
  [6, 6, "ll"],
  [6, 15, "ll"],
  [7, 5, "llll"],
  [7, 14, "llll"],
  [8, 5, "llll"],
  [8, 14, "llll"],
  [9, 6, "ll"],
  [9, 15, "ll"],
];

export const head = part(
  "carter-head",
  13,
  12,
  stamped(
    longFace.map((width, row) => symmetric(23, [width], row < muzzleFrom ? "c" : "l")[0] as string),
    [...eyeRings, [19, 8, "s"], [19, 14, "s"], [22, 9, "sssss"]],
  ),
);

export const forelock = part("carter-forelock", 22, 8, [
  "..h..",
  ".chc.",
  ".ccc.",
  "ccccc",
  "ccccc",
]);

export const earUp = part("carter-ear-up", 15, 4, [
  ".c.",
  "ccc",
  "clc",
  "clc",
  "clc",
  "clc",
  "clc",
  "ccc",
  "ccc",
]);

export const earTilt = part("carter-ear-tilt", 11, 5, [
  ".cc....",
  "ccc....",
  "clcc...",
  ".clcc..",
  "..clcc.",
  "...clcc",
  "....ccc",
  ".....cc",
]);

export const earFlat = part("carter-ear-flat", 6, 14, [".cccccccc", "ccllllccc", ".cccccc.."]);

export const strap = part("carter-strap", 16, 36, ["ddddddddddddddddd", ".......dpd......."]);

export const pannier = part("carter-pannier", 8, 38, [
  "pppppppp",
  "wwwwwwww",
  "wddddddw",
  "wwwwwwww",
  "wwwwwwww",
  "wddddddw",
  "wwwwwwww",
  "dddddddd",
]);

export const pannierLoaded = part("carter-pannier-loaded", 8, 32, [
  ".pppppp.",
  ".gggggg.",
  ".gddddg.",
  ".gggggg.",
  ".gddddg.",
  ".gggggg.",
  "pppppppp",
  "wwwwwwww",
  "wddddddw",
  "wwwwwwww",
  "wwwwwwww",
  "wddddddw",
  "wwwwwwww",
  "dddddddd",
]);

const eyeDrop = 2;

const bothSides = (piece: Part, dy = 0): Worn[] => [
  { part: piece, dy },
  { part: piece, mirror: true, dy },
];

const carter: Species<CarterEars, CarterGear> = {
  model: {
    dx: 0,
    dy: 0,
    lift: 0,
    sway: 0,
    squash: 0,
    breath: 0,
    headDx: 0,
    headDy: 0,
    eyes: "open",
    gazeDx: 0,
    gazeDy: 0,
    ears: "easy",
    earDy: 0,
    gear: "empty",
    tool: "stowed",
    left: "down",
    right: "down",
    leftDx: 0,
    leftDy: 0,
    rightDx: 0,
    rightDy: 0,
    legs: "stand",
  },
  torso,
  armSpread: 0,
  eyes: {
    open: shifted(kidEyes.open, 0, eyeDrop),
    glint: shifted(kidEyes.glint, 0, eyeDrop),
    closed: shifted(kidEyes.closed, 0, eyeDrop),
    happy: shifted(kidEyes.happy, 0, eyeDrop),
    x: shifted(kidEyes.x, 0, eyeDrop),
  },
  head: [head, forelock],
  face: [],
  ears: (state) => {
    switch (state) {
      case "easy":
        return [{ part: earUp }, { part: earTilt, mirror: true }];
      case "up":
        return bothSides(earUp);
      case "perked":
        return bothSides(earUp, -1);
      case "flat":
        return bothSides(earFlat);
      case "side":
        return bothSides(earFlat, -2);
    }
  },
  gear: (state) => ({
    front: [{ part: strap }, ...bothSides(state === "loaded" ? pannierLoaded : pannier)],
  }),
};

export const carterRig = stockRig(carter);

const looks: Looks<CarterEars, CarterGear> = {
  flick: { ears: "up" },
  settle: {},
  atBench: { ears: "up" },
  windUp: { left: "up", tool: "hand" },
  apex: { left: "raise", tool: "hand", squash: -1, headDy: 1 },
  studying: { ears: "up" },
  onThePorch: { ears: "perked", eyes: "glint" },
  stuck: { ears: "flat" },
  glad: { ears: "up" },
  chest: { dx: 0, dy: 6 },
  carrying: (lag) => ({ config: { gear: "loaded", left: "down", right: "down", sway: lag } }),
};

function nap(): Clip {
  return clipOf(
    { frames: 4, ms: beat(4, 1200, 2400), loop: true },
    [0, 1, 1, 0].map((breath) =>
      carterRig({
        eyes: "closed",
        ears: "side",
        headDy: 2,
        legs: { walk: 2, mirror: false },
        breath,
      }),
    ),
  );
}

export const carterClips: Readonly<Record<PoseName, () => Clip>> = {
  ...stockClips(carterRig, looks),
  nap,
};
