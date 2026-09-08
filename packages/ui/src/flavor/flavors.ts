import { type Flavor, parseFlavor } from "./schema.ts";

export const keyworkNight: Flavor = parseFlavor({
  name: "keywork-night",
  appearance: "dark",
  tokens: {
    background: "#1a1b26",
    panel: "#1f2335",
    panelLift: "#24283b",
    text: "#c0caf5",
    textMid: "#828bb8",
    textDim: "#565f89",
    border: "#3b4261",
    borderFocus: "#bb9af7",
    accent: "#bb9af7",
    accentSoft: "#9d7cd8",
    success: "#9ece6a",
    error: "#f7768e",
    ramp: ["#bb9af7", "#7aa2f7", "#7dcfff"],
  },
  density: { light: "textDim", medium: "textMid", heavy: "text", full: "accent" },
  gap: 0,
  chromeWeight: "seams",
  instruments: "calm",
});

export const keyworkDay: Flavor = parseFlavor({
  name: "keywork-day",
  appearance: "light",
  tokens: {
    background: "#e9ebf2",
    panel: "#dfe2ec",
    panelLift: "#d3d7e5",
    text: "#2b3150",
    textMid: "#565e80",
    textDim: "#737b99",
    border: "#c2c7d8",
    borderFocus: "#6f3fb8",
    accent: "#6f3fb8",
    accentSoft: "#8a63c9",
    success: "#3b6a26",
    error: "#bf1e4b",
    ramp: ["#6f3fb8", "#2b5bcf", "#0a6a89"],
  },
  density: { light: "textDim", medium: "textMid", heavy: "text", full: "accent" },
  gap: 0,
  chromeWeight: "seams",
  instruments: "calm",
});

export const gallery: readonly Flavor[] = [keyworkNight, keyworkDay];

export function flavorNamed(name: string): Flavor | undefined {
  return gallery.find((flavor) => flavor.name === name);
}
