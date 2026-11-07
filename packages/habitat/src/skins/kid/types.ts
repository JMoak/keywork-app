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
