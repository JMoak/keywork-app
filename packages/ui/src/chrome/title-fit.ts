import { observeSize } from "../surfaces/runtime/realm.ts";

export const telemetryFits = ["full", "compact", "hidden"] as const;
export type TelemetryFit = (typeof telemetryFits)[number];

export function keepNameReadable(header: HTMLElement): () => void {
  const refit = (): void => {
    fitTelemetry(header);
  };
  refit();
  const stopResizing = observeSize(header, refit);
  const rewritten = new MutationObserver(refit);
  rewritten.observe(header, { childList: true, characterData: true, subtree: true });
  return () => {
    stopResizing();
    rewritten.disconnect();
  };
}

export function fitTelemetry(header: HTMLElement): TelemetryFit {
  const name = header.querySelector<HTMLElement>(".kw-frame-name");
  for (const fit of telemetryFits) {
    header.dataset.telemetry = fit;
    if (name === null || !isClipped(name)) return fit;
  }
  return "hidden";
}

function isClipped(element: HTMLElement): boolean {
  return element.scrollWidth > element.clientWidth;
}
