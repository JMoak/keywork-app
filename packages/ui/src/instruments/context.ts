import type { UsageLedger } from "@keywork-app/client";
import type { ContextParts, ContextReport, ContextBasis as Counting } from "@keywork-app/protocol";
import type { DensityLevel } from "../theme/schema.ts";
import { partsReadout } from "./context-map.ts";
import { formatTokens } from "./format.ts";

export type ContextBasis = "assumed" | "reported";

export interface ContextLevel {
  readonly used: number;
  readonly window: number;
  readonly flushAt: number;
  readonly compactAt: number;
  readonly basis: ContextBasis;
  readonly counted?: Counting | undefined;
  readonly declared?: boolean | undefined;
  readonly parts?: ContextParts | undefined;
}

export const estimatedWord = "estimated";

export type GaugeStyle = "steps" | "bar";

export interface GaugeCell {
  readonly glyph: string;
  readonly level: DensityLevel | "empty";
}

export const assumedContextWindow = 200_000;
export const barCells = 10;

export function contextLevelOf(ledger: UsageLedger): ContextLevel | undefined {
  if (ledger.turns === 0) return undefined;
  return assumedContextLevel(ledger.lastTurnContextTokens);
}

export function contextLevelOfReport(report: ContextReport): ContextLevel | undefined {
  if (report.used === 0) return undefined;
  return {
    used: report.used,
    window: report.window,
    flushAt: report.flushAt,
    compactAt: report.compactAt,
    basis: "reported",
    counted: report.basis,
    declared: report.declared,
    parts: report.parts,
  };
}

export function sessionContextLevel(
  report: ContextReport | undefined,
  ledger: UsageLedger,
): ContextLevel | undefined {
  return report === undefined ? contextLevelOf(ledger) : contextLevelOfReport(report);
}

export function assumedContextLevel(used: number): ContextLevel {
  return reportedContextLevel(used, assumedContextWindow, "assumed");
}

export function reportedContextLevel(
  used: number,
  window: number,
  basis: ContextBasis = "reported",
): ContextLevel {
  return {
    used: Math.max(0, Math.round(used)),
    window,
    flushAt: window - reserve(window, reserveShares.flush, reserveCaps.flush),
    compactAt: window - reserve(window, reserveShares.compaction, reserveCaps.compaction),
    basis,
  };
}

export function gaugeCells(level: ContextLevel, style: GaugeStyle): GaugeCell[] {
  return style === "bar" ? barGaugeCells(level) : stepGaugeCells(level);
}

export function gaugeCount(level: ContextLevel, style: GaugeStyle): string {
  const used = formatTokens(level.used);
  if (style === "steps") return used;
  return `${used}/${windowIsAssumed(level) ? "~" : ""}${formatTokens(level.window)}`;
}

export function gaugeReadout(level: ContextLevel): string {
  return [
    `context ${formatTokens(level.used)} of ${formatTokens(level.window)} tokens`,
    `memory flush at ${formatTokens(level.flushAt)} · compaction at ${formatTokens(level.compactAt)}`,
    windowBasis(level),
  ].join(" · ");
}

export function gaugeHover(level: ContextLevel): string {
  const readout = gaugeReadout(level);
  return level.parts === undefined ? readout : `${readout}\n${partsReadout(level.parts)}`;
}

function windowBasis(level: ContextLevel): string {
  const window = formatTokens(level.window);
  if (level.basis === "assumed") return `window assumed at ${window} until the server reports one`;
  const counted = countedLine(level.counted);
  if (level.declared === false) {
    return `window reported at ${window}, assumed by the server · ${counted} · declare models[…].contextWindow in keywork.json for an honest limit`;
  }
  return level.declared === true
    ? `window reported at ${window}, declared in keywork.json · ${counted}`
    : `window reported at ${window} · ${counted}`;
}

function countedLine(counted: Counting | undefined): string {
  return counted === "reported"
    ? "counted from what the provider reported"
    : "estimated from the conversation text";
}

function windowIsAssumed(level: ContextLevel): boolean {
  return level.basis === "assumed" || level.declared === false;
}

const densityRamp: readonly { glyph: string; level: DensityLevel }[] = [
  { glyph: "░", level: "light" },
  { glyph: "▒", level: "medium" },
  { glyph: "▓", level: "heavy" },
  { glyph: "█", level: "full" },
];
const emptyCell: GaugeCell = { glyph: "·", level: "empty" };

const reserveCaps = { flush: 24_576, compaction: 16_384 } as const;
const reserveShares = { flush: 1 / 8, compaction: 1 / 12 } as const;

function reserve(window: number, share: number, cap: number): number {
  return Math.min(cap, Math.max(1, Math.floor(window * share)));
}

function stepGaugeCells(level: ContextLevel): GaugeCell[] {
  const bounds = [0, level.flushAt / 2, level.flushAt, level.compactAt];
  return bounds.map((from, zone) =>
    level.used > from ? (densityRamp[zone] ?? emptyCell) : emptyCell,
  );
}

function barGaugeCells(level: ContextLevel): GaugeCell[] {
  const [room, flush, compaction, used] = densityRamp as [
    GaugeCell,
    GaugeCell,
    GaugeCell,
    GaugeCell,
  ];
  const cellWidth = level.window / barCells;
  const usedCells = Math.min(barCells, Math.round(level.used / cellWidth));
  return Array.from({ length: barCells }, (_, index) => {
    if (index < usedCells) return used;
    const end = (index + 1) * cellWidth;
    if (level.compactAt < end) return compaction;
    if (level.flushAt < end) return flush;
    return room;
  });
}
