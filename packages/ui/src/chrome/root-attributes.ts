import { type Accessor, createSignal, type Setter } from "solid-js";

export type ChromeWeight = "regular" | "seams" | "borderless";

export const chromeWeights: readonly ChromeWeight[] = ["regular", "seams", "borderless"];
export const defaultChromeWeight: ChromeWeight = "seams";

export function chromeWeight(): ChromeWeight {
  const worn = rootAttribute("data-chrome")();
  return chromeWeights.find((weight) => weight === worn) ?? defaultChromeWeight;
}

export function gapCells(): number {
  const cells = Number(rootAttribute("data-gap")());
  return Number.isInteger(cells) && cells > 0 ? cells : 0;
}

export function themeName(): string | undefined {
  return rootAttribute("data-theme")();
}

export function rootAttribute(name: string): Accessor<string | undefined> {
  const known = watched.get(name);
  if (known !== undefined) return known.read;
  const [read, write] = createSignal(currentValue(name));
  watched.set(name, { read, write });
  observeRoot();
  return read;
}

interface Watched {
  readonly read: Accessor<string | undefined>;
  readonly write: Setter<string | undefined>;
}

const watched = new Map<string, Watched>();
let observer: MutationObserver | undefined;

function observeRoot(): void {
  if (observer !== undefined || typeof MutationObserver !== "function") return;
  if (typeof document === "undefined") return;
  observer = new MutationObserver(refreshAll);
  observer.observe(document.documentElement, { attributes: true });
}

function refreshAll(): void {
  for (const [name, { write }] of watched) write(currentValue(name));
}

function currentValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.documentElement.getAttribute(name) ?? undefined;
}
