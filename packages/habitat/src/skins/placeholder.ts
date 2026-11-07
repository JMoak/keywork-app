import {
  defaultCell,
  defaultPaletteRoles,
  type PoseName,
  referenceRows,
  type Skin,
} from "../pose/skin.ts";
import { assembleAtlas } from "./atlas.ts";
import {
  groundBase,
  groundHighlight,
  groundLight,
  groundShadow,
  identityBase,
  identityHighlight,
  identityLight,
  identityShadow,
  lamplight,
  needsYou,
  outline,
  transparent,
} from "./legend.ts";

export const placeholderGroundLine = 51;

export const placeholderAirborne: Readonly<Partial<Record<PoseName, readonly number[]>>> = {
  celebrate: [1, 2],
  greet: [1, 2],
};

export function placeholderSkin(): Skin {
  const cells = Object.fromEntries(
    Object.entries(placeholderFrames).map(([pose, figures]) => [
      pose,
      figures.map((figure) => sealed(paintFigure({ ...model, ...figure }))),
    ]),
  ) as unknown as Record<PoseName, readonly Uint8Array[]>;
  return {
    id: "placeholder",
    displayName: "Placeholder silhouette",
    cell: defaultCell,
    atlas: assembleAtlas(defaultCell, cells),
    palette: defaultPaletteRoles,
    rows: referenceRows,
    groundLine: placeholderGroundLine,
    gaze: { row: 16, directions: 8 },
  };
}

type Arm = "down" | "up" | "out" | "forward" | "half" | "hip" | "none";
type Legs = "stand" | "contact" | "down" | "pass" | "up" | "haunch" | "stool" | "none";
type Eyes = "open" | "closed" | "glint" | "x" | "happy";
type Prop =
  | "none"
  | "crate"
  | "crate-low"
  | "crate-down"
  | "plank"
  | "plank-down"
  | "sheet"
  | "sheet-turned"
  | "hammer-up"
  | "hammer-down"
  | "hammer-floor"
  | "rope"
  | "rope-pulled"
  | "stool";

interface Figure {
  readonly dx: number;
  readonly dy: number;
  readonly bodyDy: number;
  readonly headDx: number;
  readonly headDy: number;
  readonly seated: number;
  readonly eyes: Eyes;
  readonly pupil: { readonly dx: number; readonly dy: number } | undefined;
  readonly left: Arm;
  readonly right: Arm;
  readonly legs: Legs;
  readonly lying: boolean;
  readonly flank: number;
  readonly prop: Prop;
  readonly sweat: boolean;
  readonly shavings: number;
  readonly narrow: number;
}

const model: Figure = {
  dx: 0,
  dy: 0,
  bodyDy: 0,
  headDx: 0,
  headDy: 0,
  seated: 0,
  eyes: "open",
  pupil: undefined,
  left: "down",
  right: "down",
  legs: "stand",
  lying: false,
  flank: 0,
  prop: "none",
  sweat: false,
  shavings: 0,
  narrow: 0,
};

const walkPhases: readonly Legs[] = ["contact", "down", "pass", "up"];

const placeholderFrames: Readonly<Record<PoseName, readonly Partial<Figure>[]>> = {
  idle: [{}, { eyes: "closed" }, { bodyDy: -1 }, { bodyDy: -1, eyes: "glint" }, { bodyDy: 0 }, {}],
  work: [
    { right: "forward", headDy: 1 },
    { right: "forward", headDy: 2 },
    { right: "forward", headDy: 1, headDx: 1 },
    { right: "forward", headDy: 1 },
    { right: "forward", headDy: 2 },
    { right: "forward", headDy: 1, headDx: 1 },
  ],
  hammer: [
    { right: "up", prop: "hammer-up" },
    { right: "up", prop: "hammer-up", bodyDy: -1 },
    { right: "forward", prop: "hammer-down", bodyDy: 1 },
    { right: "forward", prop: "hammer-down" },
    { right: "up", prop: "hammer-up" },
    { right: "forward", prop: "hammer-down" },
  ],
  read: [
    { left: "half", right: "half", prop: "sheet", headDy: 1, pupil: { dx: -1, dy: 1 } },
    { left: "half", right: "half", prop: "sheet", headDy: 1, pupil: { dx: 0, dy: 1 } },
    { left: "half", right: "half", prop: "sheet", headDy: 1, pupil: { dx: 1, dy: 1 } },
    { left: "half", right: "half", prop: "sheet-turned", headDy: 1, pupil: { dx: 0, dy: 1 } },
  ],
  carve: [
    { right: "forward", headDy: 2, shavings: 0 },
    { right: "forward", headDy: 2, shavings: 1, headDx: 1 },
    { right: "forward", headDy: 2, shavings: 1 },
    { right: "forward", headDy: 2, shavings: 2, headDx: 1 },
    { right: "forward", headDy: 2, shavings: 2 },
    { right: "forward", headDy: 2, shavings: 3, headDx: 1 },
  ],
  "walk-left": walking((phase) => ({ legs: phase, headDx: -1, right: "none", left: "down" })),
  "walk-right": walking((phase) => ({ legs: phase, headDx: 1, left: "none", right: "down" })),
  carry: [
    { legs: "contact", prop: "crate", left: "half", right: "half" },
    { legs: "down", prop: "crate", left: "half", right: "half" },
    { legs: "pass", prop: "crate", left: "half", right: "half", bodyDy: -1 },
    { legs: "up", prop: "crate", left: "half", right: "half" },
    { legs: "contact", prop: "crate", left: "half", right: "half" },
    { legs: "pass", prop: "crate", left: "half", right: "half", bodyDy: -1 },
  ],
  deliver: [
    { prop: "crate", left: "half", right: "half" },
    { prop: "crate-low", left: "down", right: "down", headDy: 1 },
    { prop: "crate-down", left: "down", right: "forward", headDy: 2 },
    { prop: "crate-down", left: "down", right: "down" },
    { prop: "crate-down", left: "out", right: "out" },
    { prop: "crate-down", left: "half", right: "half" },
  ],
  ring: [
    { left: "up", right: "up", prop: "rope" },
    { left: "up", right: "up", prop: "rope-pulled", bodyDy: 1 },
    { left: "up", right: "up", prop: "rope-pulled" },
    { left: "half", right: "half", prop: "rope" },
  ],
  wait: [
    { right: "half" },
    { right: "half", dx: 1 },
    { right: "half", dx: 1 },
    { right: "half", eyes: "closed" },
    { right: "half", dx: -1 },
    { right: "half" },
  ],
  celebrate: [
    { bodyDy: 1, headDy: 1 },
    { dy: -3, left: "up", right: "up", eyes: "happy" },
    { dy: -5, left: "out", right: "out", eyes: "happy" },
    { bodyDy: 1, headDy: 1, eyes: "happy" },
    { eyes: "happy" },
    {},
  ],
  stumble: [
    { right: "forward", headDx: 1, prop: "hammer-down" },
    { right: "forward", headDx: 2, dx: 1, prop: "hammer-down", eyes: "closed" },
    { right: "forward", headDx: 1, prop: "hammer-down" },
    { right: "forward", prop: "hammer-down" },
  ],
  blocked: [
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor", left: "down", right: "down" },
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor", dx: 1 },
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor", dx: 1 },
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor" },
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor", dx: -1 },
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor", dx: -1, sweat: true },
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor", sweat: true },
    { seated: 5, legs: "haunch", eyes: "x", prop: "hammer-floor", sweat: true },
  ],
  nap: [
    { lying: true, legs: "none", left: "none", right: "none", eyes: "closed" },
    { lying: true, legs: "none", left: "none", right: "none", eyes: "closed", flank: 1 },
    { lying: true, legs: "none", left: "none", right: "none", eyes: "closed", flank: 1 },
    { lying: true, legs: "none", left: "none", right: "none", eyes: "closed" },
  ],
  stretch: [
    { left: "up", right: "up" },
    { left: "up", right: "up", bodyDy: -1, headDy: -1, narrow: 1 },
    { left: "up", right: "up", bodyDy: -1, headDy: -1, narrow: 1, eyes: "closed" },
    { left: "half", right: "half" },
  ],
  look: Array.from({ length: 8 }, (_, direction) => ({ pupil: pupilToward(direction) })),
  wave: [
    { right: "up" },
    { right: "up", dx: 0, headDx: -1 },
    { right: "up", headDx: 1 },
    { right: "half" },
  ],
  greet: [
    { bodyDy: 1, headDy: 1 },
    { dy: -2, eyes: "happy" },
    { dy: -3, eyes: "happy", left: "out", right: "out" },
    { eyes: "happy" },
  ],
  raise: [
    { legs: "contact", prop: "plank", left: "half", right: "half" },
    { legs: "pass", prop: "plank", left: "half", right: "half", bodyDy: -1 },
    { prop: "plank-down", left: "forward", right: "forward", headDy: 2 },
    { prop: "hammer-up", right: "up" },
    { prop: "hammer-down", right: "forward", bodyDy: 1 },
    { prop: "hammer-up", right: "up" },
    { legs: "down", left: "hip", right: "hip" },
    { left: "hip", right: "hip" },
  ],
  sit: [
    { seated: 3, legs: "stool", prop: "stool", headDy: -1, pupil: { dx: 1, dy: -1 } },
    { seated: 3, legs: "stool", prop: "stool", headDy: -1, pupil: { dx: 1, dy: -1 } },
    { seated: 3, legs: "stool", prop: "stool", headDy: 0, pupil: { dx: 1, dy: 0 } },
    { seated: 3, legs: "stool", prop: "stool", headDy: -1, pupil: { dx: 1, dy: -1 } },
  ],
};

function walking(frame: (phase: Legs) => Partial<Figure>): Partial<Figure>[] {
  return [...walkPhases, ...walkPhases].map((phase) => ({
    ...frame(phase),
    bodyDy: phase === "pass" ? -1 : 0,
  }));
}

function pupilToward(direction: number): { dx: number; dy: number } {
  const angle = (direction / 8) * 2 * Math.PI;
  return { dx: Math.round(Math.cos(angle)), dy: Math.round(Math.sin(angle)) };
}

const width = defaultCell.width;
const height = defaultCell.height;

function paintFigure(figure: Figure): Uint8Array {
  const cell = new Uint8Array(width * height);
  if (figure.lying) {
    paintLying(cell, figure);
    return cell;
  }
  const sit = figure.seated;
  const bodyTop = 27 + figure.bodyDy + sit;
  const bodyLeft = 16 + figure.dx + figure.narrow;
  const bodyRight = 31 + figure.dx - figure.narrow;
  const headX = 24 + figure.dx + figure.headDx;
  const headY = 19 + figure.headDy + figure.dy + sit + figure.bodyDy;
  paintBehind(cell, figure);
  paintLegs(cell, figure);
  fillRect(
    cell,
    bodyLeft,
    bodyTop + figure.dy,
    bodyRight - bodyLeft + 1,
    43 + sit - bodyTop,
    identityBase,
  );
  fillRect(cell, bodyLeft + 4, bodyTop + 2 + figure.dy, 8, 4, identityLight);
  fillRect(cell, bodyRight, bodyTop + 1 + figure.dy, 1, 42 + sit - bodyTop, identityShadow);
  fillRect(cell, bodyLeft + 2, 33 + sit + figure.dy, bodyRight - bodyLeft - 3, 10, groundBase);
  if (
    figure.prop !== "hammer-up" &&
    figure.prop !== "hammer-down" &&
    figure.prop !== "hammer-floor"
  ) {
    fillRect(cell, bodyRight - 2, 34 + sit + figure.dy, 3, 2, groundShadow);
    fillRect(cell, bodyRight - 1, 36 + sit + figure.dy, 1, 4, groundLight);
  }
  paintArm(cell, figure.left, bodyLeft - 3, bodyTop + 1 + figure.dy, -1);
  paintArm(cell, figure.right, bodyRight + 1, bodyTop + 1 + figure.dy, 1);
  paintHead(cell, figure, headX, headY);
  paintProp(cell, figure, bodyLeft, bodyRight, bodyTop + figure.dy, headY);
  return cell;
}

function paintLying(cell: Uint8Array, figure: Figure): void {
  fillEllipse(cell, 25 + figure.dx, 44 - figure.flank, 15, 5 + figure.flank, identityBase);
  fillRect(cell, 20 + figure.dx, 44, 14, 5, groundBase);
  fillEllipse(cell, 12 + figure.dx, 41, 6, 6, identityBase);
  fillRect(cell, 9 + figure.dx, 46, 6, 2, identityLight);
  fillRect(cell, 8 + figure.dx, 40, 2, 1, outline);
  fillRect(cell, 13 + figure.dx, 40, 2, 1, outline);
  set(cell, 7 + figure.dx, 34, identityHighlight);
  set(cell, 8 + figure.dx, 35, identityHighlight);
}

function paintHead(cell: Uint8Array, figure: Figure, cx: number, cy: number): void {
  fillEllipse(cell, cx, cy, 8, 8, identityBase);
  fillRect(cell, cx - 5, cy + 4, 10, 3, identityLight);
  set(cell, cx - 7, cy - 9, identityHighlight);
  set(cell, cx - 6, cy - 8, identityHighlight);
  set(cell, cx + 6, cy - 9, identityHighlight);
  set(cell, cx + 5, cy - 8, identityHighlight);
  fillRect(cell, cx - 1, cy + 9, 3, 1, identityLight);
  set(cell, cx, cy + 10, identityLight);
  paintEyes(cell, figure, cx, cy);
  if (figure.sweat) {
    set(cell, cx + 9, cy - 4, groundHighlight);
    set(cell, cx + 9, cy - 3, groundHighlight);
    set(cell, cx + 8, cy - 3, groundHighlight);
  }
}

function paintEyes(cell: Uint8Array, figure: Figure, cx: number, cy: number): void {
  const left = cx - 4;
  const right = cx + 3;
  const row = cy - 1;
  if (figure.pupil !== undefined) {
    for (const x of [left, right]) {
      fillRect(cell, x - 1, row - 1, 3, 3, identityHighlight);
      set(cell, x + figure.pupil.dx, row + figure.pupil.dy, outline);
    }
    return;
  }
  switch (figure.eyes) {
    case "open":
      fillRect(cell, left, row, 2, 2, outline);
      fillRect(cell, right, row, 2, 2, outline);
      return;
    case "glint":
      fillRect(cell, left, row, 2, 2, outline);
      fillRect(cell, right, row, 2, 2, outline);
      set(cell, left, row, identityHighlight);
      set(cell, right, row, identityHighlight);
      return;
    case "closed":
      fillRect(cell, left, row + 1, 2, 1, outline);
      fillRect(cell, right, row + 1, 2, 1, outline);
      return;
    case "happy":
      set(cell, left, row, outline);
      set(cell, left + 1, row - 1, outline);
      set(cell, right, row - 1, outline);
      set(cell, right + 1, row, outline);
      return;
    case "x":
      for (const x of [left, right]) {
        set(cell, x - 1, row - 1, outline);
        set(cell, x + 1, row - 1, outline);
        set(cell, x, row, outline);
        set(cell, x - 1, row + 1, outline);
        set(cell, x + 1, row + 1, outline);
      }
      return;
  }
}

function paintArm(cell: Uint8Array, arm: Arm, x: number, shoulder: number, side: 1 | -1): void {
  switch (arm) {
    case "none":
      return;
    case "down":
      fillRect(cell, x, shoulder, 3, 12, identityBase);
      fillRect(cell, x, shoulder + 12, 3, 2, identityLight);
      return;
    case "up":
      fillRect(cell, x, shoulder - 16, 3, 17, identityBase);
      fillRect(cell, x, shoulder - 18, 3, 2, identityLight);
      return;
    case "half":
      fillRect(cell, x, shoulder - 6, 3, 9, identityBase);
      fillRect(cell, x, shoulder - 8, 3, 2, identityLight);
      return;
    case "out":
      fillRect(cell, side === 1 ? x : x - 7, shoulder + 1, 10, 3, identityBase);
      fillRect(cell, side === 1 ? x + 10 : x - 9, shoulder + 1, 2, 3, identityLight);
      return;
    case "forward":
      fillRect(cell, side === 1 ? x : x - 7, shoulder + 5, 10, 3, identityBase);
      fillRect(cell, side === 1 ? x + 10 : x - 9, shoulder + 5, 2, 3, identityLight);
      return;
    case "hip":
      fillRect(cell, x, shoulder, 3, 6, identityBase);
      fillRect(cell, side === 1 ? x - 2 : x + 2, shoulder + 5, 3, 2, identityLight);
      return;
  }
}

function paintLegs(cell: Uint8Array, figure: Figure): void {
  const dx = figure.dx;
  const dy = figure.dy;
  const leg = (x: number): void => {
    fillRect(cell, x + dx, 43 + dy, 4, 5, identityBase);
    fillRect(cell, x + dx, 48 + dy, 4, 2, groundShadow);
  };
  switch (figure.legs) {
    case "none":
      return;
    case "stand":
      leg(18);
      leg(26);
      return;
    case "contact":
      leg(15);
      leg(29);
      return;
    case "down":
    case "up":
      leg(17);
      leg(27);
      return;
    case "pass":
      leg(20);
      leg(25);
      return;
    case "haunch":
      fillRect(cell, 14 + dx, 45 + dy, 20, 3, identityBase);
      fillRect(cell, 14 + dx, 48 + dy, 3, 2, groundShadow);
      fillRect(cell, 31 + dx, 48 + dy, 3, 2, groundShadow);
      return;
    case "stool":
      fillRect(cell, 31 + dx, 40 + dy, 7, 6, identityBase);
      fillRect(cell, 34 + dx, 46 + dy, 4, 2, identityBase);
      fillRect(cell, 34 + dx, 48 + dy, 4, 2, groundShadow);
      return;
  }
}

function paintBehind(cell: Uint8Array, figure: Figure): void {
  switch (figure.prop) {
    case "stool":
      fillRect(cell, 14, 46, 20, 2, groundLight);
      fillRect(cell, 15, 48, 2, 2, groundShadow);
      fillRect(cell, 31, 48, 2, 2, groundShadow);
      return;
    case "rope":
    case "rope-pulled": {
      const pulled = figure.prop === "rope-pulled";
      fillRect(cell, 24, 0, 1, 12, groundLight);
      fillRect(cell, pulled ? 23 : 22, 0, 5, 3, pulled ? needsYou : groundLight);
      fillRect(cell, pulled ? 24 : 23, 3, 3, 1, pulled ? needsYou : groundLight);
      return;
    }
    case "hammer-floor":
      fillRect(cell, 36, 48, 6, 1, groundLight);
      fillRect(cell, 42, 46, 3, 4, groundShadow);
      return;
    case "crate-down":
      paintCrate(cell, 34, 42);
      return;
    case "plank-down":
      fillRect(cell, 10, 47, 26, 3, groundLight);
      fillRect(cell, 10, 48, 26, 1, groundShadow);
      return;
    default:
      return;
  }
}

function paintProp(
  cell: Uint8Array,
  figure: Figure,
  bodyLeft: number,
  bodyRight: number,
  bodyTop: number,
  headY: number,
): void {
  switch (figure.prop) {
    case "crate":
      paintCrate(cell, bodyLeft + 3, bodyTop + 4);
      return;
    case "crate-low":
      paintCrate(cell, bodyLeft + 3, bodyTop + 9);
      return;
    case "plank":
      fillRect(cell, bodyLeft - 6, bodyTop + 5, 26, 3, groundLight);
      fillRect(cell, bodyLeft - 6, bodyTop + 6, 26, 1, groundShadow);
      return;
    case "sheet":
    case "sheet-turned": {
      const x = figure.prop === "sheet" ? bodyLeft + 4 : bodyLeft + 6;
      fillRect(cell, x, bodyTop + 3, 8, 10, groundHighlight);
      for (const line of [2, 4, 6]) fillRect(cell, x + 2, bodyTop + 3 + line, 4, 1, groundShadow);
      return;
    }
    case "hammer-up":
      fillRect(cell, bodyRight + 2, headY - 15, 1, 8, groundLight);
      fillRect(cell, bodyRight, headY - 17, 5, 3, groundShadow);
      return;
    case "hammer-down":
      fillRect(cell, bodyRight + 5, bodyTop + 6, 6, 1, groundLight);
      fillRect(cell, bodyRight + 11, bodyTop + 4, 3, 5, groundShadow);
      set(cell, bodyRight + 14, bodyTop + 9, lamplight);
      set(cell, bodyRight + 15, bodyTop + 10, lamplight);
      return;
    default:
      break;
  }
  for (let shaving = 0; shaving < figure.shavings; shaving += 1) {
    set(cell, bodyRight + 13 + shaving, bodyTop + 11 - (shaving % 2), groundHighlight);
  }
}

function paintCrate(cell: Uint8Array, x: number, y: number): void {
  fillRect(cell, x, y, 10, 8, groundLight);
  fillRect(cell, x, y, 10, 1, groundShadow);
  fillRect(cell, x, y + 7, 10, 1, groundShadow);
  fillRect(cell, x, y, 1, 8, groundShadow);
  fillRect(cell, x + 9, y, 1, 8, groundShadow);
  fillRect(cell, x + 2, y + 3, 6, 1, groundShadow);
}

function sealed(cell: Uint8Array): Uint8Array {
  const out = new Uint8Array(cell);
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? transparent : (cell[y * width + x] ?? 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(x, y) !== transparent) continue;
      const touches =
        isFill(at(x - 1, y)) ||
        isFill(at(x + 1, y)) ||
        isFill(at(x, y - 1)) ||
        isFill(at(x, y + 1));
      if (touches) out[y * width + x] = outline;
    }
  }
  return out;
}

function isFill(index: number): boolean {
  return index !== transparent && index !== outline;
}

function fillRect(
  cell: Uint8Array,
  x0: number,
  y0: number,
  w: number,
  h: number,
  index: number,
): void {
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) set(cell, x, y, index);
}

function fillEllipse(
  cell: Uint8Array,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  index: number,
): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const nx = (x - cx) / (rx + 0.5);
      const ny = (y - cy) / (ry + 0.5);
      if (nx * nx + ny * ny <= 1) set(cell, x, y, index);
    }
  }
}

function set(cell: Uint8Array, x: number, y: number, index: number): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  cell[y * width + x] = index;
}
