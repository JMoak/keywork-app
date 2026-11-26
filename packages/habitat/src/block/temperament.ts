export const temperaments = ["calm", "brisk", "eager", "playful", "decisive", "tentative"] as const;

export type Temperament = (typeof temperaments)[number];

export const plainTemperament: Temperament = "brisk";

export interface Manner {
  readonly breath: ((plain: number) => readonly number[]) | undefined;
  readonly gait: readonly number[] | undefined;
  readonly dawdle: (turn: number) => number;
  readonly road: number;
  readonly nearer: number;
  readonly bounces: boolean;
}

export const turnsToDawdle = 8;

export function temperamentOf(word: string | undefined): Temperament {
  return temperaments.find((known) => known === word) ?? plainTemperament;
}

export function mannerOf(temperament: Temperament | undefined): Manner {
  return manners[temperament ?? plainTemperament];
}

const inTurn = (turn: number): number => turn;
const atOnce = (): number => 0;

const manners: Readonly<Record<Temperament, Manner>> = {
  calm: {
    breath: (plain) => held(plain * 2, plain * 2),
    gait: [2],
    dawdle: (turn) => turn + turnsToDawdle,
    road: 0.7,
    nearer: 0,
    bounces: true,
  },
  brisk: {
    breath: undefined,
    gait: undefined,
    dawdle: inTurn,
    road: 1,
    nearer: 0,
    bounces: true,
  },
  eager: {
    breath: () => held(3, 3),
    gait: [5],
    dawdle: atOnce,
    road: 1.35,
    nearer: 2,
    bounces: true,
  },
  playful: {
    breath: () => [1, 0, 1, 0, 0, 0, 0, 0],
    gait: [5, 5, 1],
    dawdle: (turn) => (turn * 3 + 5) % turnsToDawdle,
    road: 1.15,
    nearer: 0,
    bounces: true,
  },
  decisive: {
    breath: (plain) => held(plain * 3, 2),
    gait: [4],
    dawdle: atOnce,
    road: 1.2,
    nearer: 0,
    bounces: true,
  },
  tentative: {
    breath: (plain) => [...held(plain, 1), ...held(plain * 2, 2)],
    gait: [2, 2, 2, 2, 0, 0, 0, 0],
    dawdle: (turn) => turn + turnsToDawdle / 2,
    road: 0.8,
    nearer: 0,
    bounces: false,
  },
};

function held(down: number, up: number): number[] {
  return [...Array<number>(down).fill(0), ...Array<number>(up).fill(1)];
}
