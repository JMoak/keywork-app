import type { ToolRun } from "./types.ts";

export type SpanTone = "body" | "meta" | "ok" | "bad";

export type SpanPart = "head" | "live" | "facts" | "separator" | "outcome" | "reason";

export interface RowSpan {
  text: string;
  tone: SpanTone;
  part: SpanPart;
}

export function toolRowSpans(run: ToolRun): RowSpan[] {
  const head: RowSpan = { text: headText(run), tone: "body", part: "head" };
  if (run.phase === "proposed") return [head, span(" · proposed", "meta", "live")];
  if (run.phase === "running") return [head, span(` · ${run.live ?? "running"}`, "meta", "live")];
  const facts = [durationText(run), sizeText(run), elisionText(run)]
    .filter((part) => part !== undefined)
    .map((part) => ` · ${part}`)
    .join("");
  return [
    head,
    ...(facts === "" ? [] : [span(facts, "meta", "facts")]),
    span(" · ", "meta", "separator"),
    span(run.phase, run.phase === "done" ? "ok" : "bad", "outcome"),
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

function headText(run: ToolRun): string {
  return run.subject === "" ? run.name : `${run.name} ${run.subject}`;
}

function span(text: string, tone: SpanTone, part: SpanPart): RowSpan {
  return { text, tone, part };
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
