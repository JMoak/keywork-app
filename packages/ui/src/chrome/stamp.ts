import { createEffect, createSignal, onCleanup } from "solid-js";

export type LifecycleState = "idle" | "working" | "needs-you" | "finished-unseen" | "failed";

export const tileFill = ["▌", "▀", "▗", "█"] as const;
export const tileFillStepMs = 180;

export function stampGlyph(state: LifecycleState, step = 0): string {
  switch (state) {
    case "working":
      return tileFill[step % tileFill.length] ?? "▌";
    case "needs-you":
    case "finished-unseen":
      return "█";
    case "failed":
      return "▛";
    case "idle":
      return " ";
  }
}

export function createTileFillStep(working: () => boolean): () => number {
  const [step, setStep] = createSignal(0);
  createEffect(() => {
    if (!working() || prefersReducedMotion()) return;
    const timer = setInterval(() => setStep((at) => at + 1), tileFillStepMs);
    onCleanup(() => clearInterval(timer));
  });
  return step;
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
