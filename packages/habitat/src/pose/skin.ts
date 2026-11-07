export const poseNames = [
  "idle",
  "work",
  "hammer",
  "read",
  "carve",
  "walk-left",
  "walk-right",
  "carry",
  "deliver",
  "ring",
  "wait",
  "celebrate",
  "stumble",
  "blocked",
  "nap",
  "stretch",
  "look",
  "wave",
  "greet",
  "raise",
  "sit",
] as const;

export type PoseName = (typeof poseNames)[number];

export interface Row {
  readonly frames: number;
  readonly ms: readonly number[];
  readonly loop: boolean;
  readonly fallback?: PoseName;
}

export interface IndexedBitmap {
  readonly width: number;
  readonly height: number;
  readonly indices: Uint8Array;
}

export interface PaletteRoles {
  readonly identity: readonly number[];
  readonly ground: readonly number[];
  readonly outline: number;
  readonly accent: readonly number[];
}

export interface Skin {
  readonly id: string;
  readonly displayName: string;
  readonly cell: { readonly width: number; readonly height: number };
  readonly atlas: IndexedBitmap;
  readonly palette: PaletteRoles;
  readonly rows: Readonly<Record<PoseName, Row>>;
  readonly groundLine: number;
  readonly gaze?: { readonly row: number; readonly directions: 8 | 16 };
}

export const paletteIndexLimit = 16;

export const defaultPaletteRoles: PaletteRoles = {
  identity: [1, 2, 3, 4],
  ground: [5, 6, 7, 8],
  outline: 9,
  accent: [10, 11, 12],
};

export const defaultCell = { width: 48, height: 52 } as const;

export const referenceRows: Readonly<Record<PoseName, Row>> = {
  idle: { frames: 6, ms: [1680, 660, 660, 840, 840, 1920], loop: true },
  work: { frames: 6, ms: cycle(6, 120, 220), loop: true },
  hammer: { frames: 6, ms: cycle(6, 120, 220), loop: true },
  read: { frames: 4, ms: cycle(4, 300, 560), loop: true },
  carve: { frames: 6, ms: cycle(6, 120, 220), loop: true },
  "walk-left": { frames: 8, ms: cycle(8, 120, 220), loop: true },
  "walk-right": { frames: 8, ms: cycle(8, 120, 220), loop: true },
  carry: { frames: 6, ms: cycle(6, 120, 220), loop: true },
  deliver: { frames: 6, ms: cycle(6, 150, 280), loop: false, fallback: "idle" },
  ring: { frames: 4, ms: cycle(4, 140, 280), loop: false, fallback: "wait" },
  wait: { frames: 6, ms: cycle(6, 150, 260), loop: true },
  celebrate: { frames: 6, ms: cycle(6, 150, 280), loop: false, fallback: "idle" },
  stumble: { frames: 4, ms: cycle(4, 140, 240), loop: false, fallback: "work" },
  blocked: { frames: 8, ms: cycle(8, 140, 240), loop: true },
  nap: { frames: 4, ms: cycle(4, 900, 1800), loop: true },
  stretch: { frames: 4, ms: cycle(4, 140, 280), loop: false, fallback: "idle" },
  look: { frames: 8, ms: cycle(8, 600, 600), loop: true },
  wave: { frames: 4, ms: cycle(4, 140, 280), loop: false, fallback: "idle" },
  greet: { frames: 4, ms: cycle(4, 140, 280), loop: false, fallback: "idle" },
  raise: { frames: 8, ms: cycle(8, 180, 360), loop: false, fallback: "idle" },
  sit: { frames: 4, ms: cycle(4, 1200, 2400), loop: true },
};

export const directionRows: ReadonlySet<PoseName> = new Set<PoseName>(["look"]);

export function rowDuration(row: Row): number {
  return row.ms.reduce((sum, hold) => sum + hold, 0);
}

export function fallbackOf(rows: Readonly<Record<PoseName, Row>>, name: PoseName): PoseName {
  return rows[name].loop ? name : (rows[name].fallback ?? "idle");
}

export function validateRows(rows: Readonly<Record<PoseName, Row>>): string[] {
  return poseNames.flatMap((name) => rowFaults(rows, name));
}

export function validateSkin(skin: Skin): string[] {
  const faults = validateRows(skin.rows);
  const columns = Math.max(...poseNames.map((name) => skin.rows[name].frames));
  if (skin.atlas.width !== skin.cell.width * columns) {
    faults.push(`atlas width ${skin.atlas.width} is not ${columns} cells of ${skin.cell.width}`);
  }
  if (skin.atlas.height !== skin.cell.height * poseNames.length) {
    faults.push(
      `atlas height ${skin.atlas.height} is not ${poseNames.length} rows of ${skin.cell.height}`,
    );
  }
  if (skin.atlas.indices.length !== skin.atlas.width * skin.atlas.height) {
    faults.push(
      `atlas holds ${skin.atlas.indices.length} indices for a ${skin.atlas.width}x${skin.atlas.height} grid`,
    );
  }
  if (skin.atlas.indices.some((index) => index >= paletteIndexLimit)) {
    faults.push(`atlas uses a palette index at or above ${paletteIndexLimit}`);
  }
  if (skin.groundLine <= 0 || skin.groundLine > skin.cell.height) {
    faults.push(`ground line ${skin.groundLine} is outside the cell`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skin.id))
    faults.push(`skin id ${skin.id} is not kebab-case`);
  return faults;
}

function rowFaults(rows: Readonly<Record<PoseName, Row>>, name: PoseName): string[] {
  const row = rows[name];
  const faults: string[] = [];
  if (row.frames < 1) faults.push(`${name}: a row needs at least one frame`);
  if (row.ms.length !== row.frames) {
    faults.push(`${name}: ${row.ms.length} timings for ${row.frames} frames`);
  }
  if (row.ms.some((hold) => !(hold > 0) || !Number.isFinite(hold))) {
    faults.push(`${name}: every frame holds a positive finite time`);
  }
  if (!row.loop && row.fallback === undefined)
    faults.push(`${name}: a one-shot names its fallback`);
  if (row.fallback !== undefined && rows[row.fallback] === undefined) {
    faults.push(`${name}: fallback ${row.fallback} is not a row`);
  }
  if (!row.loop && row.fallback !== undefined && !fallbackChainSettles(rows, name)) {
    faults.push(`${name}: its fallbacks never reach a loop`);
  }
  return faults;
}

function fallbackChainSettles(rows: Readonly<Record<PoseName, Row>>, start: PoseName): boolean {
  const seen = new Set<PoseName>();
  let current: PoseName = start;
  while (!rows[current].loop) {
    if (seen.has(current)) return false;
    seen.add(current);
    const next = rows[current].fallback;
    if (next === undefined || rows[next] === undefined) return false;
    current = next;
  }
  return true;
}

function cycle(frames: number, hold: number, lastHold: number): number[] {
  return Array.from({ length: frames }, (_, index) => (index === frames - 1 ? lastHold : hold));
}
