import type {
  ControlGrantNotice,
  ControlState,
  EndReason,
  PathClass,
  PeerSignal,
  ScreenDisplay,
  SenderPreset,
  SessionSummary,
} from "@keywork-app/screen";

export const screenChannels = {
  view: "screen:view",
  stop: "screen:stop",
  cycleDisplay: "screen:cycle-display",
  history: "screen:history",
  viewerSignal: "screen:viewer-signal",
  viewerState: "screen:viewer-state",
  viewerEvent: "screen:viewer-event",
  senderReady: "screen:sender-ready",
  senderCommand: "screen:sender-command",
  senderSignal: "screen:sender-signal",
  senderState: "screen:sender-state",
  senderPath: "screen:sender-path",
  senderFrame: "screen:sender-frame",
  senderInput: "screen:sender-input",
  wornTheme: "screen:worn-theme",
} as const;

export const senderWindowFlag = "--keywork-screen-sender";

export const senderPartition = "keywork-screen-sender";

export const senderScheme = "keywork-screen";

export const senderOrigin = `${senderScheme}://sender`;

export const senderPageUrl = `${senderOrigin}/`;

export interface ViewRequest {
  readonly peer: string;
  readonly control?: boolean | undefined;
}

export type ViewStart = { ok: true; sessionId: string } | { ok: false; problem: string };

export type ViewerEvent =
  | { kind: "asking"; sessionId: string }
  | {
      kind: "granted";
      sessionId: string;
      displays: readonly ScreenDisplay[];
      current: string;
      expiresAt: string;
      path: PathClass;
      control?: ControlGrantNotice | undefined;
    }
  | {
      kind: "control";
      sessionId: string;
      state: ControlState;
      reason?: string | undefined;
    }
  | { kind: "displays"; sessionId: string; displays: readonly ScreenDisplay[]; current: string }
  | { kind: "remote"; sessionId: string; signal: PeerSignal }
  | { kind: "ended"; sessionId: string; reason: EndReason | "denied"; detail?: string | undefined };

export type SenderCommand =
  | { kind: "start"; preset: SenderPreset; frameRate: number; control?: true }
  | { kind: "remote"; signal: PeerSignal }
  | { kind: "recapture" }
  | { kind: "preset"; preset: SenderPreset }
  | { kind: "frame"; requestId: number; maxWidth: number };

export interface SenderFrame {
  readonly requestId: number;
  readonly jpeg: Uint8Array | undefined;
}

export type ScreenHistory = readonly SessionSummary[];
