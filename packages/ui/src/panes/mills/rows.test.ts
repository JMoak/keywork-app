import { describe, expect, it } from "vitest";
import { inheritWhere, notInAnyMill } from "./copy.ts";
import {
  benchRows,
  cellsOf,
  hasAnyMill,
  isPreview,
  type MillLine,
  millLines,
  millsTally,
  policyRows,
  serverDetail,
  serversAt,
} from "./rows.ts";
import {
  dayMs,
  daysBefore,
  decideReport,
  health,
  millsReport,
  moakOllama,
  model,
  openRouter,
  server,
} from "./testing.ts";
import type { ModelRow } from "./wire.ts";

const now = Date.UTC(2026, 10, 5, 12);
const parcel = { kind: "parcel", node: "moak-main" } as const;
const road = { kind: "road" } as const;
const host = server(moakOllama);

function modelLine(row: ModelRow, place: MillLine["place"] = parcel): MillLine {
  return { kind: "model", key: row.id, place, server: host, model: row };
}

describe("the mills rows", () => {
  it("marks a model preview only inside thirty days of a full release date", () => {
    expect(isPreview(daysBefore(now, 0), now)).toBe(true);
    expect(isPreview(daysBefore(now, 29), now)).toBe(true);
    expect(isPreview(daysBefore(now, 30), now)).toBe(false);
    expect(isPreview(new Date(now + 2 * dayMs).toISOString().slice(0, 10), now)).toBe(false);
    expect(isPreview("2026-10", now)).toBe(false);
    expect(isPreview(null, now)).toBe(false);
    expect(isPreview(undefined, now)).toBe(false);
  });

  it("prices per million where known, tags the source, and says unknown where none came", () => {
    const cost = (row: ModelRow) => cellsOf(modelLine(row), 0, now).cost;
    expect(cost(model("a"))).toBe("0.00/0.00 est");
    expect(cost(model("a", { cost: null }))).toBe("unknown");
    expect(cost(model("a", { cost: undefined }))).toBe("unknown");
    expect(
      cost(
        model("a", {
          cost: { source: "price_table", usdPerMillionInput: 3, usdPerMillionOutput: 15 },
        }),
      ),
    ).toBe("3.00/15.00 table");
    expect(
      cost(
        model("a", {
          cost: { source: "provider", usdPerMillionInput: 0.12, usdPerMillionOutput: 0 },
        }),
      ),
    ).toBe("0.12/0.00");
  });

  it("tells unprobed classes from none and asks for an acknowledgement in the license cell", () => {
    const cells = (row: ModelRow) => cellsOf(modelLine(row), 0, now);
    expect(cells(model("a", { ineligible: [{ class: "loop", missing: ["tools"] }] })).classes).toBe(
      "none",
    );
    expect(
      cells(model("a", { ineligible: [{ class: "loop", missing: ["capability record"] }] }))
        .classes,
    ).toBe("unprobed");
    expect(cells(model("a")).license).toBe("unknown");
    const gated = cells(model("a", { license: "Gemma", licenseAcknowledgement: "required" }));
    expect([gated.license, gated.tone]).toEqual(["Gemma · needs ack", "ask"]);
    const acked = cells(
      model("a", {
        license: "Gemma",
        licenseAcknowledgement: "required",
        acknowledgedAt: "2026-11-01T00:00:00.000Z",
      }),
    );
    expect([acked.license, acked.tone]).toEqual(["Gemma · acked", undefined]);
  });

  it("marks health by density: loaded full, installed light, loading animated, down missing", () => {
    const look = (row: ModelRow, step = 0) => {
      const cells = cellsOf(modelLine(row), step, now);
      return [cells.mark, cells.density, cells.tone];
    };
    expect(look(model("a", { loaded: true }))).toEqual(["█", "full", undefined]);
    expect(look(model("a"))).toEqual(["·", "light", undefined]);
    expect(look(model("a", { health: health("loading") }), 1)).toEqual(["▀", "heavy", undefined]);
    expect(look(model("a", { health: health("saturated") }))).toEqual(["█", "heavy", undefined]);
    expect(look(model("a", { health: health("down") }))).toEqual([" ", "light", "error"]);
    expect(cellsOf(modelLine(model("a"), road), 0, now).held).toBe("served");
  });

  it("walks parcels, then their mills, then their models, with the market road last", () => {
    const report = millsReport(now);
    const kinds = millLines(report).map((line) => `${line.kind} ${line.key}`);
    expect(kinds.slice(0, 3)).toEqual([
      "place parcel moak-main",
      `server parcel moak-main ${moakOllama}`,
      `model parcel moak-main ${moakOllama} qwen3.8-27b`,
    ]);
    expect(kinds.at(-4)).toBe("place road");
    expect(serversAt(report, road).map((row) => row.root)).toEqual([openRouter]);
    expect(serversAt(report, { kind: "parcel", node: "nowhere" })).toEqual([]);
    expect(millsTally(report)).toBe(
      "3 parcels · 3 mills · 1 down · 2 loaded · 1 on the market road",
    );
    expect(hasAnyMill({ generatedAt: "", nodes: [{ node: "a", servers: [] }] })).toBe(false);
    expect(hasAnyMill({ generatedAt: "", nodes: [], market: [server(openRouter)] })).toBe(true);
  });

  it("explains a server only when it is not plainly up and recognized", () => {
    expect(serverDetail(host, parcel)).toBeUndefined();
    expect(serverDetail(server(openRouter, { fingerprint: null }), road)).toBeUndefined();
    expect(
      serverDetail(
        server(moakOllama, { fingerprint: null, health: health("up", "only /v1") }),
        parcel,
      ),
    ).toEqual({ text: "only /v1", tone: undefined });
    expect(serverDetail(server(moakOllama, { health: health("down", "refused") }), parcel)).toEqual(
      { text: "refused", tone: "error" },
    );
  });

  it("reads a policy slot by slot with inherit spelled out and where each model is served", () => {
    const rows = policyRows(
      {
        slug: "moss",
        name: "Moss",
        models: { vision: { provider: "ollama", model: "gemma-4-31b" } },
      },
      undefined,
    );
    expect(rows.map((row) => [row.modelClass, row.choice, row.where])).toEqual([
      ["strong", "inherit", inheritWhere],
      ["loop", "inherit", inheritWhere],
      ["decide", "inherit", inheritWhere],
      ["vision", "ollama/gemma-4-31b", notInAnyMill],
    ]);
  });

  it("tables a decide bench with the fitted threshold and every spread", () => {
    const rows = benchRows(decideReport).map((row) => [row.measure, row.mean, row.range]);
    expect(rows).toEqual([
      ["valid@1", "1.00", ""],
      ["Brier", "0.081", "0.079 to 0.084"],
      ["ECE (10 bins)", "0.042", "0.040 to 0.045"],
      ["AUROC", "0.931", ""],
      ["threshold", "0.82 for precision 0.96 at target 0.95", ""],
      ["seconds per question", "0.041", "0.039 to 0.044"],
      ["input tokens per question", "310", ""],
      ["fallbacks", "0", ""],
    ]);
    const unfitted = benchRows({ ...decideReport, thresholdAtPrecision: null, brier: null });
    expect(unfitted[1]?.mean).toBe("n/a");
    expect(unfitted[4]?.mean).toBe("no bar reaches the target with enough rows");
  });
});
