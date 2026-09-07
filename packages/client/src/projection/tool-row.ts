import type { ToolRun } from "./types.ts";

export type SpanTone = "body" | "meta" | "ok" | "bad";

export interface RowSpan {
  text: string;
  tone: SpanTone;
}

export function toolRowSpans(run: ToolRun): RowSpan[] {
  const head = run.subject === "" ? run.name : `${run.name} ${run.subject}`;
  if (run.phase === "proposed") return [{ text: head, tone: "body" }, meta(" · proposed")];
  if (run.phase === "running") {
    return [{ text: head, tone: "body" }, meta(` · ${run.live ?? "running"}`)];
  }
  const facts = [durationText(run), sizeText(run), elisionText(run)]
    .filter((part) => part !== undefined)
    .map((part) => ` · ${part}`)
    .join("");
  const spans: RowSpan[] = [
    { text: head, tone: "body" },
    meta(`${facts} · `),
    { text: run.phase, tone: run.phase === "done" ? "ok" : "bad" },
  ];
  if (run.reason !== undefined && run.reason !== "") spans.push(meta(` · ${run.reason}`));
  return spans;
}

export function toolRowText(run: ToolRun): string {
  return toolRowSpans(run)
    .map((span) => span.text)
    .join("");
}

export function compactJson(value: unknown): string {
  const text = JSON.stringify(value) ?? "";
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export function toolSubject(args: unknown): string {
  if (typeof args !== "object" || args === null) return "";
  const record = args as Record<string, unknown>;
  const key =
    favoredSubjectKeys.find((candidate) => typeof record[candidate] === "string") ??
    Object.keys(record).find((candidate) => typeof record[candidate] === "string");
  if (key === undefined) return "";
  const flat = (record[key] as string).replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 39)}…` : flat;
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

function meta(text: string): RowSpan {
  return { text, tone: "meta" };
}

function durationText(run: ToolRun): string | undefined {
  if (run.replay || run.durationMs === undefined) return undefined;
  if (run.durationMs < 1000) return `${run.durationMs}ms`;
  if (run.durationMs < 60_000) return `${(run.durationMs / 1000).toFixed(1)}s`;
  return `${Math.round(run.durationMs / 60_000)}m`;
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
