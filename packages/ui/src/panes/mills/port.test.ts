import { describe, expect, it, vi } from "vitest";
import { millsPortOver, proposedOperations, servedOperations } from "./port.ts";
import { chatReport, creatures, moakOllama } from "./testing.ts";

type Answer = (path: string, init: RequestInit | undefined) => Response | Promise<Response>;

function portOver(answer: Answer, operations: readonly string[] = []) {
  const calls: string[] = [];
  const served = vi.fn(async () => new Set(operations));
  const port = millsPortOver(async (path, init) => {
    calls.push(`${init?.method ?? "GET"} ${path}`);
    return answer(path, init);
  }, served);
  return { port, calls, served };
}

const ok = (value: unknown) => () => new Response(JSON.stringify(value));
const refusing = (status: number, body: string) => () => new Response(body, { status });
const target = { endpoint: moakOllama, model: "qwen3.8-27b" };

describe("the mills port", () => {
  it("names each refusal by what the keeper can do about it", async () => {
    const reading = (answer: Answer) => portOver(answer).port.inventory();
    expect(
      await reading(refusing(503, '{"error":"This host serves no model inventory."}')),
    ).toEqual({ refused: "unserved", detail: "This host serves no model inventory." });
    expect(await reading(refusing(404, "gone"))).toEqual({ refused: "missing", detail: "gone" });
    expect(await reading(refusing(400, '{"error":"bad node"}'))).toEqual({
      refused: "invalid",
      detail: "bad node",
    });
    expect(await reading(refusing(500, ""))).toEqual({ refused: "failed", detail: "500" });
    expect(
      await reading(() => {
        throw new Error("socket hang up");
      }),
    ).toEqual({ refused: "unreachable", detail: "socket hang up" });
  });

  it("reads the 1.8 routes with their bodies and envelopes", async () => {
    const { port, calls } = portOver((path) =>
      path === "/creatures"
        ? ok({ creatures })()
        : ok({ root: moakOllama, status: "recognized" })(),
    );
    expect(await port.creatures()).toEqual(creatures);
    await port.probe(moakOllama);
    expect(calls).toEqual(["GET /creatures", "POST /models/probe"]);
  });

  it("never calls a proposed route the node does not list in its document", async () => {
    const { port, calls, served } = portOver(ok({}));
    expect(await port.acknowledge(target, "Gemma")).toEqual({
      refused: "unserved",
      detail: proposedOperations.acknowledge,
    });
    expect(await port.bench(target)).toEqual({
      refused: "unserved",
      detail: proposedOperations.bench,
    });
    expect(await port.lastBench(target)).toEqual({
      refused: "unserved",
      detail: proposedOperations.lastBench,
    });
    expect(calls).toEqual([]);
    expect(served).toHaveBeenCalledTimes(1);
  });

  it("calls the proposed routes once the node serves them", async () => {
    const { port, calls } = portOver(
      (path) =>
        path.startsWith("/models/bench?") ? ok({ report: chatReport })() : ok(chatReport)(),
      Object.values(proposedOperations),
    );
    expect(await port.bench(target)).toEqual(chatReport);
    expect(await port.lastBench(target)).toEqual(chatReport);
    await port.acknowledge(target, "Gemma");
    expect(calls).toEqual([
      "POST /models/bench",
      `GET /models/bench?endpoint=${encodeURIComponent(moakOllama)}&model=qwen3.8-27b`,
      "POST /models/acknowledgements",
    ]);
  });

  it("treats a node whose document cannot be read as serving nothing proposed", async () => {
    const broken = { document: async () => Promise.reject(new Error("offline")) };
    expect(await servedOperations(broken)).toEqual(new Set());
    const listed = {
      document: async () => ({ version: "1", operationIds: ["listModels", "benchModel"] }),
    };
    expect(await servedOperations(listed)).toEqual(new Set(["listModels", "benchModel"]));
  });
});
