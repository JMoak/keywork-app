import type { Setting, SettingState, ShowOutcome, ShowSettled } from "@keywork-app/protocol";
import { parseTs } from "../clock/clock.ts";
import { decisionLogLimit } from "../creature/gate.ts";
import { keptAncestors, markOf, reparented, withAncestor } from "./lineage.ts";
import {
  departedFold,
  foldedOnLeaving,
  foldUndone,
  hasLiveDescendants,
  joinedFold,
} from "./plot.ts";
import { byArrival, stillShown, thingOf, type YardSetting, type YardState } from "./types.ts";

export function proposeSetting(yard: YardState, setting: Setting): YardState {
  if (!stillShown(setting)) return departed(yard, setting.id, leavingAs(setting.state));
  const prior = yard.settings[setting.id];
  const continued = prior === undefined ? continuing(yard, setting) : yard;
  const held = arrivedIn(continued, setting, prior);
  return prior === undefined && ruleSurvives(continued, held)
    ? withRuleCarried(continued, held)
    : withSetting(continued, held);
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
  const without = departed(yard, held.id, leavingBy(settled));
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
  const seated = listed.map((row) => arrivedIn(yard, row, yard.settings[row.id]));
  return keptAncestors({
    ...yard,
    settings: Object.fromEntries(
      [...unlistedButNewer, ...seated].map((setting) => [setting.id, setting]),
    ),
  });
}

function arrivedIn(yard: YardState, setting: Setting, prior: YardSetting | undefined): YardSetting {
  const pinned = setting.state === "pinned";
  return {
    ...setting,
    shown: prior?.shown ?? "glyph",
    depth: prior?.depth ?? 0,
    seenAt: pinned ? (prior?.seenAt ?? setting.at) : undefined,
    pinnedAt: pinned ? (prior?.pinnedAt ?? setting.at) : undefined,
    unfolded: prior?.unfolded,
    ruled: prior?.ruled,
    attention: prior?.attention,
    size: prior?.size,
    folded: prior === undefined ? joinedFold(yard, setting) : prior.folded,
  };
}

type Leaving = "seen" | "dismissed" | "withdrawn" | "withdrawn by its owner";

function departed(yard: YardState, id: string, leaving: Leaving): YardState {
  const held = yard.settings[id];
  if (held === undefined) return yard;
  const without = withoutSetting(yard, id);
  if (!hasLiveDescendants(yard, id)) return keptAncestors(without);
  const mark = markOf(held, leaving === "withdrawn by its owner");
  const kept = withAncestor(without, mark);
  if (leaving === "seen") return kept;
  return leaving === "dismissed" ? foldedOnLeaving(kept, mark) : departedFold(kept, mark);
}

function leavingBy(settled: ShowSettled): Leaving {
  if (withdrawnByItsOwner(settled)) return "withdrawn by its owner";
  return settled.outcome === "unpinned" ? "seen" : leavingAs(settled.outcome);
}

function leavingAs(outcome: SettingState | ShowOutcome): Leaving {
  return outcome === "dismissed" || outcome === "withdrawn" ? outcome : "seen";
}

function continuing(yard: YardState, setting: Setting): YardState {
  const predecessor = predecessorOf(yard, setting);
  if (predecessor === undefined) return yard;
  const unfolded = foldUndone(yard, yard.ancestors?.[predecessor]);
  return reparented(unfolded, predecessor, setting.id);
}

function predecessorOf(yard: YardState, setting: Setting): string | undefined {
  if (setting.replaces !== undefined) return setting.replaces ?? undefined;
  const thing = thingOf(setting);
  return Object.values(yard.ancestors ?? {})
    .filter((mark) => mark.replaceable === true && thingOf(mark) === thing)
    .sort(byArrival)
    .at(-1)?.id;
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
  return held.ruled === true && withdrawnByItsOwner(settled);
}

function withdrawnByItsOwner(settled: ShowSettled): boolean {
  return settled.outcome === "withdrawn" && settled.by === "creature";
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
