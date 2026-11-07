import { pathOfPair } from "@keywork-app/screen";
import type {
  PathClass,
  ScreenDisplay,
  ScreenViewEvent,
  StreamRates,
  StreamStats,
} from "./port.ts";

export type ScreenPhase = "starting" | "asking" | "connecting" | "live" | "ended" | "failed";

export type ScreenGrant = "view" | "control" | "paused";

export interface ControlView {
  readonly state: "active" | "paused" | "revoked";
  readonly expiresAt?: string | undefined;
  readonly reason?: string | undefined;
}

export interface ScreenViewState {
  readonly phase: ScreenPhase;
  readonly path: PathClass | undefined;
  readonly displays: readonly ScreenDisplay[];
  readonly current: string | undefined;
  readonly expiresAt: string | undefined;
  readonly stats: StreamStats | undefined;
  readonly rates: StreamRates | undefined;
  readonly ending: { reason: string; detail?: string | undefined } | undefined;
  readonly problem: string | undefined;
  readonly control?: ControlView | undefined;
}

export const startingView: ScreenViewState = {
  phase: "starting",
  path: undefined,
  displays: [],
  current: undefined,
  expiresAt: undefined,
  stats: undefined,
  rates: undefined,
  ending: undefined,
  problem: undefined,
};

export function viewState(state: ScreenViewState, event: ScreenViewEvent): ScreenViewState {
  if (state.phase === "ended" || state.phase === "failed") return state;
  switch (event.kind) {
    case "asking":
      return { ...state, phase: "asking" };
    case "granted":
      return {
        ...state,
        phase: "connecting",
        path: event.path,
        displays: event.displays,
        current: event.current,
        expiresAt: event.expiresAt,
        ...(event.control !== undefined && {
          control: { state: "active", expiresAt: event.control.expiresAt },
        }),
      };
    case "control":
      return { ...state, control: controlAfter(state.control, event) };
    case "displays":
      return { ...state, displays: event.displays, current: event.current };
    case "connection":
      return event.state === "connected" ? { ...state, phase: "live" } : state;
    case "stats":
      return {
        ...state,
        path: pathOfPair(event.stats.pair) ?? state.path,
        stats: event.stats,
        rates: event.rates,
      };
    case "ended":
      return { ...state, phase: "ended", ending: { reason: event.reason, detail: event.detail } };
  }
}

export function grantOf(state: ScreenViewState): ScreenGrant {
  switch (state.control?.state) {
    case "active":
      return "control";
    case "paused":
      return "paused";
    default:
      return "view";
  }
}

export function controlLine(state: ScreenViewState, now: number): string {
  const control = state.control;
  if (control === undefined || state.phase === "ended" || state.phase === "failed") return "";
  switch (control.state) {
    case "active":
      return `you control this screen · ${minutesLeft(control.expiresAt, now)} · x stops`;
    case "paused":
      return "control paused · the keeper is using that machine";
    case "revoked":
      return `view only · control ended: ${control.reason ?? "the keeper took it back"}`;
  }
}

export function controlsInput(state: ScreenViewState): boolean {
  return state.phase === "live" && state.control?.state === "active";
}

export function failedView(problem: string): ScreenViewState {
  return { ...startingView, phase: "failed", problem };
}

export function pathWord(path: PathClass | undefined): string {
  switch (path) {
    case "local":
      return "this machine";
    case "direct":
      return "direct";
    case "relayed":
      return "relayed · low-bandwidth preset";
    case "peer-relay":
      return "peer relay";
    case "derp":
      return "relayed through DERP · low-bandwidth preset";
    default:
      return "path unknown";
  }
}

export function statusLine(state: ScreenViewState, peer: string): string {
  switch (state.phase) {
    case "starting":
      return `reaching ${peer}`;
    case "asking":
      return `waiting for ${peer} to allow viewing · ignored after 30 s`;
    case "connecting":
      return `allowed until ${clockOf(state.expiresAt)} · connecting`;
    case "live":
      return [viewOnlyWord(state), displayLine(state), `until ${clockOf(state.expiresAt)}`]
        .filter((part) => part !== undefined)
        .join(" · ");
    case "ended":
      return `ended · ${endingLine(state.ending)}`;
    case "failed":
      return `could not reach ${peer} · ${state.problem ?? "no detail"}`;
  }
}

export function statsLine(state: ScreenViewState): string {
  const stats = state.stats;
  if (stats === undefined || state.phase !== "live") return "";
  const parts = [
    stats.width === undefined || stats.height === undefined
      ? undefined
      : `${stats.width}×${stats.height}`,
    state.rates === undefined ? undefined : `${state.rates.framesPerSecond} fps`,
    state.rates === undefined ? undefined : `${(state.rates.bitrateKbps / 1000).toFixed(1)} Mbps`,
    stats.codec?.replace(/^video\//i, ""),
    stats.pair?.rttMs === undefined ? undefined : `rtt ${stats.pair.rttMs} ms`,
    stats.pair === undefined ? undefined : `${stats.pair.local.type}/${stats.pair.remote.type}`,
    stats.qualityLimitation === undefined || stats.qualityLimitation === "none"
      ? undefined
      : `limited by ${stats.qualityLimitation}`,
  ];
  return parts.filter((part) => part !== undefined).join(" · ");
}

export function endingLine(ending: ScreenViewState["ending"]): string {
  if (ending === undefined) return "";
  if (ending.reason === "denied")
    return deniedWords[ending.detail ?? ""] ?? "the request was refused";
  return endWords[ending.reason] ?? ending.reason;
}

const deniedWords: Readonly<Record<string, string>> = {
  ignored: "the keeper ignored the request",
  "timed-out": "nobody answered within 30 s",
  busy: "another request is waiting on that machine",
  "rate-limited": "too many requests · try again in a minute",
  unverified: "that machine could not verify who you are",
  "needs-permission": "that machine has not allowed screen recording yet",
  unavailable: "that machine has no display to share",
};

const endWords: Readonly<Record<string, string>> = {
  "viewer-left": "you stopped viewing",
  "local-user": "stopped on the machine being viewed",
  "kill-switch": "stopped by the kill switch on that machine",
  expired: "the hour-long grant ran out",
  idle: "the viewer went quiet for five minutes",
  "max-duration": "the session reached its maximum length",
  "not-reconfirmed": "the keeper did not keep sharing",
  "display-lost": "the shared display went away",
  "connection-lost": "the connection dropped",
  "protocol-error": "the machines disagreed about the protocol",
  shutdown: "that machine's console closed",
};

function controlAfter(
  prior: ControlView | undefined,
  event: Extract<ScreenViewEvent, { kind: "control" }>,
): ControlView {
  const reason = event.reason === undefined ? {} : { reason: event.reason };
  switch (event.state) {
    case "granted":
    case "resumed":
      return { ...prior, state: "active", ...reason };
    case "paused":
      return { ...prior, state: "paused", ...reason };
    case "revoked":
      return { state: "revoked", ...reason };
  }
}

function viewOnlyWord(state: ScreenViewState): string | undefined {
  return state.control === undefined ? "view only" : undefined;
}

function minutesLeft(expiresAt: string | undefined, now: number): string {
  if (expiresAt === undefined) return "until the grant ends";
  const minutes = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
  return `${minutes} min left`;
}

function displayLine(state: ScreenViewState): string {
  const index = state.displays.findIndex((display) => display.id === state.current);
  const display = state.displays[index];
  if (display === undefined) return "one display";
  return state.displays.length > 1
    ? `${display.label} (${index + 1} of ${state.displays.length})`
    : display.label;
}

function clockOf(iso: string | undefined): string {
  if (iso === undefined) return "the grant ends";
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
