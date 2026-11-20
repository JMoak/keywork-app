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
import {
  chisel,
  crown,
  fault,
  frontPlate,
  leftPlate,
  leg,
  page,
  parcel,
  underside,
  workpiece,
} from "./parts.ts";

export const tesseraCharacter = {
  name: "Tessera",
  nature: "Careful, attentive, quietly industrious.",
  signature: "Adjusts a shell panel before settling; moves in coordinated tripods.",
  working: "Braces four feet while the front pair shapes or holds the work.",
  waiting: "Raises the crown panel and holds one foreleg toward the keeper.",
  blocked: "Closes the shell and gathers its legs beneath a visible broken seam.",
  resting: "Tucks all six feet under the porcelain shell.",
} as const;

export const tesseraRows: Readonly<Record<PoseName, Row>> = {
  ...referenceRows,
  idle: { frames: 6, ms: [1760, 560, 720, 880, 720, 2000], loop: true },
  work: { frames: 6, ms: [180, 180, 100, 260, 180, 360], loop: true },
  read: { frames: 4, ms: [640, 400, 440, 920], loop: true },
  wait: { frames: 6, ms: [1100, 380, 460, 500, 380, 1400], loop: true },
  blocked: { frames: 8, ms: [920, 200, 200, 360, 920, 200, 200, 1000], loop: true },
  nap: { frames: 4, ms: [2400, 1800, 1800, 3000], loop: true },
  sit: { frames: 4, ms: [1600, 800, 800, 2200], loop: true },
};

export function tesseraSkin(): Skin {
  const frames = Object.fromEntries(
    poseNames.map((pose) => [
      pose,
      Array.from({ length: tesseraRows[pose].frames }, (_, index) => tesseraFrame(pose, index)),
    ]),
  ) as Record<PoseName, Uint8Array[]>;
  return {
    id: "tessera",
    displayName: "Tessera",
    cell: defaultCell,
    atlas: assembleAtlas(defaultCell, frames),
    palette: defaultPaletteRoles,
    material: "porcelain",
    rows: tesseraRows,
    groundLine: 51,
  };
}

export function tesseraFrame(pose: PoseName, index: number): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= tesseraRows[pose].frames)
    throw new RangeError(`${pose} has ${tesseraRows[pose].frames} Tessera frames, not ${index}`);
  if (pose === "walk-right") {
    return mirrorFrame({ ...defaultCell, indices: tesseraFrame("walk-left", index) }).indices;
  }
  return compose(arrangement(pose, index));
}

interface Stance {
  readonly lift?: number;
  readonly spread?: number;
  readonly fold?: number;
  readonly stride?: number;
  readonly tripod?: number;
  readonly crownLift?: number;
  readonly attention?: readonly [x: number, y: number];
  readonly panelSpread?: number;
  readonly lean?: number;
  readonly foreleg?: "rest" | "reach" | "listen" | "wave" | "tap";
  readonly gesture?: number;
  readonly closed?: boolean;
}

const sway = [0, -1, -2, -1, 0, 1, 2, 1] as const;
const liftBeat = [0, 1, 2, 2, 1, 0] as const;
const attentionDirections = [
  [3, 0],
  [2, 2],
  [0, 3],
  [-2, 2],
  [-3, 0],
  [-2, -2],
  [0, -3],
  [2, -2],
] as const;

function arrangement(pose: PoseName, index: number): Placement[] {
  const phase = liftBeat[index % liftBeat.length] ?? 0;
  switch (pose) {
    case "idle":
      return body({
        crownLift: index === 2 || index === 3 ? 1 : 0,
        panelSpread: index === 1 ? 1 : 0,
      });
    case "work":
      return [
        ...body({ lift: -1, spread: 1, panelSpread: 1, foreleg: "tap", gesture: phase }),
        place(workpiece),
      ];
    case "hammer":
      return [...body({ spread: 2, foreleg: "tap", gesture: phase * 3 }), place(workpiece)];
    case "read":
      return [
        ...body({ lean: index === 1 || index === 2 ? 1 : 0, foreleg: "reach", crownLift: 2 }),
        place(page, { dx: -3, dy: -1 + (index === 2 ? -1 : 0) }),
      ];
    case "carve":
      return [
        ...body({ spread: 1, foreleg: "reach", gesture: phase, panelSpread: 1 }),
        place(workpiece),
        place(chisel, { dx: phase - 1, dy: 2 }),
      ];
    case "walk-left":
      return body({ stride: sway[index] ?? 0, tripod: index, lean: -1 });
    case "walk-right":
      return body();
    case "carry":
      return [
        ...body({ lift: -2, stride: phase - 1, tripod: index, foreleg: "reach" }),
        place(parcel, { dy: -1 }),
      ];
    case "deliver":
      return [
        ...body({ lift: -phase, foreleg: "reach", gesture: index, panelSpread: 1 }),
        place(parcel, { dx: index < 3 ? index * 2 : 6, dy: Math.min(index * 2, 8) }),
      ];
    case "ring":
      return body({ foreleg: "wave", gesture: index % 2 === 0 ? 0 : 4, crownLift: 2 });
    case "wait":
      return body({ lift: 1, foreleg: "listen", crownLift: 3, gesture: phase });
    case "celebrate":
      return body({ lift: phase * 2, spread: 2, crownLift: phase + 2, panelSpread: phase });
    case "stumble":
      return body({ lift: -2, lean: index % 2 === 0 ? -2 : 2, fold: 2, crownLift: 1 });
    case "blocked":
      return [
        ...body({ lift: -6, fold: index === 2 || index === 6 ? 5 : 4, closed: true }),
        place(fault, { dy: 6 }),
      ];
    case "nap":
      return body({
        lift: -11,
        fold: 10,
        closed: true,
        crownLift: index === 1 || index === 2 ? 1 : 0,
      });
    case "stretch":
      return body({ lift: index === 1 || index === 2 ? 5 : 2, spread: 3, crownLift: 2 });
    case "look":
      return body({ attention: attentionDirections[index] ?? [0, 0] });
    case "wave":
      return body({ foreleg: "wave", gesture: index % 2 === 0 ? 1 : 5, crownLift: 1 });
    case "greet":
      return body({
        lift: index === 1 || index === 2 ? 3 : 0,
        foreleg: "listen",
        crownLift: index,
      });
    case "raise":
      return body({
        lift: Math.min(index, 4),
        spread: 2,
        crownLift: Math.min(index, 3),
        panelSpread: index < 5 ? 1 : 0,
      });
    case "sit":
      return body({ lift: -6, fold: 6, crownLift: index === 1 ? 2 : 1 });
  }
}

function body(stance: Stance = {}): Placement[] {
  const lift = stance.lift ?? 0;
  const spread = stance.spread ?? 0;
  const fold = stance.fold ?? 0;
  const lean = stance.lean ?? 0;
  const stride = stance.stride ?? 0;
  const trip = stance.tripod ?? 0;
  const crownLift = stance.crownLift ?? 0;
  const [attentionX, attentionY] = stance.attention ?? [0, 0];
  const panelSpread = stance.panelSpread ?? 0;
  const gesture = stance.gesture ?? 0;
  const tuck = Math.max(0, fold - 3);
  const raised = (offset: number): number => (trip === 0 ? 0 : (trip + offset) % 8 < 4 ? 2 : 0);
  const roots = [
    [12, 32],
    [35, 34],
    [16, 34],
    [31, 35],
    [21, 35],
    [26, 35],
  ] as const;
  const knees = [
    [7 - spread + fold, 40 - lift - tuck],
    [40 + spread - fold, 41 - lift - tuck],
    [12 - spread + fold, 42 - lift - tuck],
    [36 + spread - fold, 42 - lift - tuck],
    [20 - spread + Math.floor(fold / 2), 41 - lift - tuck],
    [28 + spread - Math.floor(fold / 2), 42 - lift - tuck],
  ] as [number, number][];
  const feet = [
    [6 - spread + fold + stride, 48 - raised(0)],
    [42 + spread - fold + stride, 48 - raised(4)],
    [12 - spread + fold - stride, 49 - raised(4)],
    [36 + spread - fold - stride, 49 - raised(0)],
    [19 + Math.floor(fold / 2) + stride, 46 - raised(0)],
    [29 - Math.floor(fold / 2) + stride, 49 - raised(4)],
  ] as [number, number][];
  const leftFront = feet[4] as [number, number];
  const rightFront = feet[5] as [number, number];
  switch (stance.foreleg) {
    case "reach":
      leftFront[0] = 20 + gesture;
      leftFront[1] = 39;
      rightFront[0] = 33 + Math.min(gesture, 4);
      rightFront[1] = 39;
      break;
    case "listen":
      knees[5] = [37, 38 - lift];
      rightFront[0] = 41;
      rightFront[1] = 29 - gesture;
      break;
    case "wave":
      knees[5] = [38, 37 - lift];
      rightFront[0] = 40 - Math.floor(gesture / 2);
      rightFront[1] = 20 + gesture;
      break;
    case "tap":
      rightFront[0] = 33;
      rightFront[1] = 38 - gesture;
      leftFront[0] = 26;
      leftFront[1] = 42;
      break;
  }
  const legs = roots.map(([x, y], index) =>
    leg(
      `tessera leg ${index}`,
      [
        [x + lean, y - lift],
        knees[index] as readonly [number, number],
        feet[index] as readonly [number, number],
      ],
      index === 2 || index === 3 || index === 5,
    ),
  );
  const dy = -lift;
  const raisedForeleg =
    stance.foreleg === "listen" || stance.foreleg === "wave" || stance.foreleg === "tap";
  return [
    ...legs.slice(0, 4),
    place(underside, { dx: lean, dy, layer: "behind" }),
    ...legs.slice(4, raisedForeleg ? 5 : 6),
    place(crown, { dx: lean + attentionX, dy: dy - crownLift + attentionY }),
    place(leftPlate, { dx: lean - panelSpread, dy: dy + (stance.closed ? 1 : 0) }),
    place(frontPlate, {
      dx: lean + (stance.closed ? -2 : panelSpread) + Math.trunc(attentionX / 2),
      dy,
    }),
    ...(raisedForeleg ? legs.slice(5).map((limb) => ({ ...limb, layer: "front" as const })) : []),
  ];
}
