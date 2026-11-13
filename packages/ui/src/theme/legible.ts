import { derivedTextFaint } from "./complete.ts";
import { wcagContrast } from "./contrast.ts";
import { mixOklab } from "./oklab.ts";
import type { Theme, ThemeTokens } from "./schema.ts";

export const wcagText = 4.5;
export const wcagMark = 3;
export const tierStep = 1.2;

export const textTiers = ["textFaint", "textDim", "textMid"] as const;
export type TextTier = (typeof textTiers)[number];

export const wordInks = ["accent", "accentSoft", "success", "error"] as const;
export type WordInk = (typeof wordInks)[number];

export interface LegibleInks extends Record<TextTier | WordInk, string> {
  readonly text: string;
  readonly borderFocus: string;
  readonly scrollbar: string;
  readonly ramp: readonly string[];
}

export function legibleInks(theme: Theme): LegibleInks {
  const known = legibleByTheme.get(theme);
  if (known !== undefined) return known;
  const inks = liftedInks(theme);
  legibleByTheme.set(theme, inks);
  return inks;
}

export function groundsOf(tokens: ThemeTokens): readonly string[] {
  return [tokens.background, tokens.panel, tokens.panelLift];
}

export function weakestContrast(ink: string, grounds: readonly string[]): number {
  return Math.min(...grounds.map((ground) => wcagContrast(ink, ground)));
}

export function tierFloors(textContrast: number): Readonly<Record<TextTier, number>> {
  const room = textContrast / wcagText;
  const floorOf = (rung: number): number =>
    wcagText * Math.min(tierStep ** rung, room ** (rung / textTiers.length));
  return keyed(textTiers, (tier) => floorOf(textTiers.indexOf(tier)));
}

const legibleByTheme = new WeakMap<Theme, LegibleInks>();

const poles = {
  dark: "#ffffff",
  light: "#000000",
} as const satisfies Record<Theme["appearance"], string>;

const searchSteps = 16;

type Lift = (ink: string, floor: number) => string;

function liftedInks(theme: Theme): LegibleInks {
  const { tokens } = theme;
  const lift = liftAgainst(groundsOf(tokens), poles[theme.appearance]);
  const text = lift(tokens.text, wcagText);
  const floors = tierFloors(weakestContrast(text, groundsOf(tokens)));
  const declaredTiers: Record<TextTier, string> = {
    textFaint: derivedTextFaint(tokens),
    textDim: tokens.textDim,
    textMid: tokens.textMid,
  };
  return {
    text,
    ...keyed(textTiers, (tier) => lift(declaredTiers[tier], floors[tier])),
    ...keyed(wordInks, (ink) => lift(tokens[ink], wcagText)),
    borderFocus: lift(tokens.borderFocus, wcagMark),
    scrollbar: lift(tokens.border, wcagMark),
    ramp: tokens.ramp.map((stop) => lift(stop, wcagText)),
  };
}

function liftAgainst(grounds: readonly string[], pole: string): Lift {
  const clears = (ink: string, floor: number): boolean => weakestContrast(ink, grounds) >= floor;
  return (ink, floor) => {
    if (clears(ink, floor)) return ink;
    let [short, enough] = [0, 1];
    for (let step = 0; step < searchSteps; step += 1) {
      const amount = (short + enough) / 2;
      if (clears(mixOklab(ink, pole, amount), floor)) enough = amount;
      else short = amount;
    }
    return mixOklab(ink, pole, enough);
  };
}

function keyed<Key extends string, Value>(
  keys: readonly Key[],
  valueFor: (key: Key) => Value,
): Record<Key, Value> {
  return Object.fromEntries(keys.map((key) => [key, valueFor(key)])) as Record<Key, Value>;
}
