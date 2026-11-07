import type { ServerFeed } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import type { KeyHints } from "../registry.ts";
import type {
  BenchReport,
  ChatBenchReport,
  CreaturePolicy,
  DecideBenchReport,
  HealthReading,
  HealthState,
  ModelRow,
  ModelsReport,
  ServerRow,
} from "./wire.ts";

export const dayMs = 86_400_000;

export function daysBefore(now: number, days: number): string {
  return new Date(now - days * dayMs).toISOString().slice(0, 10);
}

export function health(
  state: HealthState,
  detail = "",
  resident: boolean | null = null,
): HealthReading {
  return { state, resident, detail, checkedAt: "2026-11-05T09:00:00.000Z" };
}

export function model(id: string, extra: Partial<ModelRow> = {}): ModelRow {
  return {
    id,
    installed: true,
    loaded: false,
    contextAllocated: null,
    health: health("up", "ollama 0.40.14 answers", false),
    classes: [],
    ineligible: [],
    license: null,
    licenseAcknowledgement: "unknown",
    cost: { source: "local_estimate", usdPerMillionInput: 0, usdPerMillionOutput: 0 },
    ...extra,
  };
}

export function server(root: string, extra: Partial<ServerRow> = {}): ServerRow {
  return {
    kind: "ollama",
    root,
    port: Number(new URL(root).port || 443),
    source: "advertised",
    auth: "none",
    fingerprint: "ollama@0.40.14",
    version: "0.40.14",
    health: health("up", "ollama 0.40.14 answers"),
    models: [],
    ...extra,
  };
}

export const moakOllama = "http://100.101.1.10:11434";
export const moakLlama = "http://100.101.1.10:9931";
export const sparkOllama = "http://100.101.1.20:11434";
export const openRouter = "https://openrouter.ai/api";

export function millsReport(now: number): ModelsReport {
  return {
    generatedAt: "2026-11-05T09:00:00.000Z",
    nodes: [
      {
        node: "moak-main",
        servers: [
          server(moakOllama, {
            models: [
              model("qwen3.8-27b", {
                loaded: true,
                contextAllocated: 131_072,
                health: health("up", "ollama 0.40.14 answers", true),
                classes: ["strong", "vision"],
                ineligible: [
                  { class: "loop", missing: ["decodeTokensPerSecond"] },
                  { class: "decide", missing: ["decisionEndpoint"] },
                ],
                license: "Apache-2.0",
                licenseAcknowledgement: "not-required",
                released: daysBefore(now, 92),
              }),
              model("gemma-4-31b", {
                classes: ["vision"],
                ineligible: [
                  { class: "strong", missing: ["tools", "contextAllocated"] },
                  {
                    class: "loop",
                    missing: ["tools", "contextAllocated", "decodeTokensPerSecond"],
                  },
                  { class: "decide", missing: ["decisionEndpoint"] },
                ],
                license: "Gemma",
                licenseAcknowledgement: "required",
                released: daysBefore(now, 12),
              }),
              model("nimble", {
                loaded: true,
                health: health("up", "ollama 0.40.14 answers", true),
                classes: ["decide"],
                ineligible: [
                  { class: "strong", missing: ["tools", "contextAllocated"] },
                  {
                    class: "loop",
                    missing: ["tools", "contextAllocated", "decodeTokensPerSecond"],
                  },
                  { class: "vision", missing: ["imageInput"] },
                ],
                license: "MIT",
                licenseAcknowledgement: "not-required",
              }),
            ],
          }),
          server(moakLlama, {
            kind: "llama-server",
            port: 9931,
            source: "probed",
            fingerprint: "llama-server@b12122",
            version: "b12122",
            health: health("loading", "/health answers 503 while the model loads"),
            models: [
              model("qwen3.8-flash-next", {
                installed: false,
                health: health("loading", "qwen3.8-flash-next is loading", false),
                ineligible: unprobedEverywhere,
              }),
            ],
          }),
        ],
      },
      {
        node: "spark-ad4d",
        servers: [
          server(sparkOllama, {
            fingerprint: null,
            version: null,
            health: health("down", "connect ECONNREFUSED 100.101.1.20:11434"),
            models: [
              model("qwen3.8-flash-next", {
                health: health("down", "connect ECONNREFUSED 100.101.1.20:11434"),
                ineligible: unprobedEverywhere,
              }),
            ],
          }),
        ],
      },
      { node: "moak-laptop", servers: [] },
    ],
    market: [
      server(openRouter, {
        kind: "openrouter",
        port: 443,
        auth: "key",
        fingerprint: null,
        version: null,
        health: health("up", "openrouter answers"),
        models: [
          model("jev-1.14", {
            installed: false,
            loaded: true,
            classes: ["decide"],
            ineligible: [
              { class: "strong", missing: ["tools", "contextAllocated"] },
              { class: "loop", missing: ["tools", "contextAllocated"] },
              { class: "vision", missing: ["imageInput"] },
            ],
            license: "proprietary",
            licenseAcknowledgement: "required",
            acknowledgedAt: "2026-10-16T08:00:00.000Z",
            cost: { source: "provider", usdPerMillionInput: 0.12, usdPerMillionOutput: 0 },
          }),
          model("glm-5", {
            installed: false,
            loaded: true,
            ineligible: unprobedEverywhere,
            cost: null,
          }),
        ],
      }),
    ],
  };
}

export const creatures: readonly CreaturePolicy[] = [
  {
    slug: "wren",
    name: "Wren",
    models: {
      strong: "inherit",
      loop: { provider: "ollama", model: "qwen3.8-27b" },
      decide: { provider: "openrouter", model: "jev-1.14" },
      vision: "inherit",
    },
  },
  {
    slug: "tam",
    name: "Tam",
    models: {
      strong: { provider: "lmstudio", model: "glm-4.6-air" },
      loop: "inherit",
      decide: "inherit",
      vision: { provider: "ollama", model: "gemma-4-31b" },
    },
  },
];

export const chatReport: ChatBenchReport = {
  kind: "chat",
  reference: "ollama/qwen3.8-27b",
  fingerprint: { id: "ollama@0.40.14", kind: "ollama", version: "0.40.14", build: null },
  trace: "replayed-edit",
  repeats: 3,
  turns: 6,
  validAt1: { mean: 0.94, min: 0.83, max: 1 },
  toolCalls: {
    name: { mean: 1, min: 1, max: 1 },
    schema: { mean: 0.97, min: 0.92, max: 1 },
    arguments: { mean: 0.89, min: 0.83, max: 0.92 },
    noTool: { mean: 1, min: 1, max: 1 },
    parallel: null,
  },
  tokensPerTurn: { mean: 412, min: 388, max: 440 },
  secondsPerTurn: { mean: 5.62, min: 5.1, max: 6.05 },
  decodeTokensPerSecond: { mean: 74.8, min: 73.9, max: 75.6 },
  fallbacks: 0,
};

export const decideReport: DecideBenchReport = {
  kind: "decide",
  reference: "ollama/nimble",
  fingerprint: { id: "ollama@0.40.14", kind: "ollama", version: "0.40.14", build: null },
  rows: 40,
  repeats: 3,
  validAt1: { mean: 1, min: 1, max: 1 },
  brier: { mean: 0.081, min: 0.079, max: 0.084 },
  ece: { mean: 0.042, min: 0.04, max: 0.045 },
  auroc: { mean: 0.931, min: 0.931, max: 0.931 },
  thresholdAtPrecision: { target: 0.95, threshold: 0.82, precision: 0.96, coverage: 0.61, n: 40 },
  secondsPerQuestion: { mean: 0.041, min: 0.039, max: 0.044 },
  inputTokensPerQuestion: { mean: 310, min: 310, max: 310 },
  fallbacks: 0,
};

export const allOperations = [
  "listModels",
  "probeModels",
  "listCreatures",
  "acknowledgeModelLicense",
  "benchModel",
  "readModelBench",
];

export const servedOperations18 = ["listModels", "probeModels", "listCreatures"];

export interface FakeMillsServer {
  readonly fetch: typeof fetch;
  readonly calls: string[];
  report: ModelsReport | number;
  creatures: readonly CreaturePolicy[] | number;
  lastBench: BenchReport | null;
  bench: BenchReport;
}

export function fakeMillsServer(now: number): FakeMillsServer {
  const state: FakeMillsServer = {
    calls: [],
    report: millsReport(now),
    creatures,
    lastBench: chatReport,
    bench: chatReport,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : "";
      state.calls.push(`${method} ${url.pathname}${url.search}${body === "" ? "" : ` ${body}`}`);
      return answer(state, method, url, body);
    },
  };
  return state;
}

export function fakeFeed(): { feed: ServerFeed; emit(...types: string[]): void } {
  const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
  return {
    feed: {
      open: async () => undefined,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      subscribeSession: () => () => undefined,
      onNotice: () => () => undefined,
      whenLost: () => () => undefined,
      close: () => undefined,
    },
    emit: (...types) => {
      const batch = types.map(
        (type, index) =>
          ({
            id: index + 1,
            ts: "2026-11-05T09:00:00.000Z",
            sessionId: "",
            type,
            payload: {},
          }) as unknown as BusEnvelope,
      );
      for (const listener of [...listeners]) listener(batch);
    },
  };
}

export function localKeys(bindings: Readonly<Record<string, string>>): KeyHints {
  return {
    chord: (action) => bindings[action] ?? "an unbound key",
    leader: () => "ctrl+k",
  };
}

export function paneText(container: HTMLElement): string {
  const parts = container.querySelectorAll<HTMLElement>(
    [
      ".kw-ov-head",
      ".kw-mills-heads",
      ".kw-mills-row",
      ".kw-mills-sub",
      ".kw-mills-bench-line",
      ".kw-mills-bench-table tr",
      ".kw-mills-policy-row",
      ".kw-ov-line",
      ".kw-empty",
    ].join(", "),
  );
  return `${[...parts].map(lineOf).join("\n")}\n`;
}

const unprobedEverywhere = (["strong", "loop", "decide", "vision"] as const).map((modelClass) => ({
  class: modelClass,
  missing: ["capability record"],
}));

function answer(state: FakeMillsServer, method: string, url: URL, body: string): Response {
  const route = `${method} ${url.pathname}`;
  if (route === "GET /models") {
    return typeof state.report === "number"
      ? failure(state.report, "This host serves no model inventory.")
      : json(state.report);
  }
  if (route === "GET /creatures") {
    return typeof state.creatures === "number"
      ? failure(state.creatures, "This host serves no creatures.")
      : json({ creatures: state.creatures });
  }
  if (route === "POST /models/probe") {
    const { endpoint } = JSON.parse(body) as { endpoint: string };
    const down = endpoint === sparkOllama;
    return json({
      root: endpoint,
      status: down ? "unreachable" : "recognized",
      fingerprint: down
        ? null
        : { id: "ollama@0.40.14", kind: "ollama", version: "0.40.14", build: null },
      health: null,
      records: [],
      listedOnly: [],
      detail: down ? "connect ECONNREFUSED" : null,
    });
  }
  if (route === "POST /models/acknowledgements") {
    const { model: id, license } = JSON.parse(body) as { model: string; license: string };
    return json({ model: id, license, acknowledgedAt: "2026-11-05T09:30:00.000Z" });
  }
  if (route === "POST /models/bench") return json(state.bench);
  if (route === "GET /models/bench") return json({ report: state.lastBench });
  return failure(404, "not found");
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}

function failure(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status });
}

function lineOf(element: HTMLElement): string {
  const text = (selector: string): string =>
    element.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  if (element.matches(".kw-mills-row, .kw-mills-heads")) {
    const depth = { place: "", server: "  ", model: "    " }[element.dataset.kind ?? ""] ?? "";
    const mark = element.querySelector(".kw-ov-mark")?.textContent ?? " ";
    const name = `${depth}${text("[data-cell='name']")}`;
    return [
      mark,
      name.padEnd(32),
      text("[data-cell='health']").padEnd(10),
      text("[data-cell='held']").padEnd(22),
      text("[data-cell='classes']").padEnd(14),
      text("[data-cell='license']").padEnd(22),
      text("[data-cell='cost']"),
    ]
      .join(" ")
      .trimEnd();
  }
  if (element.matches(".kw-mills-sub, .kw-mills-bench-line")) {
    return `        ${element.textContent?.trim() ?? ""}`;
  }
  if (element.matches(".kw-mills-bench-table tr")) {
    const cells = [...element.children].map((cell) => cell.textContent?.trim() ?? "");
    return `        ${(cells[0] ?? "").padEnd(28)}${(cells[1] ?? "").padEnd(8)}${cells[2] ?? ""}`.trimEnd();
  }
  if (element.matches(".kw-mills-policy-row")) {
    return `   ${text("[data-cell='class']").padEnd(8)}${text("[data-cell='choice']").padEnd(28)}${text("[data-cell='where']")}`;
  }
  if (element.matches(".kw-ov-head")) {
    return [...element.children].map((part) => part.textContent?.trim() ?? "").join("   ");
  }
  return element.textContent?.trim() ?? "";
}
