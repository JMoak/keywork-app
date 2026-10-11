import { z } from "zod";
import { apcaLc } from "./contrast.ts";

export function parseFlavor(candidate: unknown): Flavor {
  const flavor = readShape(candidate);
  const failures = contrastFailures(flavor);
  if (failures.length === 0) return flavor;
  throw new Error(
    `flavor "${flavor.name}" fails the contrast floor:\n  ${failures.join("\n  ")}\n` +
      "raise the ink or deepen the ground, then reload it.",
  );
}

export function contrastFailures(flavor: Flavor): string[] {
  return contrastMeasurements(flavor)
    .filter((measurement) => measurement.lc < measurement.floor)
    .map(({ pair, lc, floor }) => `${pair} measures Lc ${lc.toFixed(1)}, needs at least ${floor}`);
}

export interface ContrastMeasurement {
  readonly pair: string;
  readonly ink: string;
  readonly ground: string;
  readonly floor: number;
  readonly lc: number;
}

export function contrastMeasurements(flavor: Flavor): ContrastMeasurement[] {
  const measured = (
    pair: string,
    ink: FlavorReadableToken,
    ground: FlavorGroundToken,
    floor: number,
  ): ContrastMeasurement => {
    const inkHex = flavor.tokens[ink];
    const groundHex = flavor.tokens[ground];
    return { pair, ink: inkHex, ground: groundHex, floor, lc: apcaLc(inkHex, groundHex) };
  };
  return [
    ...readabilityFloors.map(({ ink, ground, floor }) =>
      measured(`${ink} on ${ground}`, ink, ground, floor),
    ),
    ...densityLevels.map((level) => {
      const ink = flavor.density[level];
      return measured(
        `density ${level}: ${ink} on background`,
        ink,
        "background",
        densityFloors[level],
      );
    }),
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

export const flavorTokensSchema = z
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

export const densityLevels = ["light", "medium", "heavy", "full"] as const;

const density = z
  .object({ light: inkToken, medium: inkToken, heavy: inkToken, full: inkToken })
  .strict();

export const flavorSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9-]*$/, "flavor names are lowercase slugs"),
    appearance: z.enum(["dark", "light"]),
    tokens: flavorTokensSchema,
    density,
    gap: z.number().int().min(0).max(4),
    chromeWeight: z.enum(["regular", "seams", "borderless"]),
    instruments: z.enum(["calm", "cockpit"]),
  })
  .strict();

export type Flavor = z.infer<typeof flavorSchema>;
export type FlavorTokens = Flavor["tokens"];
export type FlavorInkToken = z.infer<typeof inkToken>;
export type FlavorGroundToken = "background" | "panel" | "panelLift";
export type FlavorReadableToken = FlavorInkToken | "border";
export type DensityLevel = (typeof densityLevels)[number];

interface ReadabilityFloor {
  ink: FlavorReadableToken;
  ground: FlavorGroundToken;
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

function readShape(candidate: unknown): Flavor {
  const parsed = flavorSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const where = issue === undefined || issue.path.length === 0 ? "" : ` at ${issue.path.join(".")}`;
  const why = issue?.message ?? "unreadable flavor";
  throw new Error(`flavor file does not fit the schema${where}: ${why}`);
}
