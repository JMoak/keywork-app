import { oklabDistance } from "./oklab.ts";
import type { Theme } from "./schema.ts";
import { terminalChromatics } from "./sections.ts";

export const identityCount = 8;
export const identitiesFromTheRamp = 3;

export type Readable = (ink: string) => string;
export type BeyondTheRamp = readonly [string, string, string, string, string];

export function identityInks(theme: Theme, readable: Readable): readonly string[] {
  const fromRamp = firstRampStops(theme.tokens.ramp).map(readable);
  const declared = identitiesBeyondTheRamp.get(theme.name);
  const beyond =
    declared === undefined
      ? farthestTerminalInks(theme, fromRamp, readable)
      : declared.map(readable);
  return [...fromRamp, ...beyond];
}

export const identitiesBeyondTheRamp: ReadonlyMap<string, BeyondTheRamp> = new Map([
  ["keywork-night", ["#73daca", "#9ece6a", "#ff9e64", "#ff8fb8", "#faba4a"]],
  ["keywork-day", ["#045b52", "#3b6926", "#954900", "#a33464", "#684c08"]],
  ["catppuccin-mocha", ["#6da89e", "#90c58b", "#fab387", "#ff8fb8", "#f9e2af"]],
  ["catppuccin-latte", ["#035148", "#2b721c", "#ac4105", "#954880", "#805e0c"]],
  ["nord", ["#a6e06a", "#ffa768", "#ff9fc1", "#ebcb8b", "#cbadff"]],
  ["nord-light", ["#3b6e18", "#9b4c17", "#aa3669", "#72603c", "#6f49c7"]],
  ["gruvbox-dark", ["#5fe0c8", "#cb91a9", "#c4a1ff", "#7aa8ff", "#6fd6ff"]],
  ["gruvbox-light", ["#8c4d6a", "#595507", "#6e48c5", "#2b5db9", "#076678"]],
  ["everforest-dark", ["#eaa384", "#dba4bd", "#e6d0a6", "#c5a3ff", "#8bb4ff"]],
  ["everforest-light", ["#a65316", "#a24a87", "#785500", "#784fd6", "#3066ca"]],
  ["kanagawa-wave", ["#5fe0c8", "#98bb6c", "#ffa066", "#d789a1", "#e6c384"]],
  ["kanagawa-lotus", ["#034b43", "#376716", "#8e4a00", "#8b465d", "#55502b"]],
  ["rose-pine", ["#5fe0c8", "#a6e06a", "#f6c177", "#ff8fb8", "#7aa8ff"]],
  ["rose-pine-dawn", ["#05675b", "#41771b", "#915f1c", "#b73b71", "#3066ca"]],
  ["matte-black", ["#5fe0c8", "#a7b591", "#ff8fb8", "#c4a1ff", "#7aa8ff"]],
  ["osaka-jade", ["#ffa05c", "#d46d9f", "#e5c736", "#c4a1ff", "#7aa8ff"]],
  ["ristretto", ["#8fc3b4", "#adc685", "#d39bb8", "#ae8dbf", "#7aa8ff"]],
  ["flexoki-dark", ["#879a39", "#da712d", "#d36b9f", "#d0a215", "#6fd6ff"]],
  ["flexoki-light", ["#586e08", "#a94912", "#a02f6f", "#816101", "#044f6d"]],
  ["whiplash", ["#7fcfaa", "#ff7aa8", "#d9d3a8", "#c98bd8", "#6f9fe6"]],
  ["whiplash-flash", ["#1b6b4e", "#974916", "#8f3388", "#6d5e1c", "#295dad"]],
]);

function firstRampStops(ramp: readonly string[]): string[] {
  return Array.from(
    { length: identitiesFromTheRamp },
    (_, index) => ramp[Math.min(index, ramp.length - 1)] ?? "",
  );
}

function farthestTerminalInks(theme: Theme, worn: readonly string[], readable: Readable): string[] {
  const pool = terminalChromatics.map((key) => readable(theme.terminal[key]));
  const chosen = [...worn];
  while (chosen.length < identityCount) chosen.push(farthestFrom(chosen, pool));
  return chosen.slice(worn.length);
}

function farthestFrom(chosen: readonly string[], pool: readonly string[]): string {
  const gap = (ink: string): number => Math.min(...chosen.map((worn) => oklabDistance(worn, ink)));
  return pool.reduce((farthest, ink) => (gap(ink) > gap(farthest) ? ink : farthest));
}
