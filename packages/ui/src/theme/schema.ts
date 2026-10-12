import { z } from "zod";
import { completeTheme } from "./complete.ts";
import { apcaLc } from "./contrast.ts";
import {
  type DensityLevel,
  type DiffKey,
  densityLevels,
  diffKeys,
  diffLines,
  type SyntaxKey,
  sectionFloors,
  syntaxFloor,
  syntaxKeys,
  type TerminalKey,
  terminalChromatics,
  terminalKeys,
} from "./sections.ts";

export function parseTheme(candidate: unknown): Theme {
  const theme = completeTheme(readShape(candidate));
  const failures = contrastFailures(theme);
  if (failures.length === 0) return theme;
  throw new Error(
    `theme "${theme.name}" fails the contrast floor:\n  ${failures.join("\n  ")}\n` +
      "raise the ink or deepen the ground, then reload it.",
  );
}

export function contrastFailures(theme: Theme): string[] {
  return contrastMeasurements(theme)
    .filter((measurement) => measurement.lc < measurement.floor)
    .map(({ pair, lc, floor }) => `${pair} measures Lc ${lc.toFixed(1)}, needs at least ${floor}`);
}

export type MeasuredLayer = "tokens" | "sections";

export interface ContrastMeasurement {
  readonly layer: MeasuredLayer;
  readonly pair: string;
  readonly ink: string;
  readonly ground: string;
  readonly floor: number;
  readonly lc: number;
}

export function contrastMeasurements(theme: Theme): ContrastMeasurement[] {
  const { tokens } = theme;
  const measuredIn =
    (layer: MeasuredLayer) => (pair: string, ink: string, ground: string, floor: number) => ({
      layer,
      pair,
      ink,
      ground,
      floor,
      lc: apcaLc(ink, ground),
    });
  const measured = measuredIn("tokens");
  const dressed = measuredIn("sections");
  return [
    ...readabilityFloors.map(({ ink, ground, floor }) =>
      measured(`${ink} on ${ground}`, tokens[ink], tokens[ground], floor),
    ),
    ...densityLevels.map((level) => {
      const ink = theme.density[level];
      return measured(
        `density ${level}: ${ink} on background`,
        tokens[ink],
        tokens.background,
        densityFloors[level],
      );
    }),
    ...terminalChromatics.map((key) =>
      dressed(
        `terminal.${key} on background`,
        theme.terminal[key],
        tokens.background,
        sectionFloors.terminal,
      ),
    ),
    ...syntaxKeys.map((key) =>
      dressed(`syntax.${key} on panel`, theme.syntax[key], tokens.panel, syntaxFloor(key)),
    ),
    ...diffLines.map((line) =>
      dressed(`text on diff.${line}`, tokens.text, theme.diff[line], sectionFloors.diffLine),
    ),
    dressed(
      `${theme.selection.text === undefined ? "text" : "selection.text"} on selection.background`,
      theme.selection.text ?? tokens.text,
      theme.selection.background,
      sectionFloors.selection,
    ),
    dressed("cursor on background", theme.cursor, tokens.background, sectionFloors.cursor),
  ];
}

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colors must be #rrggbb");

const inkToken = z.enum([
  "text",
  "textMid",
  "textDim",
  "accent",
  "accentSoft",
  "success",
  "error",
  "borderFocus",
]);

export const themeTokensSchema = z
  .object({
    background: hexColor,
    panel: hexColor,
    panelLift: hexColor,
    text: hexColor,
    textMid: hexColor,
    textDim: hexColor,
    border: hexColor,
    borderFocus: hexColor,
    accent: hexColor,
    accentSoft: hexColor,
    success: hexColor,
    error: hexColor,
    ramp: z.array(hexColor).min(1).max(6),
  })
  .strict();

const density = z
  .object({ light: inkToken, medium: inkToken, heavy: inkToken, full: inkToken })
  .strict();

const colorsOf = <const Keys extends readonly [string, ...string[]]>(keys: Keys) =>
  z
    .object(
      Object.fromEntries(keys.map((key) => [key, hexColor])) as {
        [Key in Keys[number]]: typeof hexColor;
      },
    )
    .strict();

export const themeSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, "theme names are lowercase slugs"),
    appearance: z.enum(["dark", "light"]),
    tokens: themeTokensSchema,
    density,
    gap: z.number().int().min(0).max(4),
    chromeWeight: z.enum(["regular", "seams", "borderless"]),
    instruments: z.enum(["calm", "cockpit"]),
    terminal: colorsOf(terminalKeys).optional(),
    syntax: colorsOf(syntaxKeys).optional(),
    diff: colorsOf(diffKeys).optional(),
    selection: z.object({ background: hexColor, text: hexColor.optional() }).strict().optional(),
    cursor: hexColor.optional(),
    pair: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/, "theme names are lowercase slugs")
      .optional(),
  })
  .strict();

export type ThemeDeclaration = z.infer<typeof themeSchema>;
export type ThemeTokens = ThemeDeclaration["tokens"];

export type { DensityLevel, DiffKey, SyntaxKey, TerminalKey } from "./sections.ts";

export interface Theme
  extends Omit<ThemeDeclaration, "terminal" | "syntax" | "diff" | "selection" | "cursor"> {
  readonly terminal: Readonly<Record<TerminalKey, string>>;
  readonly syntax: Readonly<Record<SyntaxKey, string>>;
  readonly diff: Readonly<Record<DiffKey, string>>;
  readonly selection: { readonly background: string; readonly text?: string | undefined };
  readonly cursor: string;
}

export type ThemeInkToken = z.infer<typeof inkToken>;
export type ThemeGroundToken = "background" | "panel" | "panelLift";
export type ThemeReadableToken = ThemeInkToken | "border";

interface ReadabilityFloor {
  ink: ThemeReadableToken;
  ground: ThemeGroundToken;
  floor: number;
}

const readabilityFloors: readonly ReadabilityFloor[] = [
  { ink: "text", ground: "background", floor: 60 },
  { ink: "text", ground: "panel", floor: 60 },
  { ink: "text", ground: "panelLift", floor: 60 },
  { ink: "textMid", ground: "background", floor: 30 },
  { ink: "textDim", ground: "background", floor: 15 },
  { ink: "border", ground: "background", floor: 5 },
  { ink: "borderFocus", ground: "background", floor: 40 },
  { ink: "accent", ground: "background", floor: 40 },
  { ink: "accentSoft", ground: "background", floor: 25 },
  { ink: "success", ground: "background", floor: 40 },
  { ink: "error", ground: "background", floor: 40 },
];

const densityFloors: Record<DensityLevel, number> = {
  light: 15,
  medium: 30,
  heavy: 45,
  full: 40,
};

function readShape(candidate: unknown): ThemeDeclaration {
  const parsed = themeSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue === undefined || issue.path.length === 0 ? "" : ` at ${issue.path.join(".")}`;
  const why = issue?.message ?? "unreadable theme";
  throw new Error(`theme file does not fit the schema${where}: ${why}`);
}
