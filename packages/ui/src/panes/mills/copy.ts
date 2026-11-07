import type { CostSource, HealthState, ModelClass, ProbeReport, ProbeStatus } from "./wire.ts";

export const millsTitle = "mills";

export const marketRoad = "market road";

export const marketRoadPhrase = "the market road";

export const keyLegend =
  "p probe · a acknowledge license · b bench · enter last report · c next creature";

export const columnHeads = {
  name: "mill · model",
  health: "health",
  held: "held",
  classes: "classes",
  license: "license",
  cost: "USD/M in/out",
} as const;

export function emptyStateLine(lookAgain: string): string {
  return `No mill on any parcel · install Ollama on port 11434 or llama.cpp on port 9931, then look again with ${lookAgain}`;
}

export function noInventoryLine(detail: string, lookAgain: string): string {
  return `No model inventory: ${asClause(detail)} · a server on contract 1.8 serves one; look again with ${lookAgain}`;
}

export const lookingLine = "reading the mills on every parcel";

export const modelRowFirst = "move to a model row first · j and k walk the rows";

export const vacantParcelLine =
  "no mill found · install Ollama on port 11434 or llama.cpp on port 9931 here";

export const marketUnreported = "the node reports no cloud providers yet";

export function tallyLine(facts: {
  parcels: number;
  mills: number;
  down: number;
  loaded: number;
  market: number;
}): string {
  return [
    counted(facts.parcels, "parcel", "parcels"),
    counted(facts.mills, "mill", "mills"),
    facts.down > 0 ? `${facts.down} down` : undefined,
    `${facts.loaded} loaded`,
    facts.market > 0 ? `${facts.market} on the ${marketRoad}` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export function millsHeld(mills: number): string {
  return mills === 0 ? "no mill" : counted(mills, "mill", "mills");
}

export function serverHeld(loaded: number, installed: number): string {
  return `${loaded} loaded · ${installed} installed`;
}

export function marketHeld(models: number): string {
  return counted(models, "model", "models");
}

export const marketModelHeld = "served";

export function modelHeld(loaded: boolean, installed: boolean): string {
  if (loaded) return "loaded";
  return installed ? "installed" : "listed";
}

export const healthWords: Readonly<Record<HealthState, string>> = {
  up: "up",
  loading: "loading",
  saturated: "saturated",
  down: "down",
};

export const noClasses = "none";

export const unprobedClasses = "unprobed";

export const previewTag = "preview";

export const unknownLicense = "unknown";

export const acknowledgementNeeded = "needs ack";

export const acknowledgedTag = "acked";

export const unknownCost = "unknown";

export const costSourceTags: Readonly<Record<CostSource, string>> = {
  provider: "",
  price_table: "table",
  local_estimate: "est",
};

export const capabilityWords: Readonly<Record<string, string>> = {
  tools: "tool calls",
  contextAllocated: "enough context allocated",
  decodeTokensPerSecond: "decode measured on this node",
  decisionEndpoint: "a decision endpoint or logprobs",
  imageInput: "image input",
};

export const unprobedCapability = "capability record";

export function missingLine(modelClass: ModelClass, missing: readonly string[]): string {
  const needs = missing.map((capability) => capabilityWords[capability] ?? capability);
  return `not ${modelClass}: needs ${needs.join(" and ")}`;
}

export function unprobedLine(probe: string): string {
  return `classes unknown until probed · ${probe} probes this parcel`;
}

export function contextLine(tokens: number): string {
  return `context allocated ${tokens.toLocaleString("en-US")} tokens`;
}

export function licenseLine(license: string, acknowledge: string): string {
  return `${license} is not a permissive license · read its terms, then acknowledge with ${acknowledge}`;
}

export function acknowledgedLine(license: string, at: string): string {
  return `${license} acknowledged ${at.slice(0, 10)}`;
}

export function probedLine(place: string, reports: readonly ProbeReport[]): string {
  if (reports.length === 0) return `${place} looked at again · no mill to probe`;
  const statuses: readonly ProbeStatus[] = ["recognized", "unrecognized", "unreachable"];
  const counts = statuses
    .map((status) => [status, reports.filter((report) => report.status === status).length] as const)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`);
  return `${place} probed · ${counts.join(" · ")}`;
}

export function notProbedLine(place: string, detail: string): string {
  return `${place} not probed: ${asClause(detail)}`;
}

export function acknowledgeQuestion(license: string, model: string, place: string): string {
  return `Acknowledge the ${license} license for ${model} on ${place}? It is not a permissive license; read its terms first.`;
}

export function acknowledgementRecorded(license: string, model: string): string {
  return `${model} · ${license} license acknowledged`;
}

export function alreadyAcknowledged(model: string, license: string, at: string): string {
  return `${model} · ${license} acknowledged ${at.slice(0, 10)}`;
}

export function noAcknowledgementNeeded(license: string, model: string): string {
  return `${model} needs no acknowledgement · ${license} is permissive`;
}

export function licenseUnknownLine(model: string, probe: string): string {
  return `${model} has no license on record · probe its parcel with ${probe} to read one`;
}

export const acknowledgementUnserved =
  "Not recorded: this node serves no license acknowledgement yet. Nothing changed.";

export function acknowledgementRefused(detail: string): string {
  return `Not recorded: ${asClause(detail)}. Nothing changed.`;
}

export function benchingLine(model: string, place: string): string {
  return `benching ${model} on ${place} · the report shows under the row when it ends`;
}

export function benchUnserved(model: string): string {
  return `Not run: this node serves no bench yet · in a terminal: \`keywork models bench <provider>/${model}\``;
}

export function benchRefused(model: string, detail: string): string {
  return `${model} bench stopped: ${asClause(detail)}`;
}

export function noReportLine(model: string, bench: string): string {
  return `No bench report for ${model} yet · run one with ${bench}`;
}

export const reportUnserved =
  "No report: this node serves no bench reports yet · `keywork models bench` prints one in a terminal";

export function reportRefused(detail: string): string {
  return `No report: ${asClause(detail)}`;
}

export const benchHeads = { measure: "measure", mean: "mean", range: "range" } as const;

export const benchMeasures = {
  validAt1: "valid@1",
  toolName: "tool name",
  toolSchema: "tool schema",
  toolArguments: "tool arguments",
  noTool: "no tool when none",
  parallel: "parallel calls",
  tokensPerTurn: "tokens per turn",
  secondsPerTurn: "seconds per turn",
  decode: "decode tok/s",
  fallbacks: "fallbacks",
  brier: "Brier",
  ece: "ECE (10 bins)",
  auroc: "AUROC",
  threshold: "threshold",
  secondsPerQuestion: "seconds per question",
  inputTokensPerQuestion: "input tokens per question",
} as const;

export const notMeasured = "n/a";

export function rangeWords(min: string, max: string): string {
  return `${min} to ${max}`;
}

export function benchTitle(facts: {
  reference: string;
  kind: "chat" | "decide";
  repeats: number;
  size: number;
}): string {
  const unit = facts.kind === "chat" ? "turns" : "labelled rows";
  return `bench ${facts.reference} · ${facts.kind} · ${facts.repeats} repeats of ${facts.size} ${unit}`;
}

export function benchServerLine(kind: string, version: string | null, fingerprint: string): string {
  return `server ${kind} ${version ?? "version unknown"} · fingerprint ${fingerprint}`;
}

export const noThresholdLine = "no bar reaches the target with enough rows";

export function thresholdLine(facts: {
  threshold: number;
  precision: number;
  target: number;
}): string {
  return `${facts.threshold.toFixed(2)} for precision ${facts.precision.toFixed(2)} at target ${facts.target.toFixed(2)}`;
}

export function policyHead(name: string, next: string): string {
  return `policy · ${name} · ${next} next creature`;
}

export const inheritWord = "inherit";

export const inheritWhere = "from the workspace, then you, then the bot's model";

export function servedAt(places: readonly string[]): string {
  return `on ${places.join(", ")}`;
}

export const notInAnyMill = "not in any mill or on the market road";

export function lacksLine(missing: readonly string[]): string {
  return `lacks ${missing.map((capability) => capabilityWords[capability] ?? capability).join(" and ")}`;
}

export function profilePointer(name: string, open: string): string {
  return `read only here · change it in ${name}'s profile with ${open}`;
}

export const noCreatureLine = "No creature yet · its models show here once one exists";

export function noCreaturesLine(detail: string): string {
  return `No policy to show: ${asClause(detail)}`;
}

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function asClause(text: string): string {
  const trimmed = text.trim().replace(/\.$/, "");
  return /^[A-Z][a-z]/.test(trimmed) ? `${trimmed[0]?.toLowerCase()}${trimmed.slice(1)}` : trimmed;
}
