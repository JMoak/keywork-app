import { contrastPolarity } from "./contrast.ts";
import { type ContrastMeasurement, contrastMeasurements, type Flavor } from "./schema.ts";

export interface FlavorAudit {
  readonly flavor: string;
  readonly minMarginLc: number;
  readonly failures: readonly string[];
}

export function auditFlavor(flavor: Flavor): FlavorAudit {
  const measurements = contrastMeasurements(flavor);
  return {
    flavor: flavor.name,
    minMarginLc: tenthsBelow(Math.min(...measurements.map(marginOf))),
    failures: measurements.flatMap((measurement) => failuresOf(measurement, flavor)),
  };
}

const expectedPolarity = {
  light: "dark-on-light",
  dark: "light-on-dark",
} as const satisfies Record<Flavor["appearance"], string>;

function failuresOf(measurement: ContrastMeasurement, flavor: Flavor): string[] {
  const { pair, ink, ground, lc, floor } = measurement;
  const polarity = contrastPolarity(ink, ground);
  return [
    ...(lc < floor ? [`${pair} measures Lc ${lc.toFixed(1)}, needs at least ${floor}`] : []),
    ...(polarity === expectedPolarity[flavor.appearance]
      ? []
      : [`${pair} reads ${polarity} in a ${flavor.appearance} flavor`]),
  ];
}

function marginOf(measurement: ContrastMeasurement): number {
  return measurement.lc - measurement.floor;
}

function tenthsBelow(value: number): number {
  return Math.floor(value * 10) / 10;
}
