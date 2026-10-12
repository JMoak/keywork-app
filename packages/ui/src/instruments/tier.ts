import type { Theme } from "../theme/schema.ts";
import type { GaugeStyle } from "./context.ts";

export type InstrumentTier = Theme["instruments"];

export function gaugeStyleFor(tier: InstrumentTier): GaugeStyle {
  return tier === "cockpit" ? "bar" : "steps";
}

export function instrumentTierOf(root: { dataset: DOMStringMap } | undefined): InstrumentTier {
  return root?.dataset.instruments === "cockpit" ? "cockpit" : "calm";
}

export function currentInstrumentTier(): InstrumentTier {
  return instrumentTierOf(typeof document === "object" ? document.documentElement : undefined);
}
