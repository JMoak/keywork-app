import type { SettingSignal } from "@keywork-app/protocol";
import type { LifecycleState } from "./stamp.ts";

// How much a pane wants the keeper, weakest first. Only these are ever drawn as a whole outline.
export type PaneSignal = "arrived" | SettingSignal;

// Where a pane stands in its arrangement. These are an edge, never an outline.
export type PaneEdge = "lead" | "way-back";

export const arrivalFadesAfterMs = 6_000;

export const signalWords: Readonly<Record<SettingSignal, string>> = {
  "needs-you": "needs you",
  critical: "critical",
};

export function strongestSignal(
  asked: SettingSignal | undefined,
  state: LifecycleState,
  arrived: boolean,
): PaneSignal | undefined {
  if (asked !== undefined) return asked;
  if (state === "needs-you") return "needs-you";
  return arrived ? "arrived" : undefined;
}

export function signalReason(signal: SettingSignal, why: string | undefined): string {
  return why === undefined || why === "" ? signalWords[signal] : `${signalWords[signal]} · ${why}`;
}

export function clearSignalTitle(signal: SettingSignal, why: string | undefined): string {
  return `${signalReason(signal, why)} · press to clear`;
}
