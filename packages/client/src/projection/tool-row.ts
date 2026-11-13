import type { AskScope, PermissionDecision } from "@keywork-app/protocol";
import { recallText } from "./decisions.ts";
import type { ToolRun } from "./types.ts";

export type SpanTone = "body" | "meta" | "ok" | "bad";

export type SpanPart =
  | "head"
  | "bot"
  | "live"
  | "facts"
  | "separator"
  | "outcome"
  | "grant"
  | "recall"
  | "reason"
  | "hint"
  | "spill";

export interface RowSpan {
  text: string;
  tone: SpanTone;
  part: SpanPart;
}

export interface RowMoment {
  readonly now?: number | undefined;
  readonly queuedBehind?: number | undefined;
}

export function toolRowSpans(run: ToolRun, moment: RowMoment = {}): RowSpan[] {
  const head: RowSpan = { text: headText(run), tone: "body", part: "head" };
  if (run.phase === "proposed") return [head, span(" · proposed", "meta", "live")];
  if (run.phase === "asking") return [head, span(askingText(moment), "meta", "live")];
  if (run.phase === "running") return [head, span(runningText(run, moment), "meta", "live")];
  const facts = [durationText(run), waitText(run), sizeText(run), elisionText(run)]
    .filter((part) => part !== undefined)
    .map((part) => ` · ${part}`)
    .join("");
  return [
    head,
    ...(facts === "" ? [] : [span(facts, "meta", "facts")]),
    span(" · ", "meta", "separator"),
    outcomeSpan(run),
    ...grantSpans(run),
    ...recallSpans(run),
    ...(run.reason === undefined || run.reason === ""
      ? []
      : [span(` · ${run.reason}`, "meta", "reason")]),
  ];
}

export function toolRowText(run: ToolRun): string {
  return toolRowSpans(run)
    .map((item) => item.text)
    .join("");
}

export function grantWord(run: ToolRun): string | undefined {
  const decision = run.decision;
  if (decision?.verdict !== "granted") return undefined;
  if (decision.gate === "trusted") return "trusted";
  return answeredByYou(decision)
    ? approvalWords[decision.scope ?? "once"]
    : standingGrant(decision);
}

export function compactJson(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export function toolSubject(args: unknown): string {
  if (typeof args !== "object" || args === null) return "";
  const record = args as Record<string, unknown>;
  const shown = shownSubject(record.what);
  if (shown !== undefined) return clippedSubject(shown);
  const key =
    favoredSubjectKeys.find((candidate) => typeof record[candidate] === "string") ??
    Object.keys(record).find((candidate) => typeof record[candidate] === "string");
  return key === undefined ? "" : clippedSubject(lineMarked(record[key] as string));
}

export const lineBreakMark = "⏎";

function lineMarked(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join(` ${lineBreakMark} `);
}

function clippedSubject(text: string): string {
  return text.length > subjectLimit ? `${text.slice(0, subjectLimit - 1)}…` : text;
}

const subjectLimit = 60;

function shownSubject(what: unknown): string | undefined {
  if (typeof what !== "object" || what === null) return undefined;
  const { kind, title, ref } = what as Record<string, unknown>;
  if (typeof kind !== "string") return undefined;
  const named = typeof title === "string" && title.trim() !== "" ? title : ref;
  return typeof named === "string" ? `${kind} · ${lineMarked(named)}` : kind;
}

const favoredSubjectKeys = [
  "path",
  "file",
  "filename",
  "command",
  "cmd",
  "url",
  "query",
  "name",
  "pattern",
];

const approvalWords: Readonly<Record<AskScope, string>> = {
  once: "approved",
  session: "approved for this session",
  workspace: "approved for this workspace",
};

function answeredByYou(decision: PermissionDecision): boolean {
  return decision.gate === "user" && decision.asked === true;
}

function standingGrant(decision: PermissionDecision): string | undefined {
  const { scope } = decision;
  return scope === "session" || scope === "workspace" ? `${scope} grant` : undefined;
}

function askingText(moment: RowMoment): string {
  const behind = moment.queuedBehind ?? 0;
  if (behind === 0) return " · waiting for your answer";
  return ` · waiting for your answer · ${behind} more ${behind === 1 ? "call waits" : "calls wait"} behind it`;
}

function runningText(run: ToolRun, moment: RowMoment): string {
  const since = runningFor(run, moment.now);
  const live = run.live === undefined || run.live === "" ? undefined : run.live;
  if (live === undefined) return since === undefined ? " · running" : ` · running ${since}`;
  return since === undefined ? ` · ${live}` : ` · ${since} · ${live}`;
}

function runningFor(run: ToolRun, now: number | undefined): string | undefined {
  if (now === undefined || run.startedAt === undefined || run.replay) return undefined;
  const ran = now - Date.parse(run.startedAt) - (run.waitedMs ?? 0);
  return ran < 1000 ? undefined : elapsedText(Math.floor(ran / 1000) * 1000);
}

function outcomeSpan(run: ToolRun): RowSpan {
  if (run.stopped === true) return span("stopped", "meta", "outcome");
  if (run.phase === "done" && run.exitNote !== undefined)
    return span(run.exitNote, "bad", "outcome");
  return span(run.phase, run.phase === "done" ? "ok" : "bad", "outcome");
}

function headText(run: ToolRun): string {
  return run.subject === "" ? run.name : `${run.name} ${run.subject}`;
}

function grantSpans(run: ToolRun): RowSpan[] {
  const word = grantWord(run);
  return word === undefined ? [] : [span(` · ${word}`, "meta", "grant")];
}

function recallSpans(run: ToolRun): RowSpan[] {
  const text = run.recall === undefined ? undefined : recallText(run.recall);
  return text === undefined ? [] : [span(` · ${text}`, "meta", "recall")];
}

function span(text: string, tone: SpanTone, part: SpanPart): RowSpan {
  return { text, tone, part };
}

export function durationText(run: ToolRun): string | undefined {
  if (run.replay || run.durationMs === undefined) return undefined;
  return elapsedText(run.durationMs);
}

export function waitText(run: ToolRun): string | undefined {
  if (run.replay || run.phase === "refused" || !run.waitedMs) return undefined;
  return `waited ${elapsedText(run.waitedMs)}`;
}

export function elapsedText(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function sizeText(run: ToolRun): string | undefined {
  if (run.outputChars === undefined || run.outputChars < 1000) return undefined;
  if (run.outputChars < 1_000_000) return `${(run.outputChars / 1000).toFixed(1)}k`;
  return `${(run.outputChars / 1_000_000).toFixed(1)}M`;
}

function elisionText(run: ToolRun): string | undefined {
  const spill = run.spill;
  return spill === undefined ? undefined : `elided ${spill.elidedFrom}..${spill.elidedTo}`;
}
