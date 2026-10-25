import { createEffect, createMemo, createSignal, type JSX, onCleanup, onMount } from "solid-js";
import type { ContextLevel } from "../instruments/context.ts";
import { tierOf, type WidthTier } from "../page/tiers.ts";
import type { Outfit } from "../theme/attire.ts";
import type { Theme } from "../theme/schema.ts";
import { dressElement, undressElement } from "../theme/variables.ts";
import type { TitleBot } from "./identity.ts";
import { chromeWeight } from "./root-attributes.ts";
import { createTileFillStep, type LifecycleState } from "./stamp.ts";
import { keepTabWithin } from "./tab-trap.ts";
import { type ThemeMark, TitleRow } from "./title-row.tsx";
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
  arc?: string | undefined;
  bot?: TitleBot | undefined;
  inference?: string | undefined;
  hueRank?: number | undefined;
  outfit?: Outfit | undefined;
  marked?: boolean | undefined;
  quiet?: boolean | undefined;
  ribbon?: string | undefined;
  onFocus?: (() => void) | undefined;
  onGauge?: (() => void) | undefined;
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
  const dressed = createMemo(() => ownOutfit(props.outfit));
  const worn = (): Theme | undefined => dressed()?.theme;
  const weight = () => worn()?.chromeWeight ?? chromeWeight();
  let frame: HTMLElement | undefined;
  onMount(() => {
    if (frame === undefined) return;
    const focus = (): void => props.onFocus?.();
    frame.addEventListener("mousedown", focus);
    onCleanup(() => frame?.removeEventListener("mousedown", focus));
    onCleanup(followWidthTier(frame, setTier));
  });
  createEffect(() => {
    if (frame !== undefined) wearOn(frame, worn());
  });
  return (
    <section
      ref={frame}
      class="kw-frame"
      data-attire={dressed()?.source}
      data-house={chromeWeight()}
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
        weight={weight()}
        arc={props.arc}
        bot={props.bot}
        inference={props.inference}
        modeWord={props.modeWord}
        telemetry={props.telemetry}
        context={props.context}
        marked={props.marked}
        quiet={props.quiet}
        ribbon={props.ribbon}
        themeMark={dressed()}
        instruments={worn()?.instruments}
        onGauge={props.onGauge}
      />
      <div class="kw-frame-body" ref={(body) => onCleanup(keepTabWithin(body))}>
        {props.children}
      </div>
    </section>
  );
}

interface OwnOutfit extends ThemeMark {
  readonly theme: Theme;
}

function ownOutfit(outfit: Outfit | undefined): OwnOutfit | undefined {
  if (outfit === undefined || outfit.source === "window") return undefined;
  return { theme: outfit.theme, name: outfit.theme.name, source: outfit.source };
}

function wearOn(frame: HTMLElement, theme: Theme | undefined): void {
  if (theme === undefined) {
    frame.dataset.chrome = chromeWeight();
    return;
  }
  dressElement(frame, theme);
  onCleanup(() => undressElement(frame));
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
