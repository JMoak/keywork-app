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
import { compose, groundLine, type Placement, place } from "../kid/cell.ts";
import type { Part } from "../kid/sprite.ts";
import {
  leafDragon as dragon,
  type Offset,
  sleepingDragon,
  type LeafPosture as Wing,
} from "./anatomy.ts";
import {
  bell,
  bellStand,
  foldedSheet,
  page,
  proof,
  seal,
  slip,
  splint,
  uprightSheet,
} from "./parts.ts";

export const folioCharacter = {
  name: "Folio",
  nature: "Quiet and curious, with leaf wings and a long curled tail.",
  signature: "Its wings unfurl a leaf at a time. The curled tip of its tail rises a beat later.",
  working: "Holds down a sheet with one claw and presses a crease with its snout.",
  waiting: "Lifts both leaves and holds one small claw off the ground.",
  blocked: "Draws its chin beneath a bent leaf. A small tear catches at the fold.",
  resting: "Draws its leaves into a low shelter and tucks its chin under the rim.",
} as const;

export const folioRows: Readonly<Record<PoseName, Row>> = {
  ...referenceRows,
  idle: loop(2100, 105, 390, 620, 340, 1700),
  work: loop(520, 200, 180, 310, 170, 490),
  hammer: loop(620, 170, 100, 95, 380, 240),
  read: loop(1200, 440, 190, 860),
  carve: loop(540, 200, 185, 170, 310, 420),
  "walk-left": loop(130, 110, 110, 145, 130, 110, 110, 145),
  "walk-right": loop(130, 110, 110, 145, 130, 110, 110, 145),
  carry: loop(230, 165, 155, 220, 165, 155),
  wait: loop(1600, 370, 520, 105, 390, 1500),
  blocked: loop(1700, 150, 240, 620, 1300, 230, 320, 800),
  nap: loop(2850, 560, 1000, 1700),
  sit: loop(1800, 650, 120, 1150),
};

export function folioSkin(): Skin {
  const frames = Object.fromEntries(
    poseNames.map((pose) => [
      pose,
      Array.from({ length: folioRows[pose].frames }, (_, index) => folioFrame(pose, index)),
    ]),
  ) as Record<PoseName, Uint8Array[]>;
  return {
    id: "folio",
    displayName: folioCharacter.name,
    material: "leaf",
    cell: defaultCell,
    atlas: assembleAtlas(defaultCell, frames),
    palette: defaultPaletteRoles,
    rows: folioRows,
    groundLine,
    gaze: { row: poseNames.indexOf("look"), directions: 8 },
  };
}

export function folioFrame(pose: PoseName, index: number): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= folioRows[pose].frames)
    throw new RangeError(`${pose} has ${folioRows[pose].frames} Folio frames, not ${index}`);
  const drawing =
    pose === "nap"
      ? sleepingDragon(index === 1 || index === 2)
      : animation(pose === "walk-right" ? "walk-left" : pose, index);
  const indices = compose(drawing);
  return pose === "walk-left" ? indices : mirrorFrame({ ...defaultCell, indices }).indices;
}

const compass: readonly Offset[] = [
  [3, 0],
  [2, 2],
  [0, 3],
  [-2, 2],
  [-3, 0],
  [-2, -2],
  [0, -3],
  [2, -2],
];

function animation(pose: Exclude<PoseName, "walk-right" | "nap">, i: number): Placement[] {
  switch (pose) {
    case "idle":
      return dragon({
        wing: i === 2 || i === 3 ? "ease" : "bound",
        eye: i === 1 ? "closed" : "open",
        tail: i === 3 ? -1 : 0,
      });
    case "work": {
      const press = beat(i, 0, 2, 4, 5, 3, 0);
      return [
        ...dragon({
          wing: "low",
          bodyY: 1,
          head: [-4, 13 + press],
          fore: [-4, 0],
          tail: press > 3 ? -2 : 0,
        }),
        at(i === 2 || i === 3 ? proof : foldedSheet),
      ];
    }
    case "hammer": {
      const strike = beat(i, 0, -2, -4, 4, 4, 1);
      return [
        ...dragon({
          wing: i === 2 ? "ease" : "sweep",
          bodyY: 1,
          head: [-3, 12 + strike],
          fore: [-2, 0],
        }),
        at(proof),
        at(seal, 0, strike - 1),
      ];
    }
    case "read":
      return [
        ...dragon({
          wing: "bound",
          head: [i === 1 || i === 2 ? -3 : -1, 8],
          claw: true,
          tucked: true,
        }),
        at(page, 0, i === 2 ? -1 : 0),
      ];
    case "carve": {
      const sweep = beat(i, 0, -1, -2, -3, -2, 0);
      return [
        ...dragon({ wing: "low", head: [sweep, 12], claw: true, fore: [sweep - 2, 4] }),
        at(foldedSheet),
      ];
    }
    case "walk-left": {
      const step = beat(i, -2, -1, 1, 2, 2, 1, -1, -2);
      const up = beat(i, 0, 1, 2, 1, 0, 0, 0, 0);
      const back = beat(i, 0, 0, 0, 0, 0, 1, 2, 1);
      return dragon({
        wing: i % 4 === 2 ? "ease" : "bound",
        bodyY: i % 4 === 2 ? -1 : 0,
        head: [-1, 1],
        fore: [step, -up],
        hind: [-step, -back],
        tail: -back,
      });
    }
    case "carry": {
      const step = beat(i, 0, -2, -1, 0, 2, 1);
      const nod = Math.abs(step) === 2 ? -1 : 0;
      return [
        ...dragon({
          wing: "sweep",
          head: [0, nod],
          fore: [step, step < 0 ? -1 : 0],
          hind: [-step, step > 0 ? -1 : 0],
        }),
        at(slip, 4, nod - 6),
      ];
    }
    case "deliver": {
      const bow = beat(i, 2, 5, 9, 12, 7, 1);
      return [
        ...dragon({ wing: i < 4 ? "sweep" : "ease", head: [0, bow], claw: true, fore: [-1, 2] }),
        at(slip, 4, beat(i, -4, -1, 3, 7, 14, 14)),
      ];
    }
    case "ring": {
      const peck = beat(i, -1, 3, 0, -2);
      return [
        at(bellStand),
        ...dragon({ wing: "listening", head: [-4, 6 + peck], claw: true }),
        at(bell, i === 1 ? -1 : 0, i === 2 ? 1 : 0),
      ];
    }
    case "wait":
      return dragon({
        wing: "listening",
        wingY: i === 1 || i === 2 ? -1 : 0,
        bodyY: -1,
        head: [1, -3],
        claw: true,
        fore: [0, -1],
        eye: i === 3 ? "closed" : "open",
      });
    case "celebrate": {
      const jump = beat(i, 0, 2, 5, 3, 0, 0);
      const fan: Wing[] = ["low", "listening", "spread", "sweep", "low", "bound"];
      return dragon({
        wing: fan[i] ?? "bound",
        bodyY: -jump,
        head: [0, -1],
        fore: [1, -jump],
        hind: [-1, -jump],
        tail: -1,
      });
    }
    case "stumble":
      return [
        ...dragon({
          wing: i < 2 ? "buckled" : "low",
          head: [i === 1 ? -2 : 1, beat(i, 8, 10, 8, 6)],
          fore: [-3, 0],
          hind: [i < 2 ? 2 : 0, 0],
        }),
        at(i === 1 ? proof : foldedSheet),
      ];
    case "blocked":
      return [
        ...dragon({
          wing: "buckled",
          bodyY: 2,
          head: [2, 7 + beat(i, 0, 1, 1, 0, 0, -1, 0, 0)],
          eye: "troubled",
          tucked: true,
          fore: [2, 0],
          hind: [-2, 0],
        }),
        at(splint, 0, i === 5 ? -1 : 0),
      ];
    case "stretch":
      return dragon({
        wing: i === 0 || i === 3 ? "sweep" : "spread",
        head: [-3, i === 2 ? 5 : 3],
        fore: [-5, 0],
        hind: [2, 0],
        eye: "closed",
      });
    case "look": {
      const [x, y] = compass[i] as Offset;
      return dragon({ head: [-x, y] });
    }
    case "wave":
      return dragon({
        wing: i === 1 || i === 3 ? "spread" : "listening",
        claw: true,
        head: [0, -1],
        fore: [0, -1 - (i % 2)],
      });
    case "greet":
      return dragon({
        wing: i === 1 || i === 2 ? "ease" : "bound",
        head: [0, beat(i, 1, 4, 6, 2)],
        eye: i === 2 ? "closed" : "open",
        claw: true,
      });
    case "raise": {
      const wing: Wing[] = ["low", "low", "sweep", "bound", "ease", "listening", "bound", "bound"];
      return [
        ...dragon({
          wing: wing[i] ?? "bound",
          head: [-2, beat(i, 15, 13, 11, 9, 7, 4, 2, 0)],
          claw: i < 6,
        }),
        at(i < 2 ? proof : i < 4 ? foldedSheet : uprightSheet),
      ];
    }
    case "sit":
      return dragon({
        wing: "low",
        bodyY: 3,
        head: [1, i === 1 ? 2 : 3],
        tucked: true,
        fore: [1, 0],
        hind: [-3, 0],
        eye: i === 2 ? "closed" : "open",
      });
  }
}

function at(part: Part, dx = 0, dy = 0): Placement {
  return place(part, { dx, dy });
}

function beat(index: number, ...values: number[]): number {
  return values[index] as number;
}

function loop(...ms: number[]): Row {
  return { frames: ms.length, ms, loop: true };
}
