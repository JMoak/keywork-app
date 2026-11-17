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
import { chisel, fault, foundation, heart, page, parcel, summit, workpiece } from "./parts.ts";

export const cairnCharacter = {
  name: "Cairn",
  nature: "Patient, deliberate, unexpectedly playful.",
  signature: "Three stones find their own balance; the smallest is always a little curious.",
  working: "The foundation steadies while the summit becomes a careful counterweight or pestle.",
  waiting: "Opens the gaps between its stones and inclines the summit toward the keeper.",
  blocked: "Loses alignment, gathers into a crooked stack and exposes a broken seam.",
  resting: "Settles the three stones into one low, quiet mound.",
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
    displayName: "Cairn",
    cell: defaultCell,
    atlas: assembleAtlas(defaultCell, frames),
    palette: defaultPaletteRoles,
    rows: cairnRows,
    groundLine: 51,
  };
}

export function cairnFrame(pose: PoseName, index: number): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= cairnRows[pose].frames)
    throw new RangeError(`${pose} has ${cairnRows[pose].frames} Cairn frames, not ${index}`);
  if (pose === "walk-right")
    return mirrorFrame({ ...defaultCell, indices: cairnFrame("walk-left", index) }).indices;
  return compose(arrangement(pose, index));
}

interface Balance {
  readonly foundation?: readonly [x: number, y: number];
  readonly heart?: readonly [x: number, y: number];
  readonly summit?: readonly [x: number, y: number];
}

const orbit = [0, -1, -2, -1, 0, 1, 2, 1] as const;
const reach = [0, 1, 3, 4, 2, 0] as const;
const attentionDirections = [
  [4, 0],
  [3, 2],
  [0, 3],
  [-3, 2],
  [-4, 0],
  [-3, -2],
  [0, -3],
  [3, -2],
] as const;

function arrangement(pose: PoseName, index: number): Placement[] {
  const phase = reach[index % reach.length] ?? 0;
  switch (pose) {
    case "idle":
      return balance({
        heart: [index === 2 || index === 3 ? -1 : 0, index === 1 ? 1 : 0],
        summit: [index === 3 ? 1 : 0, index === 2 ? -1 : 0],
      });
    case "work":
      return [...balance({ heart: [-3, 2], summit: [7, 8 + phase * 2] }), place(workpiece)];
    case "hammer":
      return [...balance({ heart: [-4, 3], summit: [10, 5 + phase * 3] }), place(workpiece)];
    case "read":
      return [
        ...balance({ heart: [-3, 2], summit: [index === 2 ? 1 : -1, 5] }),
        place(page, { dy: index === 1 || index === 2 ? -1 : 0 }),
      ];
    case "carve":
      return [
        ...balance({ heart: [-2, 3], summit: [8, 10 + phase] }),
        place(workpiece),
        place(chisel, { dx: phase % 2, dy: phase - 1 }),
      ];
    case "walk-left":
      return balance({
        foundation: [orbit[index] ?? 0, index % 4 < 2 ? -1 : 0],
        heart: [-2 - (orbit[(index + 2) % 8] ?? 0), -1],
        summit: [-4 - (orbit[(index + 4) % 8] ?? 0), index % 4 < 2 ? 0 : -1],
      });
    case "walk-right":
      return balance();
    case "carry":
      return [
        ...balance({ heart: [-1, -2], summit: [1, -3 + (index === 2 ? -1 : 0)] }),
        place(parcel, { dy: index === 1 || index === 4 ? 1 : 0 }),
      ];
    case "deliver":
      return [
        ...balance({ heart: [-2 + Math.min(index, 3), -3], summit: [Math.min(index, 4), -2] }),
        place(parcel, { dx: Math.min(index * 3, 13), dy: Math.min(index * 2, 8) }),
      ];
    case "ring":
      return balance({ heart: [-2, -1], summit: [index % 2 === 0 ? 6 : 3, -4] });
    case "wait":
      return balance({ heart: [-3, -1], summit: [3 + (phase > 2 ? 1 : 0), -5] });
    case "celebrate":
      return balance({
        foundation: [0, phase > 2 ? -2 : 0],
        heart: [-phase, -2],
        summit: [phase + 2, -3 - Math.floor(phase / 2)],
      });
    case "stumble":
      return balance({
        heart: [index % 2 === 0 ? -5 : 3, 4],
        summit: [index % 2 === 0 ? 4 : -3, 8],
      });
    case "blocked":
      return [
        ...balance({ heart: [-3, 5], summit: [index === 2 || index === 6 ? 5 : 4, 9] }),
        place(fault, { dx: -2 }),
      ];
    case "nap":
      return balance({
        foundation: [0, 2],
        heart: [-1, 11],
        summit: [0, 17 + (index === 1 ? 1 : 0)],
      });
    case "stretch":
      return balance({
        heart: [0, index === 1 || index === 2 ? -3 : -1],
        summit: [0, index === 1 || index === 2 ? -6 : -3],
      });
    case "look": {
      const direction = attentionDirections[index] ?? [0, 0];
      return balance({
        heart: [Math.sign(direction[0]), Math.sign(direction[1])],
        summit: direction,
      });
    }
    case "wave":
      return balance({ heart: [-2, -1], summit: [index % 2 === 0 ? 6 : 2, -2 - (index % 2)] });
    case "greet":
      return balance({
        heart: [0, index === 1 || index === 2 ? 1 : 0],
        summit: [2, index === 1 || index === 2 ? 4 : 0],
      });
    case "raise":
      return balance({
        heart: [0, 5 - Math.min(index, 7)],
        summit: [0, 12 - Math.min(index, 7) * 2],
      });
    case "sit":
      return balance({
        foundation: [0, 2],
        heart: [0, 7],
        summit: [0, 10 + (index === 1 ? 1 : 0)],
      });
  }
}

function balance(offsets: Balance = {}): Placement[] {
  const baseOffset = offsets.foundation ?? [0, 0];
  const heartOffset = offsets.heart ?? [0, 0];
  const summitOffset = offsets.summit ?? [0, 0];
  return [
    place(foundation, { dx: baseOffset[0], dy: baseOffset[1] }),
    place(heart, { dx: heartOffset[0], dy: heartOffset[1] }),
    place(summit, { dx: summitOffset[0], dy: summitOffset[1] }),
  ];
}
