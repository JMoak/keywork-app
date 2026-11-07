import { tileFill } from "../../chrome/stamp.ts";
import type { RowDensity } from "../overview/rows.tsx";
import {
  acknowledgedLine,
  acknowledgedTag,
  acknowledgementNeeded,
  benchMeasures,
  contextLine,
  costSourceTags,
  healthWords,
  inheritWhere,
  inheritWord,
  lacksLine,
  licenseLine,
  marketHeld,
  marketModelHeld,
  marketRoad,
  marketRoadPhrase,
  millsHeld,
  missingLine,
  modelHeld,
  noClasses,
  noThresholdLine,
  notInAnyMill,
  notMeasured,
  previewTag,
  rangeWords,
  servedAt,
  serverHeld,
  tallyLine,
  thresholdLine,
  unknownCost,
  unknownLicense,
  unprobedCapability,
  unprobedClasses,
  unprobedLine,
} from "./copy.ts";
import {
  type BenchReport,
  type CreaturePolicy,
  type HealthState,
  type ModelClass,
  type ModelCost,
  type ModelRow,
  type ModelsReport,
  modelClasses,
  type ServerRow,
  type Spread,
} from "./wire.ts";

export type Place = { readonly kind: "parcel"; readonly node: string } | { readonly kind: "road" };

export type MillLine =
  | {
      readonly kind: "place";
      readonly key: string;
      readonly place: Place;
      readonly servers: readonly ServerRow[];
    }
  | {
      readonly kind: "server";
      readonly key: string;
      readonly place: Place;
      readonly server: ServerRow;
    }
  | {
      readonly kind: "model";
      readonly key: string;
      readonly place: Place;
      readonly server: ServerRow;
      readonly model: ModelRow;
    };

export type LineTone = "error" | "ask" | undefined;

export interface LineCells {
  readonly mark: string;
  readonly density: RowDensity;
  readonly name: string;
  readonly tag: string | undefined;
  readonly health: string;
  readonly held: string;
  readonly classes: string;
  readonly license: string;
  readonly cost: string;
  readonly tone: LineTone;
}

export interface DetailLine {
  readonly text: string;
  readonly tone: LineTone;
}

export interface DetailChords {
  readonly probe: string;
  readonly acknowledge: string;
}

export interface PolicyRow {
  readonly modelClass: ModelClass;
  readonly choice: string;
  readonly where: string;
  readonly inherited: boolean;
}

export interface BenchRow {
  readonly measure: string;
  readonly mean: string;
  readonly range: string;
}

export const previewDays = 30;

export function millLines(report: ModelsReport): MillLine[] {
  return [
    ...report.nodes.flatMap((node) =>
      placeLines({ kind: "parcel", node: node.node }, node.servers),
    ),
    ...placeLines({ kind: "road" }, report.market ?? []),
  ];
}

export function placeName(place: Place): string {
  return place.kind === "parcel" ? place.node : marketRoad;
}

export function serversAt(report: ModelsReport, place: Place): readonly ServerRow[] {
  if (place.kind === "road") return report.market ?? [];
  return report.nodes.find((node) => node.node === place.node)?.servers ?? [];
}

export function hasAnyMill(report: ModelsReport): boolean {
  return report.nodes.some((node) => node.servers.length > 0) || (report.market ?? []).length > 0;
}

export function millsTally(report: ModelsReport): string {
  const servers = report.nodes.flatMap((node) => node.servers);
  return tallyLine({
    parcels: report.nodes.length,
    mills: servers.length,
    down: servers.filter((server) => server.health.state === "down").length,
    loaded: servers.flatMap((server) => server.models).filter((model) => model.loaded).length,
    market: (report.market ?? []).length,
  });
}

export function cellsOf(line: MillLine, step: number, now: number): LineCells {
  switch (line.kind) {
    case "place":
      return {
        ...blankCells,
        name: placeName(line.place),
        held: line.place.kind === "parcel" ? millsHeld(line.servers.length) : "",
      };
    case "server":
      return {
        ...blankCells,
        ...healthLook(line.server.health.state, step, true),
        name: serverName(line.server, line.place),
        health: healthWords[line.server.health.state],
        held: serverHeldCell(line.server, line.place),
      };
    case "model":
      return modelCells(line.model, line.place, step, now);
  }
}

export function serverDetail(server: ServerRow, place: Place): DetailLine | undefined {
  const unrecognized = place.kind === "parcel" && server.fingerprint === null;
  if (server.health.state === "up" && !unrecognized) return undefined;
  return {
    text: server.health.detail,
    tone: server.health.state === "down" ? "error" : undefined,
  };
}

export function modelDetails(model: ModelRow, chords: DetailChords): DetailLine[] {
  const unprobed = model.ineligible.some((gap) => gap.missing.includes(unprobedCapability));
  const classes = unprobed
    ? [unprobedLine(chords.probe)]
    : model.ineligible.map((gap) => missingLine(gap.class, gap.missing));
  const context = model.contextAllocated === null ? [] : [contextLine(model.contextAllocated)];
  return [
    ...classes.map((text) => ({ text, tone: undefined })),
    ...context.map((text) => ({ text, tone: undefined })),
    ...licenseDetails(model, chords.acknowledge),
  ];
}

export function isPreview(released: string | null | undefined, now: number): boolean {
  if (released == null || !/^\d{4}-\d{2}-\d{2}$/.test(released)) return false;
  const ageDays = (now - Date.parse(released)) / 86_400_000;
  return ageDays >= 0 && ageDays < previewDays;
}

export function needsAcknowledgement(model: ModelRow): boolean {
  return model.licenseAcknowledgement === "required" && model.acknowledgedAt == null;
}

export function policyRows(
  creature: CreaturePolicy,
  report: ModelsReport | undefined,
): PolicyRow[] {
  return modelClasses.map((modelClass) => {
    const slot = creature.models[modelClass] ?? "inherit";
    if (slot === "inherit") {
      return { modelClass, choice: inheritWord, where: inheritWhere, inherited: true };
    }
    return {
      modelClass,
      choice: `${slot.provider}/${slot.model}`,
      where: whereServed(slot.model, modelClass, report),
      inherited: false,
    };
  });
}

export function benchRows(report: BenchReport): BenchRow[] {
  const m = benchMeasures;
  if (report.kind === "chat") {
    return [
      spreadRow(m.validAt1, report.validAt1, 2),
      spreadRow(m.toolName, report.toolCalls.name, 2),
      spreadRow(m.toolSchema, report.toolCalls.schema, 2),
      spreadRow(m.toolArguments, report.toolCalls.arguments, 2),
      spreadRow(m.noTool, report.toolCalls.noTool, 2),
      spreadRow(m.parallel, report.toolCalls.parallel, 2),
      spreadRow(m.tokensPerTurn, report.tokensPerTurn, 0),
      spreadRow(m.secondsPerTurn, report.secondsPerTurn, 2),
      spreadRow(m.decode, report.decodeTokensPerSecond, 1),
      countRow(m.fallbacks, report.fallbacks),
    ];
  }
  const fitted = report.thresholdAtPrecision;
  return [
    spreadRow(m.validAt1, report.validAt1, 2),
    spreadRow(m.brier, report.brier, 3),
    spreadRow(m.ece, report.ece, 3),
    spreadRow(m.auroc, report.auroc, 3),
    {
      measure: m.threshold,
      mean: fitted === null ? noThresholdLine : thresholdLine(fitted),
      range: "",
    },
    spreadRow(m.secondsPerQuestion, report.secondsPerQuestion, 3),
    spreadRow(m.inputTokensPerQuestion, report.inputTokensPerQuestion, 0),
    countRow(m.fallbacks, report.fallbacks),
  ];
}

const blankCells: LineCells = {
  mark: " ",
  density: "medium",
  name: "",
  tag: undefined,
  health: "",
  held: "",
  classes: "",
  license: "",
  cost: "",
  tone: undefined,
};

function placeLines(place: Place, servers: readonly ServerRow[]): MillLine[] {
  const key = place.kind === "parcel" ? `parcel ${place.node}` : "road";
  return [
    { kind: "place", key, place, servers },
    ...servers.flatMap((server): MillLine[] => [
      { kind: "server", key: `${key} ${server.root}`, place, server },
      ...server.models.map(
        (model): MillLine => ({
          kind: "model",
          key: `${key} ${server.root} ${model.id}`,
          place,
          server,
          model,
        }),
      ),
    ]),
  ];
}

function serverName(server: ServerRow, place: Place): string {
  const version = server.version === null ? [] : [server.version];
  const port = place.kind === "parcel" ? [`:${server.port}`] : [];
  return [server.kind, ...version, ...port].join(" ");
}

function serverHeldCell(server: ServerRow, place: Place): string {
  if (place.kind === "road") return marketHeld(server.models.length);
  return serverHeld(
    server.models.filter((model) => model.loaded).length,
    server.models.filter((model) => model.installed).length,
  );
}

function modelCells(model: ModelRow, place: Place, step: number, now: number): LineCells {
  const license = licenseCell(model);
  const onRoad = place.kind === "road";
  return {
    ...healthLook(model.health.state, step, model.loaded || onRoad),
    name: model.id,
    tag: isPreview(model.released, now) ? previewTag : undefined,
    health: healthWords[model.health.state],
    held: onRoad ? marketModelHeld : modelHeld(model.loaded, model.installed),
    classes: classesCell(model),
    license: license.text,
    cost: costCell(model.cost),
    tone: model.health.state === "down" ? "error" : license.tone,
  };
}

function healthLook(
  state: HealthState,
  step: number,
  held: boolean,
): Pick<LineCells, "mark" | "density" | "tone"> {
  switch (state) {
    case "up":
      return { mark: held ? "█" : "·", density: held ? "full" : "light", tone: undefined };
    case "saturated":
      return { mark: "█", density: "heavy", tone: undefined };
    case "loading":
      return { mark: tileFill[step % tileFill.length] ?? "▌", density: "heavy", tone: undefined };
    case "down":
      return { mark: " ", density: "light", tone: "error" };
  }
}

function classesCell(model: ModelRow): string {
  if (model.classes.length > 0) return model.classes.join(" ");
  const unprobed = model.ineligible.some((gap) => gap.missing.includes(unprobedCapability));
  return unprobed ? unprobedClasses : noClasses;
}

function licenseCell(model: ModelRow): { text: string; tone: LineTone } {
  if (model.license === null) return { text: unknownLicense, tone: undefined };
  if (model.acknowledgedAt != null) {
    return { text: `${model.license} · ${acknowledgedTag}`, tone: undefined };
  }
  if (needsAcknowledgement(model)) {
    return { text: `${model.license} · ${acknowledgementNeeded}`, tone: "ask" };
  }
  return { text: model.license, tone: undefined };
}

function licenseDetails(model: ModelRow, acknowledge: string): DetailLine[] {
  if (model.license === null) return [];
  if (model.acknowledgedAt != null) {
    return [{ text: acknowledgedLine(model.license, model.acknowledgedAt), tone: undefined }];
  }
  return needsAcknowledgement(model)
    ? [{ text: licenseLine(model.license, acknowledge), tone: "ask" }]
    : [];
}

function costCell(cost: ModelCost | null | undefined): string {
  if (cost == null) return unknownCost;
  const figures = `${cost.usdPerMillionInput.toFixed(2)}/${cost.usdPerMillionOutput.toFixed(2)}`;
  const tag = costSourceTags[cost.source];
  return tag === "" ? figures : `${figures} ${tag}`;
}

interface Serving {
  readonly place: string;
  readonly model: ModelRow;
}

function placePhrase(place: Place): string {
  return place.kind === "parcel" ? place.node : marketRoadPhrase;
}

function whereServed(
  modelId: string,
  modelClass: ModelClass,
  report: ModelsReport | undefined,
): string {
  const servings = report === undefined ? [] : servingsOf(report, modelId);
  if (servings.length === 0) return notInAnyMill;
  const eligible = servings.filter((serving) => serving.model.classes.includes(modelClass));
  if (eligible.length > 0) return servedAt(uniquePlaces(eligible));
  const missing = servings[0]?.model.ineligible.find((gap) => gap.class === modelClass)?.missing;
  const places = servedAt(uniquePlaces(servings));
  return missing === undefined || missing.length === 0
    ? places
    : `${places} · ${lacksLine(missing)}`;
}

function servingsOf(report: ModelsReport, modelId: string): Serving[] {
  const at = (place: Place, servers: readonly ServerRow[]): Serving[] =>
    servers.flatMap((server) =>
      server.models
        .filter((model) => model.id === modelId)
        .map((model) => ({ place: placePhrase(place), model })),
    );
  return [
    ...report.nodes.flatMap((node) => at({ kind: "parcel", node: node.node }, node.servers)),
    ...at({ kind: "road" }, report.market ?? []),
  ];
}

function uniquePlaces(servings: readonly Serving[]): string[] {
  return [...new Set(servings.map((serving) => serving.place))];
}

function spreadRow(measure: string, spread: Spread | null, digits: number): BenchRow {
  if (spread === null) return { measure, mean: notMeasured, range: "" };
  const range =
    spread.min === spread.max
      ? ""
      : rangeWords(spread.min.toFixed(digits), spread.max.toFixed(digits));
  return { measure, mean: spread.mean.toFixed(digits), range };
}

function countRow(measure: string, count: number): BenchRow {
  return { measure, mean: String(count), range: "" };
}
