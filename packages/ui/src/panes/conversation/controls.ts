import type { SessionControls } from "@keywork-app/client";
import {
  type ActivePreset,
  type CompactReading,
  type ControlRefusal,
  type EffortLevel,
  effortLevels,
  isControlRefusal,
  type PresetName,
  presetOrder,
  type Undone,
} from "@keywork-app/protocol";

export type PresetDirection = "tighter" | "looser";

export function inferenceWords(controls: SessionControls): string | undefined {
  const words = [
    ...(controls.model === undefined ? [] : [controls.model]),
    ...(controls.thinking ? ["thinking"] : []),
    ...(controls.effort === undefined ? [] : [`effort ${controls.effort}`]),
  ];
  return words.length === 0 ? undefined : words.join(" · ");
}

export function nextEffort(current: EffortLevel | undefined): EffortLevel | null {
  if (current === undefined) return effortLevels[0];
  return effortLevels[effortLevels.indexOf(current) + 1] ?? null;
}

export function effortNotice(level: EffortLevel | null): string {
  return level === null
    ? "effort at the provider default · from your next prompt on"
    : `effort ${level} · from your next prompt on`;
}

export function thinkingNotice(on: boolean, toggle: string): string {
  return on
    ? `thinking shown · ${toggle} hides it again`
    : "thinking hidden · progress notes still show where the model writes them";
}

export function presetStep(
  active: ActivePreset | undefined,
  direction: PresetDirection,
): PresetName | undefined {
  if (active === undefined || active === "custom") return undefined;
  const at = presetOrder.indexOf(active) + (direction === "looser" ? 1 : -1);
  return presetOrder[at];
}

export function unsteppableNotice(
  active: ActivePreset | undefined,
  direction: PresetDirection,
): string {
  if (active === undefined) {
    return "the server has not said which preset is active · preset-careful, preset-standard or preset-open sets one";
  }
  if (active === "custom") {
    return "permissions are custom (edited permissions config) · preset-careful, preset-standard or preset-open sets one";
  }
  return direction === "looser"
    ? `already on ${active}, the loosest`
    : `already on ${active}, the tightest`;
}

export function looseningQuestion(from: ActivePreset | undefined, to: PresetName): string {
  return `switching ${from ?? "the current preset"} → ${to} loosens permissions. continue? y/n`;
}

export function presetNotice(from: ActivePreset, to: PresetName): string {
  return from === to ? `already on ${to}` : `permissions preset → ${to}`;
}

export const leftUnchanged = "left unchanged";

export function compactNotice(
  reading: Exclude<CompactReading, "missing" | ControlRefusal>,
): string {
  if (reading.notices.length > 0) return reading.notices.join(" · ");
  return reading.compacted === null
    ? "nothing to fold yet"
    : `folded ${reading.compacted.tokensBefore} tokens into a summary`;
}

export function undoneNotice(undone: Undone): string {
  return undone.prompt === null
    ? undone.filesNote
    : `undone · the prompt is back in the composer · ${undone.filesNote}`;
}

export const redoneNotice = "redone · the turn and its files are back";

export function refusalNotice(reading: "missing" | ControlRefusal): string {
  return reading === "missing" ? "this session is gone" : reading.detail;
}

export function isSettled<Reading>(
  reading: Reading,
): reading is Exclude<Reading, "missing" | ControlRefusal> {
  return reading !== "missing" && !isControlRefusal(reading);
}

export function exportedNotice(bytes: number): string {
  return `session page copied to the clipboard · ${kilobytes(bytes)} of html · this host has no save dialog yet, export-file writes it into the workspace`;
}

function kilobytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}
