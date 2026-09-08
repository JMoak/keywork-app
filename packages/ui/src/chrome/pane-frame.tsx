import { createEffect, createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import "./pane-frame.css";

export type LifecycleState = "idle" | "working" | "needs-you" | "finished-unseen" | "failed";

export interface PaneFrameProps {
  name: string;
  state: LifecycleState;
  focused: boolean;
  spawnRank: number;
  telemetry?: string | undefined;
  modeWord?: string | undefined;
  onFocus?: (() => void) | undefined;
  children: JSX.Element;
}

export const rampStops = 3;

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

export function hueStop(spawnRank: number): number {
  return (Math.max(0, spawnRank) % rampStops) + 1;
}

export function PaneFrame(props: PaneFrameProps) {
  const [step, setStep] = createSignal(0);
  const [drained, setDrained] = createSignal(false);
  createEffect(() => {
    if (props.state !== "working" || prefersReducedMotion()) return;
    const timer = setInterval(() => setStep((at) => at + 1), tileFillStepMs);
    onCleanup(() => clearInterval(timer));
  });
  createEffect(() => {
    if (props.state !== "finished-unseen") {
      setDrained(false);
      return;
    }
    if (!props.focused) return;
    const timer = setTimeout(() => setDrained(true), drainMs);
    onCleanup(() => clearTimeout(timer));
  });
  const shownState = () => (drained() ? "idle" : props.state);
  let frame: HTMLElement | undefined;
  onMount(() => {
    const focus = (): void => props.onFocus?.();
    frame?.addEventListener("mousedown", focus);
    onCleanup(() => frame?.removeEventListener("mousedown", focus));
  });
  return (
    <section
      ref={frame}
      class="kw-frame"
      data-state={shownState()}
      data-focused={props.focused ? "" : undefined}
      style={{ "--kw-pane-hue": `var(--kw-ramp-${hueStop(props.spawnRank)})` }}
    >
      <header class="kw-frame-title">
        <span class="kw-frame-stamp" aria-hidden="true" data-state={shownState()}>
          {stampGlyph(shownState(), step())}
        </span>
        <span class="kw-frame-name" data-state={shownState()}>
          {props.name}
        </span>
        <Show when={props.telemetry}>
          {(text) => <span class="kw-frame-telemetry">{text()}</span>}
        </Show>
        <Show when={props.modeWord}>{(word) => <span class="kw-frame-mode">{word()}</span>}</Show>
      </header>
      <div class="kw-frame-body">{props.children}</div>
    </section>
  );
}

const drainMs = 240;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
