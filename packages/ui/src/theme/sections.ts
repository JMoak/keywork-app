export const densityLevels = ["light", "medium", "heavy", "full"] as const;

export const terminalKeys = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

export const terminalChromatics = [
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
] as const satisfies readonly TerminalKey[];

export const syntaxKeys = [
  "comment",
  "keyword",
  "string",
  "number",
  "type",
  "function",
  "variable",
  "constant",
  "operator",
  "punctuation",
  "tag",
  "attribute",
  "heading",
  "link",
  "invalid",
] as const;

export const diffKeys = ["insertedLine", "deletedLine", "insertedText", "deletedText"] as const;

export const diffLines = ["insertedLine", "deletedLine"] as const satisfies readonly DiffKey[];

export const sectionFloors = {
  syntax: 30,
  syntaxComment: 15,
  terminal: 30,
  selection: 45,
  diffLine: 60,
  cursor: 40,
} as const;

export function syntaxFloor(key: SyntaxKey): number {
  return key === "comment" ? sectionFloors.syntaxComment : sectionFloors.syntax;
}

export type DensityLevel = (typeof densityLevels)[number];
export type TerminalKey = (typeof terminalKeys)[number];
export type SyntaxKey = (typeof syntaxKeys)[number];
export type DiffKey = (typeof diffKeys)[number];
