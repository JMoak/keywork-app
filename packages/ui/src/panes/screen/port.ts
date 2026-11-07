import type { InputDraft } from "@keywork-app/screen";
import type { HostPort } from "../../host/port.ts";

export type PathClass = "local" | "direct" | "relayed" | "peer-relay" | "derp" | "unknown";

export interface ScreenDisplay {
  readonly id: string;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly primary: boolean;
}

export interface CandidateEnd {
  readonly address: string;
  readonly port: number;
  readonly type: string;
}

export interface StreamStats {
  readonly at: number;
  readonly pair?:
    | { local: CandidateEnd; remote: CandidateEnd; rttMs?: number | undefined }
    | undefined;
  readonly frames: number;
  readonly bytes: number;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly codec?: string | undefined;
  readonly qualityLimitation?: string | undefined;
  readonly jitterBufferMs?: number | undefined;
}

export interface StreamRates {
  readonly bitrateKbps: number;
  readonly framesPerSecond: number;
}

export type ScreenViewEvent =
  | { kind: "asking"; sessionId: string }
  | {
      kind: "granted";
      sessionId: string;
      displays: readonly ScreenDisplay[];
      current: string;
      expiresAt: string;
      path: PathClass;
      control?: { grantId: string; expiresAt: string } | undefined;
    }
  | {
      kind: "control";
      sessionId: string;
      state: "granted" | "paused" | "resumed" | "revoked";
      reason?: string | undefined;
    }
  | { kind: "displays"; sessionId: string; displays: readonly ScreenDisplay[]; current: string }
  | { kind: "ended"; sessionId: string; reason: string; detail?: string | undefined }
  | { kind: "connection"; sessionId: string; state: string }
  | { kind: "stats"; sessionId: string; stats: StreamStats; rates: StreamRates };

export type ViewStart = { ok: true; sessionId: string } | { ok: false; problem: string };

export interface ScreenPort {
  view(request: { peer: string; control?: boolean }): Promise<ViewStart>;
  attach(sessionId: string, video: HTMLVideoElement): void;
  onEvent(sessionId: string, listener: (event: ScreenViewEvent) => void): () => void;
  stop(sessionId: string): Promise<void>;
  cycleDisplay(sessionId: string): Promise<void>;
  input?(sessionId: string, input: InputDraft): boolean;
}

export function screenPortOf(host: HostPort): ScreenPort | undefined {
  const candidate = (host as HostPort & { screen?: unknown }).screen;
  return isScreenPort(candidate) ? candidate : undefined;
}

function isScreenPort(candidate: unknown): candidate is ScreenPort {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "view" in candidate &&
    "attach" in candidate &&
    "onEvent" in candidate &&
    "stop" in candidate
  );
}
