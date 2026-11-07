import { expect } from "vitest";
import { appActions, coreActions } from "../keys/actions.ts";
import { keymapFromConfig } from "../keys/config.ts";
import { ratchetValue } from "../shell/frame-tick-ratchets.ts";
import type { ActionCommand, PaneDefinition, PaneSpecBase } from "./registry.ts";

export const narrowPanePx = 320;

export const markedKeys = {
  chord: (action: string) => `⟦${action}⟧`,
  leader: () => "⟦leader⟧",
};

export function checkPaneDefinition<Spec extends PaneSpecBase>(
  definition: PaneDefinition<Spec>,
): void {
  const keymap = keymapFromConfig();
  const keys = {
    chord: (action: string) => keymap.describe(action) ?? "an unbound key",
    leader: () => keymap.leader,
  };
  const kind = definition.kind;
  expect(definition.heading, kind).not.toBe("");
  const line = definition.emptyState(keys);
  expect(line, kind).not.toBe("");
  expect(line, kind).not.toContain("\n");
  expect(line, kind).not.toContain("an unbound key");
  const [state, action, ...extra] = definition.emptyState(markedKeys).split(" · ");
  expect(extra, kind).toEqual([]);
  expect(chordsIn(state ?? ""), kind).toEqual([]);
  const chords = chordsIn(action ?? "");
  expect(chords, kind).toHaveLength(1);
  for (const chord of chords) expect(keymap.describe(chord), chord).toBeDefined();
  expect(emptyStateMinWidthPx(line), kind).toBeLessThanOrEqual(
    Math.min(narrowPanePx, ratchetValue("T7.emptyStateMinWidthPx")),
  );
  checkNoCollisions(definition);
}

export function chordsIn(text: string): string[] {
  return Array.from(text.matchAll(/⟦([^⟧]+)⟧/g), (match) => match[1] ?? "");
}

export function emptyStateMinWidthPx(line: string): number {
  const longestRun = Math.max(...line.split(/\s+/).map((run) => [...run].length));
  return emptyStatePaddingPx + Math.ceil(longestRun * widestMonoAdvancePx);
}

const emptyStatePaddingPx = 2 * 20;
const widestMonoAdvancePx = 0.6 * 16;

function checkNoCollisions<Spec extends PaneSpecBase>(definition: PaneDefinition<Spec>): void {
  const own = new Set(ownActionNames(definition));
  for (const name of own) expect(coreActions[name], name).toBeUndefined();
  const summonWords = new Set(wordsOf(definition.summon?.command));
  const localWords = new Set(
    Object.values(definition.localActions ?? {}).flatMap((action) => wordsOf(action.command)),
  );
  for (const [name, action] of Object.entries(appActions)) {
    if (own.has(name)) continue;
    for (const word of wordsOf(action.command)) {
      expect(summonWords.has(word), `${name} also answers to ${word}`).toBe(false);
      if (action.scope === undefined) {
        expect(localWords.has(word), `${name} also answers to ${word}`).toBe(false);
      }
    }
  }
}

function ownActionNames<Spec extends PaneSpecBase>(definition: PaneDefinition<Spec>): string[] {
  const summon = definition.summon;
  const variants = Object.keys(summon?.variants ?? {}).map((v) => `${summon?.action}.${v}`);
  return [
    ...(summon === undefined ? [] : [summon.action, ...variants]),
    ...Object.keys(definition.localActions ?? {}),
  ];
}

function wordsOf(command: ActionCommand | undefined): string[] {
  return command === undefined ? [] : [command.name, ...(command.aliases ?? [])];
}
