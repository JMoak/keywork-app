import {
  type ChildMark,
  type ChildState,
  childStateOf,
  durationText,
  type RowSpan,
  type SpanPart,
  type SpanTone,
  type ToolRun,
  waitText,
} from "@keywork-app/client";
import type { RefusedCall, Usage } from "@keywork-app/protocol";
import { formatCost, formatTokens } from "../instruments/format.ts";

export type BotLabel = (name: string) => string;

export const plainBot: BotLabel = (name) => name;

export const openChildHint: RowSpan = { text: " ·· ↵ open", tone: "meta", part: "hint" };

export function childRowSpans(run: ToolRun, child: ChildMark, botLabel: BotLabel): RowSpan[] {
  const named = [span(`child "${child.title}"`, "body", "head"), ...botSpans(child, botLabel)];
  if (run.phase === "proposed") return [...named, span(" · proposed", "meta", "live")];
  if (run.phase === "asking") return [...named, span(" · waiting for your answer", "meta", "live")];
  const state = childStateOf(run);
  return [
    ...named,
    ...factSpans(run, child),
    span(" · ", "meta", "separator"),
    span(state, stateTones[state], "outcome"),
    ...trailingSpans(run, state),
  ];
}

const stateTones: Readonly<Record<ChildState, SpanTone>> = {
  running: "meta",
  completed: "ok",
  interrupted: "bad",
  failed: "bad",
  denied: "bad",
};

function botSpans(child: ChildMark, botLabel: BotLabel): RowSpan[] {
  return child.bot === undefined ? [] : [span(` · ${botLabel(child.bot)}`, "meta", "bot")];
}

function factSpans(run: ToolRun, child: ChildMark): RowSpan[] {
  const facts = [
    durationText(run),
    tokensFact(child.usage),
    costFact(child.costNanos),
    waitText(run),
    refusedFact(child.refused),
  ].filter((fact) => fact !== undefined);
  return facts.length === 0
    ? []
    : [span(facts.map((fact) => ` · ${fact}`).join(""), "meta", "facts")];
}

function tokensFact(usage: Usage | undefined): string | undefined {
  return usage === undefined
    ? undefined
    : `${formatTokens(usage.inputTokens + usage.outputTokens)} tokens`;
}

function costFact(costNanos: number | undefined): string | undefined {
  return costNanos === undefined ? undefined : formatCost(costNanos / 1e9);
}

function refusedFact(refused: readonly RefusedCall[] | undefined): string | undefined {
  if (refused === undefined || refused.length === 0) return undefined;
  return `refused ${[...new Set(refused.map((call) => call.tool))].join(", ")}`;
}

function trailingSpans(run: ToolRun, state: ChildState): RowSpan[] {
  const working = state === "running";
  const trailing = working ? run.live : run.reason;
  return trailing === undefined
    ? []
    : [span(` · ${trailing}`, "meta", working ? "live" : "reason")];
}

function span(text: string, tone: SpanTone, part: SpanPart): RowSpan {
  return { text, tone, part };
}
