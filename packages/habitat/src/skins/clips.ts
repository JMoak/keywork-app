import type { PoseName } from "../pose/skin.ts";

export interface Clip {
  readonly beats: readonly number[];
  readonly beatMs: number;
  readonly mirrored?: boolean;
}

export const sheetBeatMs = 250;
export const turnBeatMs = 500;
export const posesInASheet = 12;
export const turnsInASheet = 8;
export const framesInAnArt = posesInASheet * 2 + turnsInASheet;

export const gazeTurns: readonly number[] = [6, 7, 0, 1, 2, 3, 4, 5];

export const sheetClips: Readonly<Record<PoseName, Clip>> = {
  idle: firstSheet(0, 0, 0, 0, 1, 0, 0, 0, 2, 2, 0, 0, 3, 3, 3, 0),
  work: firstSheet(8, 8, 9, 9, 8, 8, 9, 9, 0, 0),
  hammer: firstSheet(8, 8, 9, 9, 8, 8, 9, 9),
  read: secondSheet(0),
  carve: secondSheet(2, 2, 3, 3),
  "walk-left": firstSheet(4, 5, 6, 7),
  "walk-right": { ...firstSheet(4, 5, 6, 7), mirrored: true },
  carry: secondSheet(4, 5),
  deliver: secondSheet(4, 5, 4, 5, 6, 6, 6, 6),
  ring: secondSheet(7),
  wait: secondSheet(8),
  celebrate: secondSheet(9, 9, 8, 8),
  stumble: secondSheet(10),
  blocked: secondSheet(11),
  nap: firstSheet(11),
  stretch: firstSheet(2, 2, 2, 0),
  look: { beats: gazeTurns.map((turn) => posesInASheet * 2 + turn), beatMs: turnBeatMs },
  wave: firstSheet(0, 10, 10, 0, 10, 10, 0, 0),
  greet: firstSheet(0, 10, 10, 0, 10, 10, 0, 0),
  raise: firstSheet(2, 2, 10, 10, 10, 10, 0, 0),
  sit: secondSheet(1),
};

function firstSheet(...beats: number[]): Clip {
  return { beats, beatMs: sheetBeatMs };
}

function secondSheet(...beats: number[]): Clip {
  return { beats: beats.map((beat) => posesInASheet + beat), beatMs: sheetBeatMs };
}
