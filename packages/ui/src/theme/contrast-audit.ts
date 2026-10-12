import { contrastPolarity } from "./contrast.ts";
import {
  type ContrastMeasurement,
  contrastMeasurements,
  type MeasuredLayer,
  type Theme,
} from "./schema.ts";

export interface ThemeAudit {
  readonly theme: string;
  readonly minMarginLc: number;
  readonly sectionMarginLc: number;
  readonly failures: readonly string[];
}

export function auditTheme(theme: Theme): ThemeAudit {
  const measurements = contrastMeasurements(theme);
  return {
    theme: theme.name,
    minMarginLc: smallestMargin(measurements, "tokens"),
    sectionMarginLc: smallestMargin(measurements, "sections"),
    failures: measurements.flatMap((measurement) => failuresOf(measurement, theme)),
  };
}

const expectedPolarity = {
  light: "dark-on-light",
  dark: "light-on-dark",
} as const satisfies Record<Theme["appearance"], string>;

function failuresOf(measurement: ContrastMeasurement, theme: Theme): string[] {
  const { pair, ink, ground, lc, floor } = measurement;
  const polarity = contrastPolarity(ink, ground);
  return [
    ...(lc < floor ? [`${pair} measures Lc ${lc.toFixed(1)}, needs at least ${floor}`] : []),
    ...(polarity === expectedPolarity[theme.appearance]
      ? []
      : [`${pair} reads ${polarity} in a ${theme.appearance} theme`]),
  ];
}

function smallestMargin(
  measurements: readonly ContrastMeasurement[],
  layer: MeasuredLayer,
): number {
  const margins = measurements.filter((measurement) => measurement.layer === layer).map(marginOf);
  return tenthsBelow(Math.min(...margins));
}

function marginOf(measurement: ContrastMeasurement): number {
  return measurement.lc - measurement.floor;
}

function tenthsBelow(value: number): number {
  return Math.floor(value * 10) / 10;
}
