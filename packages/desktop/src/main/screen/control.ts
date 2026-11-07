import {
  type InputChannel,
  inputOrder,
  isInside,
  parseRemoteInput,
  pointOn,
  type RemoteInput,
  type ScreenGrant,
} from "@keywork-app/screen";
import type { HelperPort, HelperStopped } from "./helper/port.ts";
import type { HelperInput } from "./helper/protocol.ts";
import { indicatorLayout, type Rect } from "./indicator.ts";

export interface DisplayGeometry {
  readonly bounds: Rect;
  readonly workArea: Rect;
  readonly scaleFactor: number;
}

export type InputVerdict =
  | "applied"
  | "paused"
  | "no-control"
  | "malformed"
  | "stale"
  | "on-indicator";

export interface InputCounts {
  readonly pointer: number;
  readonly keys: number;
}

export interface ControlOptions {
  readonly grant: ScreenGrant;
  readonly helper: HelperPort;
  readonly geometry: DisplayGeometry;
  readonly live: () => boolean;
  readonly touched: () => void;
  readonly localInput: () => void;
}

export interface Control {
  readonly grant: ScreenGrant;
  paused(): boolean;
  input(channel: InputChannel, raw: unknown): InputVerdict;
  pause(): Promise<void>;
  resume(): void;
  stop(): Promise<HelperStopped>;
  counts(): InputCounts;
}

export const noInputs: InputCounts = { pointer: 0, keys: 0 };

export async function openControl(options: ControlOptions): Promise<Control | undefined> {
  const granted = await options.helper.grant({
    grantId: options.grant.id,
    expiresAt: options.grant.expiresAt,
    display: { ...options.geometry.bounds, scaleFactor: options.geometry.scaleFactor },
  });
  if (!granted) {
    await options.helper.stop();
    return undefined;
  }
  return control(options);
}

export function indicatorZones(geometry: DisplayGeometry): readonly Rect[] {
  const layout = indicatorLayout(geometry.workArea, geometry.scaleFactor);
  return [...layout.edges, layout.banner];
}

function control(options: ControlOptions): Control {
  const order = inputOrder();
  const zones = indicatorZones(options.geometry);
  const counts = { pointer: 0, keys: 0 };
  let helperSeq = 0;
  let paused = false;
  let stopped: Promise<HelperStopped> | undefined;

  const unlisten = options.helper.onReply((reply) => {
    if (reply.kind === "local-input" && stopped === undefined) options.localInput();
  });

  const pressesIndicator = (input: RemoteInput): boolean =>
    input.kind === "button" &&
    input.down &&
    zones.some((zone) => isInside(pointOn(options.geometry.bounds, input), zone));

  const forward = (input: RemoteInput): void => {
    if (input.kind === "release-all") {
      void options.helper.releaseAll();
      return;
    }
    if (input.kind === "key") counts.keys += 1;
    else counts.pointer += 1;
    helperSeq += 1;
    options.helper.input(helperInputOf(options.grant.id, helperSeq, input));
  };

  return {
    grant: options.grant,
    paused: () => paused,
    input: (channel, raw) => {
      if (stopped !== undefined || !options.live()) return "no-control";
      const input = parseRemoteInput(channel, raw);
      if (input === undefined) return "malformed";
      if (!order.admit(channel, input)) return "stale";
      if (paused) return "paused";
      if (pressesIndicator(input)) return "on-indicator";
      options.touched();
      forward(input);
      return "applied";
    },
    pause: async () => {
      if (paused || stopped !== undefined) return;
      paused = true;
      await options.helper.releaseAll();
    },
    resume: () => {
      paused = false;
    },
    stop: () => {
      if (stopped === undefined) {
        unlisten();
        stopped = options.helper.stop();
      }
      return stopped;
    },
    counts: () => ({ ...counts }),
  };
}

function helperInputOf(
  grantId: string,
  seq: number,
  input: Exclude<RemoteInput, { kind: "release-all" }>,
): HelperInput {
  switch (input.kind) {
    case "key":
      return { kind: "key", grantId, seq, code: input.code, down: input.down };
    case "move":
      return { kind: "ptr", grantId, seq, action: "move", x: input.x, y: input.y };
    case "wheel":
      return {
        kind: "ptr",
        grantId,
        seq,
        action: "wheel",
        x: input.x,
        y: input.y,
        dx: input.dx,
        dy: input.dy,
      };
    case "button":
      return {
        kind: "ptr",
        grantId,
        seq,
        action: input.down ? "down" : "up",
        x: input.x,
        y: input.y,
        button: input.button,
      };
  }
}
