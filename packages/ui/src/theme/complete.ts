import { apcaLc } from "./contrast.ts";
import { mixOklab } from "./oklab.ts";
import type { Theme, ThemeDeclaration, ThemeTokens } from "./schema.ts";
import {
  type DiffKey,
  type SyntaxKey,
  sectionFloors,
  syntaxFloor,
  syntaxKeys,
  type TerminalKey,
  terminalChromatics,
  terminalKeys,
} from "./sections.ts";

export function completeTheme(declared: ThemeDeclaration): Theme {
  const { tokens } = declared;
  return {
    ...declared,
    terminal: declared.terminal ?? derivedTerminal(tokens),
    syntax: declared.syntax ?? derivedSyntax(tokens),
    diff: declared.diff ?? derivedDiff(tokens),
    selection: declared.selection ?? derivedSelection(tokens),
    cursor: declared.cursor ?? tokens.accent,
  };
}

export function derivedTerminal(tokens: ThemeTokens): Record<TerminalKey, string> {
  const hues = terminalHues(tokens);
  const brightened = (hue: string): string => mixOklab(hue, tokens.text, brightStep);
  const raw: Record<TerminalKey, string> = {
    black: tokens.panelLift,
    ...hues,
    white: tokens.textMid,
    brightBlack: tokens.textDim,
    brightRed: brightened(hues.red),
    brightGreen: brightened(hues.green),
    brightYellow: brightened(hues.yellow),
    brightBlue: brightened(hues.blue),
    brightMagenta: brightened(hues.magenta),
    brightCyan: brightened(hues.cyan),
    brightWhite: tokens.text,
  };
  return keyed(terminalKeys, (key) =>
    isChromatic(key)
      ? clearingFloor(raw[key], tokens.background, tokens.text, sectionFloors.terminal)
      : raw[key],
  );
}

export function derivedSyntax(tokens: ThemeTokens): Record<SyntaxKey, string> {
  const hues = terminalHues(tokens);
  const raw: Record<SyntaxKey, string> = {
    comment: tokens.textDim,
    keyword: tokens.accent,
    string: tokens.success,
    number: hues.yellow,
    type: hues.cyan,
    function: hues.blue,
    variable: tokens.text,
    constant: hues.yellow,
    operator: tokens.textMid,
    punctuation: tokens.textMid,
    tag: tokens.error,
    attribute: hues.yellow,
    heading: tokens.accent,
    link: hues.blue,
    invalid: tokens.error,
  };
  return keyed(syntaxKeys, (key) =>
    clearingFloor(raw[key], tokens.panel, tokens.text, syntaxFloor(key)),
  );
}

export function derivedDiff(tokens: ThemeTokens): Record<DiffKey, string> {
  const line = (outcome: string): string =>
    groundKeepingInkReadable(tokens.panel, outcome, lineMix, tokens.text, sectionFloors.diffLine);
  return {
    insertedLine: line(tokens.success),
    deletedLine: line(tokens.error),
    insertedText: mixOklab(tokens.panel, tokens.success, textSpanMix),
    deletedText: mixOklab(tokens.panel, tokens.error, textSpanMix),
  };
}

export function derivedSelection(tokens: ThemeTokens): Theme["selection"] {
  return {
    background: groundKeepingInkReadable(
      tokens.panelLift,
      tokens.accentSoft,
      selectionMix,
      tokens.text,
      sectionFloors.selection,
    ),
  };
}

export const brightStep = 0.2;
export const lineMix = 0.14;
export const textSpanMix = 0.28;
export const selectionMix = 0.3;
const mixStep = 0.01;

type Hues = Pick<
  Record<TerminalKey, string>,
  "red" | "green" | "yellow" | "blue" | "magenta" | "cyan"
>;

function terminalHues(tokens: ThemeTokens): Hues {
  return {
    red: tokens.error,
    green: tokens.success,
    yellow: mixOklab(tokens.success, tokens.error, 0.5),
    blue: tokens.ramp[1] ?? tokens.accent,
    magenta: tokens.accent,
    cyan: tokens.ramp[2] ?? tokens.accentSoft,
  };
}

function clearingFloor(ink: string, ground: string, readable: string, floor: number): string {
  if (apcaLc(ink, ground) >= floor) return ink;
  for (let toward = mixStep; toward < 1; toward += mixStep) {
    const candidate = mixOklab(ink, readable, toward);
    if (apcaLc(candidate, ground) >= floor) return candidate;
  }
  return readable;
}

function groundKeepingInkReadable(
  ground: string,
  tint: string,
  strength: number,
  ink: string,
  floor: number,
): string {
  for (let amount = strength; amount > 0; amount -= mixStep) {
    const candidate = mixOklab(ground, tint, amount);
    if (apcaLc(ink, candidate) >= floor) return candidate;
  }
  return ground;
}

function isChromatic(key: TerminalKey): boolean {
  return (terminalChromatics as readonly TerminalKey[]).includes(key);
}

function keyed<Key extends string>(
  keys: readonly Key[],
  colorOf: (key: Key) => string,
): Record<Key, string> {
  return Object.fromEntries(keys.map((key) => [key, colorOf(key)])) as Record<Key, string>;
}
