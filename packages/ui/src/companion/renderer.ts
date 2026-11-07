import type { PoseName, Rows } from "@keywork-app/habitat";
import type { HitMask } from "./port.ts";

export type { PoseName };

export interface Pose {
  clip: PoseName;
  frame: number;
  facing: "left" | "right";
}

export interface RenderTokens {
  identity: readonly [string, string, string, string];
  ground: readonly [string, string, string, string];
  outline: string;
  accent: string;
}

export interface RenderPrefs {
  deviceScale: number;
  hueStop?: number | undefined;
  forcedColors?: boolean | undefined;
}

export interface RenderedFrame {
  width: number;
  height: number;
  alpha: Uint8Array;
  paint(context: CanvasRenderingContext2D): void;
}

export interface Renderer {
  (pose: Pose, tokens: RenderTokens, prefs: RenderPrefs): RenderedFrame;
  readonly rows?: Rows | undefined;
}

export const cell = { width: 48, height: 52 } as const;
export const groundLine = 46;
export const artScale = 2;

export function deviceScaleFor(sizePercent: number, devicePixelRatio: number): number {
  return Math.max(1, Math.round(artScale * (sizePercent / 100) * devicePixelRatio));
}

export function tokensFromStyle(
  read: (name: string) => string,
  hueStop: number | undefined,
  forcedColors: boolean,
): RenderTokens {
  if (forcedColors) {
    return {
      identity: ["Canvas", "CanvasText", "Canvas", "CanvasText"],
      ground: ["Canvas", "CanvasText", "Canvas", "CanvasText"],
      outline: "CanvasText",
      accent: "Highlight",
    };
  }
  const stop = hueStop === undefined ? "accent" : `ramp-${hueStop}`;
  return {
    identity: [
      read(`--kw-${stop}`),
      read("--kw-panel-lift"),
      read(`--kw-${stop}`),
      read("--kw-text"),
    ],
    ground: [
      read("--kw-panel"),
      read("--kw-border"),
      read("--kw-text-dim"),
      read("--kw-text-faint"),
    ],
    outline: read("--kw-text"),
    accent: read("--kw-accent"),
  };
}

const transparent = 0;
const body = 1;
const shade = 2;
const eye = 4;
const outline = 9;
const ground = 5;
const accent = 10;

export const placeholderRenderer: Renderer = (pose, tokens, prefs) => {
  const grid = paintGrid(pose);
  const scale = prefs.deviceScale;
  const width = cell.width * scale;
  const height = cell.height * scale;
  const palette = paletteOf(tokens);
  return {
    width,
    height,
    alpha: alphaOf(grid, scale),
    paint: (context) => {
      context.clearRect(0, 0, width, height);
      for (let y = 0; y < cell.height; y += 1) {
        for (let x = 0; x < cell.width; x += 1) {
          const index = grid[y * cell.width + x] ?? transparent;
          if (index === transparent) continue;
          context.fillStyle = palette[index] ?? tokens.outline;
          context.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    },
  };
};

export function hitMaskOf(
  frame: RenderedFrame,
  cssPerDevice: number,
  offset: { x: number; y: number },
  size: { width: number; height: number },
): HitMask {
  const bits = new Uint8Array(size.width * size.height);
  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const deviceX = Math.floor((x - offset.x) / cssPerDevice);
      const deviceY = Math.floor((y - offset.y) / cssPerDevice);
      if (deviceX < 0 || deviceY < 0 || deviceX >= frame.width || deviceY >= frame.height) continue;
      bits[y * size.width + x] = frame.alpha[deviceY * frame.width + deviceX] ?? 0;
    }
  }
  return { width: size.width, height: size.height, bits };
}

export function paintGrid(pose: Pose): Uint8Array {
  const grid = new Uint8Array(cell.width * cell.height);
  const shape = shapeOf(pose);
  fillRect(grid, 8, groundLine, 32, 2, ground);
  fillRect(grid, shape.x, shape.y, shape.width, shape.height, body);
  fillRect(grid, shape.x + 2, shape.y + shape.height - 6, shape.width - 4, 3, shade);
  strokeRect(grid, shape.x, shape.y, shape.width, shape.height, outline);
  drawEyes(grid, shape, pose);
  if (pose.clip === "carry" || pose.clip === "deliver") {
    fillRect(grid, shape.x + shape.width - 6, shape.y - 6, 10, 7, accent);
    strokeRect(grid, shape.x + shape.width - 6, shape.y - 6, 10, 7, outline);
  }
  return grid;
}

interface Shape {
  x: number;
  y: number;
  width: number;
  height: number;
  eyesClosed: boolean;
  crossed: boolean;
}

function shapeOf(pose: Pose): Shape {
  const breath = pose.clip === "idle" && (pose.frame === 1 || pose.frame === 2) ? 1 : 0;
  const hop =
    (pose.clip === "celebrate" || pose.clip === "greet" || pose.clip === "ring") &&
    pose.frame % 2 === 1
      ? 4
      : 0;
  const stride = pose.clip === "walk-left" || pose.clip === "walk-right" ? (pose.frame % 2) * 2 : 0;
  const lying = pose.clip === "nap";
  const width = lying ? 32 : 24;
  const height = lying ? 14 : 26 - breath;
  return {
    x: Math.round((cell.width - width) / 2) + (pose.facing === "left" ? -stride : stride),
    y: groundLine - height - hop,
    width,
    height,
    eyesClosed: lying || (pose.clip === "idle" && pose.frame === 4),
    crossed: pose.clip === "blocked",
  };
}

function drawEyes(grid: Uint8Array, shape: Shape, pose: Pose): void {
  const row = shape.y + 7;
  const left = pose.facing === "left" ? shape.x + 4 : shape.x + shape.width - 12;
  const right = left + 6;
  for (const column of [left, right]) {
    if (shape.crossed) {
      set(grid, column, row, eye);
      set(grid, column + 1, row + 1, eye);
      set(grid, column + 1, row - 1, eye);
      set(grid, column - 1, row + 1, eye);
      set(grid, column - 1, row - 1, eye);
    } else if (shape.eyesClosed) {
      fillRect(grid, column - 1, row, 3, 1, eye);
    } else {
      fillRect(grid, column, row - 1, 2, 2, eye);
    }
  }
}

function paletteOf(tokens: RenderTokens): Record<number, string> {
  return {
    [body]: tokens.identity[0],
    [shade]: tokens.identity[1],
    3: tokens.identity[2],
    [eye]: tokens.identity[3],
    [ground]: tokens.ground[1],
    6: tokens.ground[1],
    7: tokens.ground[2],
    8: tokens.ground[3],
    [outline]: tokens.outline,
    [accent]: tokens.accent,
  };
}

function alphaOf(grid: Uint8Array, scale: number): Uint8Array {
  const width = cell.width * scale;
  const alpha = new Uint8Array(width * cell.height * scale);
  for (let y = 0; y < cell.height * scale; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = grid[Math.floor(y / scale) * cell.width + Math.floor(x / scale)] ?? 0;
      alpha[y * width + x] = index === transparent ? 0 : 1;
    }
  }
  return alpha;
}

function fillRect(
  grid: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  index: number,
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) set(grid, column, row, index);
  }
}

function strokeRect(
  grid: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
  index: number,
): void {
  fillRect(grid, x, y, width, 1, index);
  fillRect(grid, x, y + height - 1, width, 1, index);
  fillRect(grid, x, y, 1, height, index);
  fillRect(grid, x + width - 1, y, 1, height, index);
}

function set(grid: Uint8Array, x: number, y: number, index: number): void {
  if (x < 0 || y < 0 || x >= cell.width || y >= cell.height) return;
  grid[y * cell.width + x] = index;
}
