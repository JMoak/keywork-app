import type { Setting, ShowSettled } from "@keywork-app/protocol";
import { parseTs } from "../clock/clock.ts";
import { decisionLogLimit } from "../creature/gate.ts";
import { stillShown, thingOf, type YardSetting, type YardState } from "./types.ts";

export function proposeSetting(yard: YardState, setting: Setting): YardState {
  if (!stillShown(setting)) return withoutSetting(yard, setting.id);
  const prior = yard.settings[setting.id];
  const held = yardSettingOf(setting, prior);
  return prior === undefined && ruleSurvives(yard, held)
    ? withRuleCarried(yard, held)
    : withSetting(yard, held);
}

export function settleSetting(yard: YardState, settled: ShowSettled, at: string): YardState {
  const held = yard.settings[settled.id];
  if (held === undefined) return yard;
  if (settled.outcome === "pinned") {
    const pinned: YardSetting = {
      ...held,
      state: "pinned",
      pinnedAt: at,
      seenAt: held.seenAt ?? at,
    };
    return withSetting(yard, pinned);
  }
  const without = withoutSetting(yard, held.id);
  return replacedByItsOwner(held, settled) ? rememberRuled(without, thingOf(held)) : without;
}

export function seatSettings(yard: YardState, rows: readonly Setting[], at: string): YardState {
  const listed = rows.filter(stillShown);
  if (listed.length === 0 && Object.keys(yard.settings).length === 0) return yard;
  const listedIds = new Set(listed.map((row) => row.id));
  const listing = parseTs(at);
  const unlistedButNewer = Object.values(yard.settings).filter(
    (held) => !listedIds.has(held.id) && parseTs(held.at) > listing,
  );
  const seated = listed.map((row) => yardSettingOf(row, yard.settings[row.id]));
  return {
    ...yard,
    settings: Object.fromEntries(
      [...unlistedButNewer, ...seated].map((setting) => [setting.id, setting]),
    ),
  };
}

function yardSettingOf(setting: Setting, prior: YardSetting | undefined): YardSetting {
  const pinned = setting.state === "pinned";
  return {
    ...setting,
    shown: prior?.shown ?? "glyph",
    depth: prior?.depth ?? 0,
    seenAt: pinned ? (prior?.seenAt ?? setting.at) : undefined,
    pinnedAt: pinned ? (prior?.pinnedAt ?? setting.at) : undefined,
    unfolded: prior?.unfolded,
    ruled: prior?.ruled,
  };
}

function ruleSurvives(yard: YardState, setting: YardSetting): boolean {
  return yard.ruledThings?.includes(thingOf(setting)) === true;
}

function withRuleCarried(yard: YardState, replacement: YardSetting): YardState {
  const thing = thingOf(replacement);
  return {
    ...withSetting(yard, { ...replacement, ruled: true }),
    ruledThings: (yard.ruledThings ?? []).filter((kept) => kept !== thing),
  };
}

function replacedByItsOwner(held: YardSetting, settled: ShowSettled): boolean {
  return held.ruled === true && settled.outcome === "withdrawn" && settled.by === "creature";
}

function rememberRuled(yard: YardState, thing: string): YardState {
  const kept = (yard.ruledThings ?? []).filter((held) => held !== thing);
  return { ...yard, ruledThings: [...kept, thing].slice(-decisionLogLimit) };
}

function withSetting(yard: YardState, setting: YardSetting): YardState {
  return { ...yard, settings: { ...yard.settings, [setting.id]: setting } };
}

function withoutSetting(yard: YardState, id: string): YardState {
  if (yard.settings[id] === undefined) return yard;
  const { [id]: _, ...settings } = yard.settings;
  return { ...yard, settings };
}
