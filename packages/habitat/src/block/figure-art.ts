export interface FigureArt {
  readonly name: string;
  readonly hover: number;
  readonly rows: readonly string[];
  readonly turns: readonly (readonly string[])[];
}

export const figureNames = [
  "cairn",
  "tessera",
  "folio",
  "purl",
  "hush",
  "knot",
  "beaver",
  "newfie",
  "hippo",
] as const;

export type FigureName = (typeof figureNames)[number];

export const aspects = [
  "front",
  "front-left",
  "left",
  "back-left",
  "back",
  "back-right",
  "right",
  "front-right",
] as const;

export type Aspect = (typeof aspects)[number];

export const front = 0;

export const hovers: Readonly<Partial<Record<FigureName, number>>> = { cairn: 2 };

export function figureArt(name: FigureName, turns: readonly (readonly string[])[]): FigureArt {
  if (turns.length !== aspects.length) {
    throw new Error(`${name} is drawn from ${turns.length} directions, not ${aspects.length}`);
  }
  return { name, hover: hovers[name] ?? 0, rows: turns[front] ?? [], turns };
}
