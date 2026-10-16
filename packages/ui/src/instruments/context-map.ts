import type { ContextParts, ContextReport, ContextThresholds } from "@keywork-app/protocol";
import { formatTokens } from "./format.ts";

export type MapPart = "system" | "tools" | "injected" | "conversation";

export type MapFence = "flush" | "compaction";

export type MapCell = MapPart | "free" | MapFence;

export interface LegendRow {
  readonly cell: MapCell;
  readonly label: string;
  readonly tokens: string;
  readonly share: string;
}

export const mapParts: readonly MapPart[] = ["system", "tools", "injected", "conversation"];

export const cellLabels: Readonly<Record<MapCell, string>> = {
  system: "system prompt",
  tools: "tool schemas",
  injected: "memory and skills",
  conversation: "conversation",
  free: "free",
  flush: "memory flush",
  compaction: "compaction",
};

export const mapRows = 10;

export function mapColumns(window: number): number {
  return window > largeWindow ? 20 : 10;
}

export function mapCells(report: ContextReport): MapCell[] {
  const count = mapRows * mapColumns(report.window);
  const tokensPerCell = report.window / count;
  const ends = partEnds(report.parts, tokensPerCell, count);
  return Array.from(
    { length: count },
    (_, index) => partAt(ends, index) ?? roomAt(report.thresholds, index * tokensPerCell),
  );
}

export function legendRows(report: ContextReport): LegendRow[] {
  const { parts, window } = report;
  return [
    ...mapParts.map((part) => tallyRow(part, parts[part].tokens, window)),
    tallyRow("free", parts.free.tokens, window),
  ];
}

export function fenceRows(report: ContextReport): LegendRow[] {
  return fencesOf(report.thresholds).map(({ fence, at }) => ({
    cell: fence,
    label: cellLabels[fence],
    tokens: `at ${formatTokens(at)}`,
    share: "",
  }));
}

export function mapHead(report: ContextReport): string {
  const filled = filledTokens(report.parts);
  return `${formatTokens(filled)} of ${formatTokens(report.window)} · ${share(filled, report.window)}`;
}

export function basisLine(report: ContextReport): string {
  const window = report.declared
    ? "window declared in keywork.json"
    : "window assumed by the server";
  return `${partsBasis(report.parts)} · ${window}`;
}

export function pastWindowLine(report: ContextReport): string | undefined {
  const past = fencesOf(report.thresholds).filter(({ at }) => at > report.window);
  if (past.length === 0) return undefined;
  const fences = past.map(({ fence, at }) => `${cellLabels[fence]} at ${formatTokens(at)}`);
  return `${fences.join(", ")} · past the window · keywork measures the conversation only`;
}

export function mapReadout(report: ContextReport): string {
  return `context ${mapHead(report)} · ${partsReadout(report.parts)}`;
}

export function partsReadout(parts: ContextParts): string {
  const tally = [...mapParts, "free" as const].map(
    (cell) => `${cellLabels[cell]} ${formatTokens(parts[cell].tokens)}`,
  );
  return [...tally, partsBasis(parts)].join(" · ");
}

const largeWindow = 200_000;
const reportedFrom = "from the usage the provider reported at the last turn";
const estimatedFrom = "estimated from the text keywork sends";

interface PlacedFence {
  readonly fence: MapFence;
  readonly at: number;
}

function fencesOf(thresholds: ContextThresholds): PlacedFence[] {
  return [
    { fence: "flush", at: thresholds.flushAt },
    { fence: "compaction", at: thresholds.compactAt },
  ];
}

function partsBasis(parts: ContextParts): string {
  const reported = mapParts.filter((part) => parts[part].basis === "reported");
  if (reported.length === 0) return `parts ${estimatedFrom}`;
  if (reported.length === mapParts.length) return `parts ${reportedFrom}`;
  const named = spokenList(reported.map((part) => cellLabels[part]));
  return `${named} ${reportedFrom} · the rest ${estimatedFrom}`;
}

function filledTokens(parts: ContextParts): number {
  return mapParts.reduce((sum, part) => sum + parts[part].tokens, 0);
}

function partEnds(parts: ContextParts, tokensPerCell: number, count: number): number[] {
  let total = 0;
  return mapParts.map((part) => {
    total += parts[part].tokens;
    return Math.min(count, Math.round(total / tokensPerCell));
  });
}

function partAt(ends: readonly number[], index: number): MapPart | undefined {
  const at = ends.findIndex((end) => index < end);
  return at < 0 ? undefined : mapParts[at];
}

function roomAt(thresholds: ContextThresholds, tokens: number): MapCell {
  if (tokens >= thresholds.compactAt) return "compaction";
  if (tokens >= thresholds.flushAt) return "flush";
  return "free";
}

function tallyRow(cell: MapPart | "free", tokens: number, window: number): LegendRow {
  return {
    cell,
    label: cellLabels[cell],
    tokens: formatTokens(tokens),
    share: share(tokens, window),
  };
}

function share(part: number, whole: number): string {
  const percent = Math.round((part / whole) * 100);
  return percent === 0 && part > 0 ? "<1%" : `${percent}%`;
}

function spokenList(words: readonly string[]): string {
  const last = words.at(-1) ?? "";
  return words.length < 2 ? last : `${words.slice(0, -1).join(", ")} and ${last}`;
}
