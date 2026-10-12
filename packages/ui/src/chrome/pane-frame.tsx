import { createEffect, createSignal, type JSX, onCleanup, onMount } from "solid-js";
import type { ContextLevel } from "../instruments/context.ts";
import { tierOf, type WidthTier } from "../page/tiers.ts";
import { chromeWeight } from "./root-attributes.ts";
import { createTileFillStep, type LifecycleState } from "./stamp.ts";
import { TitleRow } from "./title-row.tsx";
import "./pane-frame.css";

export { type LifecycleState, stampGlyph, tileFill, tileFillStepMs } from "./stamp.ts";

export interface PaneFrameProps {
  name: string;
  state: LifecycleState;
  focused: boolean;
  spawnRank: number;
  telemetry?: string | undefined;
  context?: ContextLevel | undefined;
  modeWord?: string | undefined;
  bot?: string | undefined;
  inference?: string | undefined;
  hueRank?: number | undefined;
  onFocus?: (() => void) | undefined;
  children: JSX.Element;
}

export const rampStops = 3;

export function hueStop(spawnRank: number): number {
  return (Math.max(0, spawnRank) % rampStops) + 1;
}

export function PaneFrame(props: PaneFrameProps) {
  const step = createTileFillStep(() => props.state === "working");
  const shownState = drainedOnReturn(
    () => props.state,
    () => props.focused,
  );
  const [tier, setTier] = createSignal<WidthTier>("broadsheet");
  let frame: HTMLElement | undefined;
  onMount(() => {
    if (frame === undefined) return;
    const focus = (): void => props.onFocus?.();
    frame.addEventListener("mousedown", focus);
    onCleanup(() => frame?.removeEventListener("mousedown", focus));
    onCleanup(followWidthTier(frame, setTier));
  });
  return (
    <section
      ref={frame}
      class="kw-frame"
      data-chrome={chromeWeight()}
      data-tier={tier()}
      data-state={shownState()}
      data-focused={props.focused ? "" : undefined}
      style={{ "--kw-pane-hue": `var(--kw-ramp-${hueStop(props.hueRank ?? props.spawnRank)})` }}
    >
      <TitleRow
        name={props.name}
        state={shownState()}
        step={step()}
        focused={props.focused}
        tier={tier()}
        weight={chromeWeight()}
        bot={props.bot}
        inference={props.inference}
        modeWord={props.modeWord}
        telemetry={props.telemetry}
        context={props.context}
      />
      <div class="kw-frame-body">{props.children}</div>
    </section>
  );
}

const drainMs = 240;

function drainedOnReturn(
  state: () => LifecycleState,
  focused: () => boolean,
): () => LifecycleState {
  const [drained, setDrained] = createSignal(false);
  createEffect(() => {
    if (state() !== "finished-unseen") {
      setDrained(false);
      return;
    }
    if (!focused()) return;
    const timer = setTimeout(() => setDrained(true), drainMs);
    onCleanup(() => clearTimeout(timer));
  });
  return () => (drained() ? "idle" : state());
}

function followWidthTier(element: HTMLElement, onTier: (tier: WidthTier) => void): () => void {
  if (typeof ResizeObserver !== "function") return () => undefined;
  const observer = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 0;
    if (width > 0) onTier(tierOf(width));
  });
  observer.observe(element);
  return () => observer.disconnect();
}
