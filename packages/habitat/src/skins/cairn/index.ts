import {
  defaultCell,
  defaultPaletteRoles,
  type PoseName,
  poseNames,
  type Row,
  referenceRows,
  type Skin,
} from "../../pose/skin.ts";
import { assembleAtlas, mirrorFrame } from "../atlas.ts";
import { compose, type Placement, place } from "../kid/cell.ts";
import type { Part } from "../kid/sprite.ts";
import {
  chisel,
  fault,
  heart,
  levelSummit,
  lowHeart,
  page,
  parcel,
  shard,
  summit,
  tiltedShard,
  workpiece,
} from "./parts.ts";

export const cairnCharacter = {
  name: "Cairn",
  nature: "Patient, deliberate, unexpectedly playful.",
  signature: "A tilted capstone, a pierced arch and a curious shard hover in balance.",
  working: "The shard strikes and pares while the broad capstone counterbalances each stroke.",
  waiting: "Opens the gaps between its stones and inclines the summit toward the keeper.",
  blocked: "The capstone slips sideways and a fault opens in the arch.",
  resting: "Turns edge-on, drawing the three stones close above the ground.",
} as const;

export const cairnRows: Readonly<Record<PoseName, Row>> = {
  ...referenceRows,
  idle: { frames: 6, ms: [1880, 640, 800, 1080, 720, 2240], loop: true },
  work: { frames: 6, ms: [320, 240, 140, 360, 280, 640], loop: true },
  hammer: { frames: 6, ms: [380, 220, 120, 320, 220, 560], loop: true },
  read: { frames: 4, ms: [960, 560, 480, 1280], loop: true },
  carve: { frames: 6, ms: [320, 200, 200, 360, 240, 480], loop: true },
  wait: { frames: 6, ms: [1440, 640, 800, 880, 640, 1600], loop: true },
  blocked: { frames: 8, ms: [1200, 240, 320, 480, 1200, 240, 320, 1440], loop: true },
  nap: { frames: 4, ms: [2800, 2200, 2200, 3200], loop: true },
  look: { frames: 8, ms: [560, 320, 360, 640, 560, 320, 360, 960], loop: true },
  sit: { frames: 4, ms: [1920, 1040, 1040, 2240], loop: true },
};

export function cairnSkin(): Skin {
  const frames = Object.fromEntries(
    poseNames.map((pose) => [
      pose,
      Array.from({ length: cairnRows[pose].frames }, (_, index) => cairnFrame(pose, index)),
    ]),
  ) as Record<PoseName, Uint8Array[]>;
  return {
    id: "cairn",
    material: "sandstone",
    displayName: "Cairn",
    cell: defaultCell,
    atlas: assembleAtlas(defaultCell, frames),
    palette: defaultPaletteRoles,
    rows: cairnRows,
    groundLine: 51,
    gaze: { row: poseNames.indexOf("look"), directions: 8 },
  };
}

export function cairnFrame(pose: PoseName, index: number): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= cairnRows[pose].frames)
    throw new RangeError(`${pose} has ${cairnRows[pose].frames} Cairn frames, not ${index}`);
  if (pose === "walk-right")
    return mirrorFrame({ ...defaultCell, indices: cairnFrame("walk-left", index) }).indices;
  return compose(arrangement(pose, index));
}

type Offset = readonly [x: number, y: number];

interface Balance {
  readonly summit?: Offset;
  readonly heart?: Offset;
  readonly shard?: Offset;
  readonly level?: boolean;
  readonly low?: boolean;
  readonly strike?: boolean;
}

const orbit = [0, -1, -2, -1, 0, 1, 2, 1] as const;
const reach = [0, 1, 3, 4, 2, 0] as const;
const attentionDirections: readonly Offset[] = [
  [4, 0],
  [3, 1],
  [0, 1],
  [-3, 1],
  [-4, 0],
  [-3, -1],
  [0, -2],
  [3, -1],
];

function arrangement(pose: Exclude<PoseName, "walk-right">, index: number): Placement[] {
  const stroke = reach[index] ?? 0;
  switch (pose) {
    case "idle":
      return balance({
        summit: [index === 3 ? 1 : 0, index === 2 || index === 3 ? -1 : 0],
        heart: [index === 1 || index === 2 ? -1 : 0, 0],
        shard: [index === 3 || index === 4 ? 1 : 0, 0],
      });
    case "work":
      return [
        ...balance({
          summit: [-1 - stroke, 2],
          level: true,
          heart: [-3, 1],
          shard: [8 + stroke, -4 + stroke],
          strike: true,
        }),
        place(workpiece),
      ];
    case "hammer":
      return [
        ...balance({
          summit: [-3, -Math.floor(stroke / 2)],
          heart: [-4, 2],
          shard: [12, -7 + stroke * 2],
          strike: true,
        }),
        place(workpiece),
      ];
    case "read":
      return [
        ...balance({
          summit: [1, index === 2 ? 3 : 2],
          heart: [-4, 2],
          shard: [5, index === 1 ? -1 : 0],
        }),
        place(page, { dx: index === 2 ? 1 : 0, dy: index === 1 || index === 2 ? -1 : 0 }),
      ];
    case "carve":
      return [
        ...balance({
          summit: [2 - stroke, 1],
          level: true,
          heart: [-4, 2],
          shard: [6 + stroke, -4],
          strike: true,
        }),
        place(workpiece),
        place(chisel, { dx: 2 - Math.floor(stroke / 2), dy: stroke }),
      ];
    case "walk-left":
      return balance({
        summit: [-3 + (orbit[(index + 4) % 8] ?? 0), index % 4 < 2 ? -1 : -2],
        heart: [-1 + (orbit[(index + 2) % 8] ?? 0), -1],
        shard: [2 + (orbit[index] ?? 0), index % 4 < 2 ? -1 : 0],
      });
    case "carry":
      return [
        ...balance({
          summit: [-2, -2 + Math.floor(stroke / 2)],
          heart: [-3, -1],
          shard: [3 + Math.floor(stroke / 2), 0],
        }),
        place(parcel, { dx: -3 + Math.floor(stroke / 2), dy: 2 - Math.floor(stroke / 2) }),
      ];
    case "deliver": {
      const outward = Math.min(index, 4);
      return [
        ...balance({
          summit: [-3 + outward, -2],
          heart: [-4 + outward, -2],
          shard: [3 + outward, 1],
        }),
        place(parcel, { dx: -4 + outward * 2, dy: 2 + outward * 2 }),
      ];
    }
    case "ring":
      return balance({ summit: [index % 2 === 0 ? 5 : 0, -2], heart: [-1, 1], shard: [2, 1] });
    case "wait":
      return balance({ summit: [3 + Math.floor(stroke / 2), -2], heart: [-2, 0], shard: [1, 1] });
    case "celebrate":
      return balance({
        summit: [2 + stroke, -2],
        heart: [-1 - stroke, 0],
        shard: [2 + stroke, -stroke],
      });
    case "stumble": {
      const lurch = [3, -4, 2, -1][index] ?? 0;
      return balance({
        summit: [lurch * 2, 4],
        heart: [-lurch, 2],
        shard: [lurch, -1],
        strike: true,
      });
    }
    case "blocked": {
      const shift = index === 2 || index === 6 ? 1 : 0;
      return [
        ...balance({ summit: [6 + shift, 5], level: true, heart: [-3, 2], shard: [4 - shift, 1] }),
        place(fault, { dx: 1, dy: 2, outline: false }),
      ];
    }
    case "nap":
      return balance({
        summit: [-1, 12 + (index === 1 ? 1 : 0)],
        level: true,
        heart: [-1, 7],
        low: true,
        shard: [2, 2],
      });
    case "stretch": {
      const lifted = index === 1 || index === 2;
      return balance({
        summit: [lifted ? 2 : 0, lifted ? -2 : -1],
        heart: [0, lifted ? -1 : 0],
        shard: [-1, 1],
      });
    }
    case "look": {
      const direction = attentionDirections[index] ?? [0, 0];
      return balance({
        summit: direction,
        heart: [Math.sign(direction[0]), Math.sign(direction[1])],
      });
    }
    case "wave":
      return balance({
        summit: [1, -1],
        heart: [-1, -1],
        shard: [index % 2 === 0 ? 7 : 3, -2 - (index % 2)],
        strike: true,
      });
    case "greet": {
      const bowed = index === 1 || index === 2;
      return balance({
        summit: [bowed ? 4 : 1, bowed ? 4 : 0],
        level: bowed,
        heart: [-1, bowed ? 2 : 0],
        shard: [1, 1],
      });
    }
    case "raise":
      return balance({
        summit: [0, 12 - index * 2],
        level: index < 3,
        heart: [0, 8 - index],
        low: index < 4,
        shard: [0, 2 - Math.floor(index / 3)],
      });
    case "sit":
      return balance({
        summit: [-1, 9 + (index === 1 ? 1 : 0)],
        level: true,
        heart: [1, 6],
        low: true,
        shard: [-1, 1],
      });
  }
}

function balance(stones: Balance): Placement[] {
  return [
    drift(stones.strike ? tiltedShard : shard, stones.shard),
    drift(stones.low ? lowHeart : heart, stones.heart),
    drift(stones.level ? levelSummit : summit, stones.summit),
  ];
}

function drift(stone: Part, [dx, dy]: Offset = [0, 0]): Placement {
  return place(stone, { dx, dy });
}
