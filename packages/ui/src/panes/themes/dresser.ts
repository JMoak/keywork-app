import { systemThemeName } from "@keywork-app/protocol";
import type { Attire, AttireTarget } from "../../theme/attire.ts";
import type { Fitting, Wardrobe } from "../../theme/wardrobe.ts";
import { echoedThemes, inheritedTheme, targetHead, windowTarget } from "./targets.ts";

export interface Dresser {
  readonly target: AttireTarget;
  lists(fitting: Fitting): boolean;
  own(): string | undefined;
  inherited(): string | undefined;
  echoes(): readonly string[];
  landing(): string | undefined;
  head(): string;
  hints(): string;
  preview(name: string | undefined): string | undefined;
  wear(name: string): string;
  undress(): string;
  followSystem(): string;
  kept(): string;
}

export const rememberedNotice = "remembered for the next launch";
export const targetRememberedNotice = "remembered";
export const onlyWindowFollowsNotice = "only the window follows the OS";

export type ChordOf = (action: string) => string;

export function windowAlwaysDressedNotice(chord: ChordOf): string {
  return `the window always wears something · ${chord("themes.system")} follows the OS`;
}

export function dresserFor(
  target: AttireTarget,
  wardrobe: Wardrobe,
  attire: Attire | undefined,
  chord: ChordOf,
): Dresser {
  return attire === undefined || target.kind === "window"
    ? windowDresser(wardrobe, chord)
    : targetDresser(target, wardrobe, attire, chord);
}

export function themeOnShow(wardrobe: Wardrobe): string {
  const worn = wardrobe.worn();
  return worn === systemThemeName ? (wardrobe.wearing()?.name ?? worn) : worn;
}

function windowDresser(wardrobe: Wardrobe, chord: ChordOf): Dresser {
  return {
    target: windowTarget,
    lists: () => true,
    own: () => wardrobe.worn(),
    inherited: () => undefined,
    echoes: () => [],
    landing: () => themeOnShow(wardrobe),
    head: () => `${wardrobe.worn()} · the window`,
    hints: () => hintLine(chord, ["themes.system", "system"]),
    preview: (name) => wardrobe.preview(name),
    wear: (name) => wardrobe.wear(name) ?? rememberedNotice,
    undress: () => windowAlwaysDressedNotice(chord),
    followSystem: () => wardrobe.toggleSystem() ?? rememberedNotice,
    kept: () => `kept ${wardrobe.worn()}`,
  };
}

function targetDresser(
  target: AttireTarget,
  wardrobe: Wardrobe,
  attire: Attire,
  chord: ChordOf,
): Dresser {
  const own = (): string | undefined => attire.worn(target);
  const inherited = (): string | undefined => inheritedTheme(attire, target, themeOnShow(wardrobe));
  const landing = (): string | undefined => own() ?? inherited();
  return {
    target,
    lists: (fitting) => fitting.name !== systemThemeName,
    own,
    inherited,
    echoes: () => echoedThemes(attire, target, themeOnShow(wardrobe)),
    landing,
    head: () => targetHead(attire, target, themeOnShow(wardrobe)),
    hints: () => hintLine(chord, ["themes.undress", "inherits"]),
    preview: (name) => attire.preview(target, name),
    wear: (name) => attire.wear(target, name) ?? targetRememberedNotice,
    undress: () => {
      attire.undress(target);
      return `${attire.describe(target)} inherits again`;
    },
    followSystem: () => onlyWindowFollowsNotice,
    kept: () => `kept ${landing() ?? "what each pane wears"}`,
  };
}

type Hint = readonly [action: string, does: string];

function hintLine(chord: ChordOf, ownHint: Hint): string {
  const hints: readonly Hint[] = [
    ["themes.wear", "wears"],
    ["themes.restore", "keeps"],
    ownHint,
    ["themes.target", "target"],
  ];
  return hints.map(([action, does]) => `${chord(action)} ${does}`).join(" · ");
}
