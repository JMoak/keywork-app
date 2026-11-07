import { z } from "zod";

export const inputChannels = {
  ctl: { label: "ctl", id: 1, ordered: true },
  ptr: { label: "ptr", id: 2, ordered: false, maxRetransmits: 0 },
} as const;

export type InputChannel = keyof typeof inputChannels;

export const pointerButtons = ["left", "middle", "right"] as const;

export type PointerButton = (typeof pointerButtons)[number];

const seq = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const unit = z.number().min(0).max(1);
const delta = z.number().min(-10_000).max(10_000);

export const pointerInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("move"), seq, x: unit, y: unit }).strict(),
  z.object({ kind: z.literal("wheel"), seq, x: unit, y: unit, dx: delta, dy: delta }).strict(),
]);

export const controlInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("button"),
      seq,
      x: unit,
      y: unit,
      button: z.enum(pointerButtons),
      down: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("key"),
      seq,
      code: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
      down: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal("release-all"), seq }).strict(),
]);

export type PointerInput = z.output<typeof pointerInputSchema>;
export type ControlInput = z.output<typeof controlInputSchema>;
export type RemoteInput = PointerInput | ControlInput;

type Unsequenced<Input> = Input extends unknown ? Omit<Input, "seq"> : never;

export type InputDraft = Unsequenced<RemoteInput>;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Bounds extends Point {
  readonly width: number;
  readonly height: number;
}

export function channelOf(input: InputDraft): InputChannel {
  return input.kind === "move" || input.kind === "wheel" ? "ptr" : "ctl";
}

export function parseRemoteInput(channel: InputChannel, raw: unknown): RemoteInput | undefined {
  const schema = channel === "ptr" ? pointerInputSchema : controlInputSchema;
  const parsed = schema.safeParse(typeof raw === "string" ? parsedJson(raw) : raw);
  return parsed.success ? parsed.data : undefined;
}

export interface InputSequencer {
  stamp(input: InputDraft): { channel: InputChannel; input: RemoteInput };
}

export function inputSequencer(): InputSequencer {
  const last: Record<InputChannel, number> = { ctl: 0, ptr: 0 };
  return {
    stamp: (input) => {
      const channel = channelOf(input);
      last[channel] += 1;
      return { channel, input: { ...input, seq: last[channel] } as RemoteInput };
    },
  };
}

export interface InputOrder {
  admit(channel: InputChannel, input: RemoteInput): boolean;
}

export function inputOrder(): InputOrder {
  const last: Record<InputChannel, number> = { ctl: 0, ptr: 0 };
  return {
    admit: (channel, input) => {
      if (input.seq <= last[channel]) return false;
      last[channel] = input.seq;
      return true;
    },
  };
}

export function pointOn(bounds: Bounds, normalized: Point): Point {
  return {
    x: bounds.x + clampUnit(normalized.x) * bounds.width,
    y: bounds.y + clampUnit(normalized.y) * bounds.height,
  };
}

export function isInside(point: Point, rect: Bounds): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

export function normalizedOnVideo(
  client: Point,
  box: Bounds,
  video: { readonly width: number; readonly height: number },
): Point | undefined {
  if (video.width === 0 || video.height === 0 || box.width === 0 || box.height === 0) {
    return undefined;
  }
  const scale = Math.min(box.width / video.width, box.height / video.height);
  const shown = { width: video.width * scale, height: video.height * scale };
  const left = box.x + (box.width - shown.width) / 2;
  const top = box.y + (box.height - shown.height) / 2;
  const x = (client.x - left) / shown.width;
  const y = (client.y - top) / shown.height;
  return x < 0 || x > 1 || y < 0 || y > 1 ? undefined : { x, y };
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
