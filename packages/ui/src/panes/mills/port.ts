import type { Fetch, KeyworkClient } from "@keywork-app/client";
import { hostFetch } from "../../host/transport.ts";
import type { ShellSeams } from "../registry.ts";
import {
  type Acknowledged,
  type BenchReport,
  type CreaturePolicy,
  isMillsRefusal,
  type MillsRefusal,
  type ModelsReport,
  type ModelTarget,
  type ProbeReport,
  type Reading,
  type RefusalKind,
} from "./wire.ts";

export interface MillsPort {
  inventory(): Promise<Reading<ModelsReport>>;
  probe(endpoint: string): Promise<Reading<ProbeReport>>;
  creatures(): Promise<Reading<readonly CreaturePolicy[]>>;
  acknowledge(target: ModelTarget, license: string): Promise<Reading<Acknowledged>>;
  bench(target: ModelTarget): Promise<Reading<BenchReport>>;
  lastBench(target: ModelTarget): Promise<Reading<BenchReport | null>>;
}

export const proposedOperations = {
  acknowledge: "acknowledgeModelLicense",
  bench: "benchModel",
  lastBench: "readModelBench",
} as const;

export function millsPortOf(shell: Pick<ShellSeams, "host" | "workspace" | "client">): MillsPort {
  return millsPortOver(hostFetch(shell.host, shell.workspace), () =>
    servedOperations(shell.client),
  );
}

export function millsPortOver(fetch: Fetch, served: () => Promise<ReadonlySet<string>>): MillsPort {
  const ask = asker(fetch);
  const serves = once(served);
  const whenServed = async <T>(
    operation: string,
    call: () => Promise<Reading<T>>,
  ): Promise<Reading<T>> =>
    (await serves()).has(operation) ? call() : { refused: "unserved", detail: operation };
  return {
    inventory: () => ask<ModelsReport>("GET", "/models"),
    probe: (endpoint) => ask<ProbeReport>("POST", "/models/probe", { endpoint, refresh: true }),
    creatures: async () =>
      unwrapped(await ask<{ creatures: CreaturePolicy[] }>("GET", "/creatures"), "creatures"),
    acknowledge: (target, license) =>
      whenServed(proposedOperations.acknowledge, () =>
        ask<Acknowledged>("POST", "/models/acknowledgements", { ...target, license }),
      ),
    bench: (target) =>
      whenServed(proposedOperations.bench, () => ask<BenchReport>("POST", "/models/bench", target)),
    lastBench: (target) =>
      whenServed(proposedOperations.lastBench, async () =>
        unwrapped(
          await ask<{ report: BenchReport | null }>("GET", `/models/bench?${queryOf(target)}`),
          "report",
        ),
      ),
  };
}

export async function servedOperations(
  client: Pick<KeyworkClient, "document">,
): Promise<ReadonlySet<string>> {
  try {
    return new Set((await client.document()).operationIds);
  } catch {
    return new Set();
  }
}

type Ask = <T>(method: "GET" | "POST", path: string, body?: object) => Promise<Reading<T>>;

function asker(fetch: Fetch): Ask {
  return async <T>(method: "GET" | "POST", path: string, body?: object) => {
    try {
      const response = await fetch(path, {
        method,
        ...(body !== undefined && {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      });
      if (response.ok) return (await response.json()) as T;
      return { refused: refusalKindOf(response.status), detail: await errorTextOf(response) };
    } catch (cause) {
      return {
        refused: "unreachable",
        detail: cause instanceof Error ? cause.message : String(cause),
      };
    }
  };
}

function refusalKindOf(status: number): RefusalKind {
  if (status === 503) return "unserved";
  if (status === 404) return "missing";
  if (status === 400) return "invalid";
  return "failed";
}

async function errorTextOf(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  const said = errorFieldOf(text);
  if (said !== undefined) return said;
  return text === "" ? `${response.status} ${response.statusText}`.trim() : text;
}

function errorFieldOf(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && "error" in parsed
      ? String(parsed.error)
      : undefined;
  } catch {
    return undefined;
  }
}

function unwrapped<Key extends string, T>(
  reading: Reading<Record<Key, T>>,
  key: Key,
): T | MillsRefusal {
  return isMillsRefusal(reading) ? reading : reading[key];
}

function queryOf(target: ModelTarget): string {
  return new URLSearchParams({ endpoint: target.endpoint, model: target.model }).toString();
}

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loaded: Promise<T> | undefined;
  return () => {
    loaded ??= load();
    return loaded;
  };
}
