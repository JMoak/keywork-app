import { For, Show } from "solid-js";
import type { ContextLevel, GaugeStyle } from "../instruments/context.ts";
import { ContextGauge, contextUnit } from "../instruments/gauge.tsx";
import { gaugeStyleFor, type InstrumentTier } from "../instruments/tier.ts";
import type { WidthTier } from "../page/tiers.ts";
import type { TitleBot } from "./identity.ts";
import type { ChromeWeight } from "./root-attributes.ts";
import { arcTagParts } from "./slug.ts";
import { type LifecycleState, stampGlyph } from "./stamp.ts";

export type TitleZone =
  | "stamp"
  | "name"
  | "arc"
  | "bot"
  | "inference"
  | "mode"
  | "theme"
  | "turn"
  | "telemetry";

export interface ThemeMark {
  readonly name: string;
  readonly source: "pane" | "arc";
}

export interface TitleRowProps {
  name: string;
  state: LifecycleState;
  step: number;
  focused: boolean;
  tier: WidthTier;
  weight: ChromeWeight;
  arc?: string | undefined;
  bot?: TitleBot | undefined;
  inference?: string | undefined;
  modeWord?: string | undefined;
  telemetry?: string | undefined;
  context?: ContextLevel | undefined;
  marked?: boolean | undefined;
  quiet?: boolean | undefined;
  ribbon?: string | undefined;
  themeMark?: ThemeMark | undefined;
  instruments?: InstrumentTier | undefined;
  onGauge?: (() => void) | undefined;
}

export const focusMark = "▎";
export const paneMark = "▣";
export const quietMark = "»";

export function titleZones(tier: WidthTier, focused: boolean): ReadonlySet<TitleZone> {
  switch (tier) {
    case "broadsheet":
      return new Set([
        "stamp",
        "name",
        "arc",
        "bot",
        "inference",
        "mode",
        "theme",
        "turn",
        "telemetry",
      ]);
    case "column":
      return new Set(["stamp", "name", "bot", "mode", "theme", "telemetry"]);
    case "clipping":
      return new Set(focused ? ["stamp", "name", "mode", "telemetry"] : ["stamp", "name", "mode"]);
    case "masthead":
      return new Set(["stamp", "name"]);
  }
}

export function TitleRow(props: TitleRowProps) {
  const zones = () => titleZones(props.tier, props.focused);
  const shown = <Value,>(zone: TitleZone, value: Value | undefined): Value | undefined =>
    zones().has(zone) && value !== "" ? value : undefined;
  const gaugeStyle = () =>
    props.instruments === undefined ? undefined : gaugeStyleFor(props.instruments);
  const telemetryShown = () =>
    zones().has("telemetry") && (props.context !== undefined || present(props.telemetry));
  return (
    <header class="kw-frame-title" data-tier={props.tier}>
      <Show when={props.weight === "borderless"}>
        <span class="kw-frame-lead" aria-hidden="true">
          {props.focused ? focusMark : " "}
        </span>
      </Show>
      <span class="kw-frame-stamp" aria-hidden="true" data-state={props.state}>
        {stampGlyph(props.state, props.step)}
      </span>
      <Show when={props.quiet}>
        <span class="kw-frame-quiet" role="img" aria-label="quiet">
          {quietMark}
        </span>
      </Show>
      <Show when={props.marked}>
        <span class="kw-frame-mark" role="img" aria-label="marked">
          {paneMark}
        </span>
      </Show>
      <span class="kw-frame-name" data-state={props.state}>
        {props.name}
      </span>
      <Show when={shown("arc", props.arc)}>{(slug) => <ArcTag slug={slug()} />}</Show>
      <span class="kw-frame-detail">
        <Show when={shown("bot", props.bot)}>{(bot) => <BotIdentity bot={bot()} />}</Show>
        <Show when={shown("inference", props.inference)}>
          {(words) => <span class="kw-frame-inference">{words()}</span>}
        </Show>
        <Show when={shown("mode", props.modeWord)}>
          {(word) => <span class="kw-frame-mode">{word()}</span>}
        </Show>
        <Show when={shown("theme", props.themeMark)}>
          {(mark) => (
            <span class="kw-frame-theme" data-source={mark().source}>
              {mark().name}
            </span>
          )}
        </Show>
        <Show when={shown("turn", props.ribbon)}>
          {(ribbon) => <span class="kw-frame-turn">{ribbon()}</span>}
        </Show>
      </span>
      <Show when={telemetryShown()}>
        <span class="kw-frame-telemetry">
          <Show when={props.context}>
            {(level) => <TitleGauge level={level()} style={gaugeStyle()} onOpen={props.onGauge} />}
          </Show>
          <Show when={props.telemetry}>
            {(text) => <span class="kw-frame-usage">{text()}</span>}
          </Show>
        </span>
      </Show>
    </header>
  );
}

interface TitleGaugeProps {
  level: ContextLevel;
  style: GaugeStyle | undefined;
  onOpen: (() => void) | undefined;
}

function TitleGauge(props: TitleGaugeProps) {
  const gauge = () => <ContextGauge level={props.level} style={props.style} unit={contextUnit} />;
  return (
    <Show when={props.onOpen} fallback={gauge()}>
      <button type="button" class="kw-frame-gauge" onClick={() => props.onOpen?.()}>
        {gauge()}
      </button>
    </Show>
  );
}

function ArcTag(props: { slug: string }) {
  return (
    <span class="kw-frame-arc">
      <For each={arcTagParts(props.slug)}>
        {(part) => <span data-role={part.role}>{part.text}</span>}
      </For>
    </span>
  );
}

function BotIdentity(props: { bot: TitleBot }) {
  return (
    <span class="kw-frame-bot">
      <Show when={props.bot.sigil}>
        {(sigil) => (
          <>
            <span class="kw-frame-sigil">{sigil()}</span>{" "}
          </>
        )}
      </Show>
      {props.bot.name}
    </span>
  );
}

function present(text: string | undefined): text is string {
  return text !== undefined && text !== "";
}
