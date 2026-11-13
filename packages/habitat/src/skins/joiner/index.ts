import { cellHeight, cellWidth, groundLine, type Placement, place } from "../kid/cell.ts";
import { crate, hay, stool } from "../kid/parts.ts";
import { airborneFrames, type Clip } from "../kid/poses.ts";
import { part } from "../kid/sprite.ts";
import { type PoseName, poseNames, type Row, type Skin } from "../kid/types.ts";
import { beat, clipOf, type Looks, stockClips, sweatDrops } from "../stock/clips.ts";
import { centered, stamped, symmetric } from "../stock/draw.ts";
import { type Species, stockRig, type Worn } from "../stock/rig.ts";

export type JoinerEars = "rest" | "flick" | "low" | "pencil";
export type JoinerGear = "rolled" | "open";

export const joinerAirborne = airborneFrames;

export function joinerSkin(): Skin {
  const clips = poseNames.map((name) => [name, joinerClips[name]()] as const);
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
    id: "joiner",
    displayName: "The joiner",
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

const stripe = "hhhhh";
const brow = (crown: string, band: string): string => crown + band + stripe + band + crown;

export const head = part(
  "joiner-head",
  11,
  9,
  [
    brow("cccc", ""),
    brow("ccccccc", ""),
    brow("ccc", "ssssss"),
    brow("cccc", "ssssss"),
    ...Array.from({ length: 7 }, () => brow("ccccc", "ssssss")),
    brow("llll", "ssssss"),
    brow("lllll", "sssss"),
    brow("lllll", "ssss"),
    brow("lllll", "sss"),
    brow("llll", "ss"),
    brow("llll", "s"),
    "lllllooolllll",
    "lllllolllll",
    "lllllllll",
  ].map((row) => centered(27, row)),
);

export const ear = part("joiner-ear", 10, 7, [".hhh.", "ccccc", "ccccc", ".ccc."]);

export const pencil = part("joiner-pencil", 35, 4, ["...*", "..p.", ".p..", "p..."]);

export const torso = part(
  "joiner-torso",
  13,
  29,
  stamped(
    symmetric(23, [13, 15, 19, 21, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 21, 21], "c"),
    [
      [0, 9, "lllll"],
      [1, 9, "lllll"],
      [2, 9, "lllll"],
      [3, 9, "lllll"],
      [4, 10, "lll"],
      [14, 1, "sssssssssssssssssssss"],
      [15, 1, "sssssssssssssssssssss"],
      [16, 1, "sssssssssssssssssssss"],
    ],
  ),
  { rows: [6, 12], cols: [1, 21] },
);

export const toolRoll = part("joiner-roll", 13, 36, [
  "ddddddddddddddddddddddd",
  "gggggggggwwwwwggggggggg",
  "ddddddddddddddddddddddd",
]);

export const toolRollOpen = part("joiner-roll-open", 13, 35, [
  ".p.p.p...........p.p.p.",
  "ddddddddddddddddddddddd",
  "gwgwgwgggggggggggwgwgwg",
  "ddddddddddddddddddddddd",
]);

export const pawOverEye = part("joiner-paw-over-eye", 13, 15, [
  "....ccccc",
  "....ccccc",
  "....ccccc",
  "....sssss",
  "...ccc...",
  "...ccc...",
  "...ccc...",
  "..ccc....",
  "..ccc....",
  "..ccc....",
  "..ccc....",
  ".ccc.....",
  ".ccc.....",
  ".ccc.....",
  ".ccc.....",
  "ccc......",
  "ccc......",
  "ccc......",
  "ccc......",
]);

export const napBall = part(
  "joiner-nap-ball",
  10,
  38,
  stamped(symmetric(27, [11, 17, 21, 23, 25, 27, 27, 27, 27, 25, 23, 19], "c"), [
    [1, 7, "h"],
    [2, 4, "sshhhss"],
    [3, 3, "sshhhss"],
    [4, 2, "sshhhss"],
    [5, 1, "sshhhss"],
    [6, 1, "oohhhoo"],
    [7, 1, "sshhhss"],
    [8, 2, "llhhhll"],
    [9, 3, "lllolll"],
    [10, 5, "sssssssssssssssss"],
    [11, 4, "sssssssssssssssssss"],
  ]),
  { rows: [3, 7], cols: [9, 25] },
);

const eyeLift = -1;

const eyes = {
  open: part("joiner-eyes-open", 19, 17 + eyeLift, ["oh.......ho", "oo.......oo"]),
  glint: part("joiner-eyes-glint", 19, 17 + eyeLift, ["ho.......oh", "oo.......oo"]),
  closed: part("joiner-eyes-closed", 19, 18 + eyeLift, ["oo.......oo"]),
  happy: part("joiner-eyes-happy", 18, 17 + eyeLift, [".o.........o.", "o.o.......o.o"]),
  x: part("joiner-eyes-x", 18, 16 + eyeLift, ["o.o.......o.o", ".o.........o.", "o.o.......o.o"]),
} as const;

const bothEars = (dy = 0): Worn[] => [
  { part: ear, dy },
  { part: ear, mirror: true, dy },
];

const joiner: Species<JoinerEars, JoinerGear> = {
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
    ears: "rest",
    earDy: 0,
    gear: "rolled",
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
  armSpread: 3,
  eyes,
  head: [head],
  face: [],
  ears: (state) => {
    switch (state) {
      case "rest":
        return bothEars();
      case "flick":
        return [
          { part: ear, dy: -1 },
          { part: ear, mirror: true },
        ];
      case "low":
        return bothEars(2);
      case "pencil":
        return [...bothEars(), { part: pencil }];
    }
  },
  gear: (state) => ({ front: [{ part: state === "open" ? toolRollOpen : toolRoll }] }),
};

export const joinerRig = stockRig(joiner);

const shoulderCrate = (lag: number): Placement => place(crate, { dx: -16, dy: -7 + lag });

const looks: Looks<JoinerEars, JoinerGear> = {
  flick: { ears: "flick" },
  settle: { earDy: -1 },
  atBench: { gear: "open" },
  windUp: { tool: "swing", leftDy: -3 },
  apex: { left: "up", tool: "hand", squash: -1 },
  studying: { ears: "pencil" },
  onThePorch: { eyes: "glint" },
  stuck: { ears: "low" },
  glad: { ears: "flick" },
  chest: { dx: 0, dy: 1 },
  carrying: (lag) => ({
    config: { left: "up", right: "tucked" },
    extras: { held: [shoulderCrate(lag)] },
  }),
};

function wait(): Clip {
  const onTheStep = { behind: [place(stool, { layer: "behind" })] };
  return clipOf(
    { frames: 6, ms: beat(6, 150, 260), loop: true },
    [0, 0, -1, -1, 0, 0].map((headDy, index) =>
      joinerRig(
        {
          dy: 1,
          legs: "sit",
          left: "lap",
          right: "lap",
          headDy: headDy - 1,
          eyes: index === 3 ? "closed" : "glint",
        },
        onTheStep,
      ),
    ),
  );
}

function blocked(): Clip {
  return clipOf(
    { frames: 8, ms: beat(8, 140, 240), loop: true },
    sweatDrops.map((drop, index) => {
      const sway = index < 4 ? -1 : 1;
      const hiding = index < 4;
      const at = { dx: -3 + sway, dy: 5 };
      return joinerRig(
        {
          dx: -3,
          dy: 4,
          sway,
          legs: "haunch",
          eyes: "x",
          ears: "low",
          tool: "ground",
          headDy: 1,
          left: hiding ? "none" : "lap",
          right: hiding ? "none" : "lap",
        },
        {
          front: [
            ...(hiding ? [place(pawOverEye, at), place(pawOverEye, { ...at, mirror: true })] : []),
            ...(drop === undefined ? [] : [place(drop, at)]),
          ],
        },
      );
    }),
  );
}

function nap(): Clip {
  const curled = (rows: number): Placement[] => [
    place(hay, { layer: "behind" }),
    place(napBall, { rows, layer: "skin" }),
  ];
  return clipOf({ frames: 4, ms: beat(4, 1200, 2400), loop: true }, [0, 1, 1, 0].map(curled));
}

export const joinerClips: Readonly<Record<PoseName, () => Clip>> = {
  ...stockClips(joinerRig, looks),
  wait,
  blocked,
  nap,
};
