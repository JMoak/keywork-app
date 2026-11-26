import {
  glowAlpha,
  type Ring,
  ringMarks,
  ringMask,
  ringOver,
  ringStep,
  type TownChange,
} from "@keywork-app/habitat/block";

export interface Arrival<Change = TownChange> {
  readonly change: Change;
  readonly ring: Ring;
  readonly startedAt: number;
  readonly before: HTMLCanvasElement;
  readonly layers: Layers;
}

export const freshMs = 120_000;

export function snapshotOf(canvas: HTMLCanvasElement): HTMLCanvasElement | undefined {
  const copy = canvas.ownerDocument.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d");
  if (context === null || !composites(context)) return undefined;
  context.drawImage(canvas, 0, 0);
  return copy;
}

export function arrivalOf<Change>(
  change: Change,
  ring: Ring,
  startedAt: number,
  before: HTMLCanvasElement,
): Arrival<Change> {
  const make = (): HTMLCanvasElement => before.ownerDocument.createElement("canvas");
  return {
    change,
    ring,
    startedAt,
    before,
    layers: { mask: make(), glow: make(), held: make(), step: undefined },
  };
}

export function arrived(arrival: Arrival<unknown>, now: number): boolean {
  return ringOver(arrival.ring, now - arrival.startedAt);
}

export function paintArrival(
  context: CanvasRenderingContext2D,
  arrival: Arrival<unknown>,
  now: number,
  scale: number,
  glow: string,
): void {
  const { width, height } = context.canvas;
  const across = Math.ceil(width / scale);
  const down = Math.ceil(height / scale);
  const { layers } = arrival;
  const elapsed = now - arrival.startedAt;
  const step = ringStep(arrival.ring, elapsed);
  if (layers.step !== step || layers.mask.width !== across || layers.mask.height !== down) {
    layers.step = step;
    drawLayers(layers, ringMask(arrival.ring, elapsed, across, down), across, down, rgbOf(glow));
  }
  const held = layers.held.getContext("2d");
  if (held === null) return;
  if (layers.held.width !== width) layers.held.width = width;
  if (layers.held.height !== height) layers.held.height = height;
  held.globalCompositeOperation = "source-over";
  held.clearRect(0, 0, width, height);
  held.drawImage(arrival.before, 0, 0);
  held.globalCompositeOperation = "destination-in";
  held.imageSmoothingEnabled = false;
  held.drawImage(layers.mask, 0, 0, across * scale, down * scale);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.imageSmoothingEnabled = false;
  context.globalAlpha = 1;
  context.drawImage(layers.held, 0, 0);
  context.drawImage(layers.glow, 0, 0, across * scale, down * scale);
}

function composites(context: CanvasRenderingContext2D): boolean {
  return (
    typeof context.drawImage === "function" &&
    typeof context.createImageData === "function" &&
    typeof context.putImageData === "function"
  );
}

interface Layers {
  readonly mask: HTMLCanvasElement;
  readonly glow: HTMLCanvasElement;
  readonly held: HTMLCanvasElement;
  step: number | undefined;
}

function drawLayers(
  layers: Layers,
  marks: Uint8Array,
  across: number,
  down: number,
  glow: readonly [number, number, number],
): void {
  for (const layer of [layers.mask, layers.glow]) {
    layer.width = across;
    layer.height = down;
  }
  const mask = layers.mask.getContext("2d");
  const lit = layers.glow.getContext("2d");
  if (mask === null || lit === null) return;
  const kept = mask.createImageData(across, down);
  const shone = lit.createImageData(across, down);
  marks.forEach((mark, at) => {
    if (mark === ringMarks.before) kept.data[at * 4 + 3] = 255;
    else if (mark === ringMarks.glow || mark === ringMarks.faintGlow) {
      shone.data.set([...glow, glowAlpha[mark]], at * 4);
    }
  });
  mask.putImageData(kept, 0, 0);
  lit.putImageData(shone, 0, 0);
}

function rgbOf(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return Number.isNaN(value)
    ? [255, 255, 255]
    : [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
