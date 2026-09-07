import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sseFrames } from "@keywork-app/client";
import { type BusEnvelope, engineEventTypes } from "@keywork-app/protocol";
import { repoRoot } from "../lib/repo-files.ts";

export const fixturesDir = join(repoRoot, "packages/client/src/fixtures");

const keyworkRepo = resolve(process.env.KEYWORK_REPO ?? join(repoRoot, "..", "keywork"));
const token = "fixture-token";
const origin = "http://keywork.fixture";

interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

type Delta =
  | { type: "text"; text: string }
  | { type: "visible-thinking"; text: string }
  | {
      type: "tool-call";
      call: { type: "tool-call"; callId: string; name: string; arguments: object };
    }
  | { type: "done"; usage: Usage };

interface Provider {
  name: string;
  modelId?: string;
  stream(request: { signal?: AbortSignal }): AsyncIterable<Delta>;
}

interface EngineModule {
  MockProvider: new (turns: Delta[][], modelId?: string) => Provider;
  textTurn(text: string, usage?: Usage): Delta[];
  toolCallTurn(
    call: Delta & { type: "tool-call" } extends { call: infer C } ? C : never,
    usage?: Usage,
  ): Delta[];
}

interface EventLogLike {
  subscribe(listener: (envelope: BusEnvelope) => void): () => void;
}

interface ServerModule {
  EventLog: new (options: { capacity?: number; now: () => Date }) => EventLogLike;
  createKeyworkServer(options: {
    token: string;
    host: unknown;
    log: EventLogLike;
    version: string;
  }): { fetch(request: Request): Promise<Response>; close(): Promise<void> };
}

interface ServeModule {
  fileSessionHost(options: {
    cwd: string;
    sessionDir: string;
    userRoot: string;
    projectTrusted: boolean;
    provider: Provider;
    permissions: (call: unknown) => "allow" | "ask" | "deny" | undefined;
    log: EventLogLike;
  }): unknown;
}

interface Scenario {
  name: string;
  provider(engine: EngineModule): Provider;
  permissions: "allow" | "default";
  drive(stage: Stage): Promise<void>;
  capacity?: number;
}

interface Stage {
  sessionId: string;
  call(path: string, init?: RequestInit): Promise<Response>;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  until(type: string, count?: number): Promise<void>;
  seen: BusEnvelope[];
}

const usage: Usage = { inputTokens: 12, outputTokens: 5 };

const bashCall = {
  type: "tool-call",
  callId: "c1",
  name: "bash",
  arguments: { command: "echo served" },
} as const;

export const scenarios: readonly Scenario[] = [
  {
    name: "plain",
    provider: (engine) =>
      new engine.MockProvider([engine.textTurn("Hello from keywork.", usage)], "mock-model"),
    permissions: "allow",
    drive: async (stage) => {
      await stage.prompt("say hello");
      await stage.until("turn.completed");
    },
  },
  {
    name: "thinking",
    provider: (engine) =>
      new engine.MockProvider(
        [
          [
            { type: "visible-thinking", text: "Two files changed; " },
            { type: "visible-thinking", text: "the second one matters." },
            { type: "text", text: "The change is in " },
            { type: "text", text: "`layout.ts`." },
            { type: "done", usage },
          ],
        ],
        "mock-model",
      ),
    permissions: "allow",
    drive: async (stage) => {
      await stage.prompt("what changed?");
      await stage.until("turn.completed");
    },
  },
  {
    name: "tool",
    provider: (engine) =>
      new engine.MockProvider(
        [engine.toolCallTurn(bashCall), engine.textTurn("It printed served.", usage)],
        "mock-model",
      ),
    permissions: "allow",
    drive: async (stage) => {
      await stage.prompt("run echo served");
      await stage.until("turn.completed");
    },
  },
  {
    name: "denied",
    provider: (engine) =>
      new engine.MockProvider(
        [engine.toolCallTurn(bashCall), engine.textTurn("I could not run it.", usage)],
        "mock-model",
      ),
    permissions: "default",
    drive: async (stage) => {
      await stage.prompt("run echo served");
      await stage.until("turn.completed");
    },
  },
  {
    name: "interrupt",
    provider: () => hangingProvider(),
    permissions: "allow",
    drive: async (stage) => {
      await stage.prompt("wait forever");
      await stage.until("turn.delta");
      await stage.abort();
      await stage.until("turn.interrupted");
    },
  },
  {
    name: "queued",
    provider: (engine) => releasingProvider(engine),
    permissions: "allow",
    drive: async (stage) => {
      await stage.prompt("first");
      await stage.until("turn.delta");
      await stage.prompt("second");
      await stage.until("queue.changed");
      release?.();
      await stage.until("turn.completed", 2);
    },
  },
];

let release: (() => void) | undefined;

function hangingProvider(): Provider {
  return {
    name: "hanging",
    async *stream(request) {
      yield { type: "text", text: "Working on it" };
      await new Promise<void>((resolveWait) => {
        if (request.signal?.aborted) resolveWait();
        request.signal?.addEventListener("abort", () => resolveWait(), { once: true });
      });
      request.signal?.throwIfAborted();
    },
  };
}

function releasingProvider(engine: EngineModule): Provider {
  const second = new engine.MockProvider([engine.textTurn("Second answer.", usage)], "mock-model");
  let first = true;
  return {
    name: "releasing",
    modelId: "mock-model",
    async *stream(request) {
      if (!first) {
        yield* second.stream(request);
        return;
      }
      first = false;
      yield { type: "text", text: "First answer, " };
      await new Promise<void>((resolveWait) => {
        release = resolveWait;
      });
      yield { type: "text", text: "finished." };
      yield { type: "done", usage };
    },
  };
}

export async function recordAll(): Promise<string[]> {
  const engine = (await import(moduleUrl("packages/engine/src/index.ts"))) as EngineModule;
  const server = (await import(moduleUrl("packages/server/src/index.ts"))) as ServerModule;
  const serve = (await import(moduleUrl("packages/cli/src/serve.ts"))) as ServeModule;
  await mkdir(fixturesDir, { recursive: true });
  const written: string[] = [];
  for (const scenario of scenarios) {
    const recorded = await record(scenario, { engine, server, serve });
    await writeFile(join(fixturesDir, `${scenario.name}.jsonl`), recorded.jsonl);
    written.push(`${scenario.name}.jsonl`);
    for (const [name, text] of Object.entries(recorded.extras)) {
      await writeFile(join(fixturesDir, name), text);
      written.push(name);
    }
  }
  return written;
}

interface Modules {
  engine: EngineModule;
  server: ServerModule;
  serve: ServeModule;
}

interface Recorded {
  jsonl: string;
  extras: Record<string, string>;
}

async function record(scenario: Scenario, modules: Modules): Promise<Recorded> {
  const cwd = await mkdtemp(join(tmpdir(), "keywork-app-fixture-"));
  const sessionDir = join(cwd, ".sessions");
  const userRoot = join(cwd, ".user");
  await mkdir(sessionDir, { recursive: true });
  await mkdir(userRoot, { recursive: true });
  const clock = steppingClock();
  const log = new modules.server.EventLog({
    now: clock,
    ...(scenario.capacity !== undefined && { capacity: scenario.capacity }),
  });
  const host = modules.serve.fileSessionHost({
    cwd,
    sessionDir,
    userRoot,
    projectTrusted: false,
    provider: scenario.provider(modules.engine),
    permissions: () => (scenario.permissions === "allow" ? "allow" : undefined),
    log,
  });
  const server = modules.server.createKeyworkServer({ token, host, log, version: "fixture" });
  const call = (path: string, init: RequestInit = {}) =>
    server.fetch(
      new Request(`${origin}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
      }),
    );
  try {
    const created = (await (await call("/sessions", { method: "POST" })).json()) as { id: string };
    const stream = await call("/events");
    const seen: BusEnvelope[] = [];
    const waiters: Array<{ type: string; count: number; resolve: () => void }> = [];
    const pump = (async () => {
      for await (const frame of sseFrames(stream.body as ReadableStream<Uint8Array>)) {
        if (frame.data === "") continue;
        const envelope = JSON.parse(frame.data) as BusEnvelope;
        seen.push(envelope);
        for (const waiter of waiters.splice(0)) {
          if (seen.filter((item) => item.type === waiter.type).length >= waiter.count)
            waiter.resolve();
          else waiters.push(waiter);
        }
      }
    })();
    const stage: Stage = {
      sessionId: created.id,
      call,
      seen,
      prompt: async (text) => {
        await call(`/sessions/${created.id}/prompt`, {
          method: "POST",
          body: JSON.stringify({ text }),
        });
      },
      abort: async () => {
        await call(`/sessions/${created.id}/abort`, { method: "POST" });
      },
      until: (type, count = 1) =>
        new Promise<void>((resolveWait) => {
          if (seen.filter((item) => item.type === type).length >= count) resolveWait();
          else waiters.push({ type, count, resolve: resolveWait });
        }),
    };
    await scenario.drive(stage);
    const extras = await extrasFor(scenario, stage, call);
    await server.close();
    await pump.catch(() => undefined);
    const normalize = normalizer(created.id, cwd);
    return {
      jsonl: `${seen.map((envelope) => normalize(JSON.stringify(envelope))).join("\n")}\n`,
      extras: Object.fromEntries(
        Object.entries(extras).map(([name, text]) => [name, normalize(text)]),
      ),
    };
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extrasFor(
  scenario: Scenario,
  stage: Stage,
  call: Stage["call"],
): Promise<Record<string, string>> {
  if (scenario.name === "plain") {
    const doc = await (await call("/doc")).text();
    const lastId = stage.seen.at(-1)?.id ?? 0;
    const replayed = await call("/events", { headers: { "last-event-id": "0" } });
    const raw = await readUntil(replayed, `\nid: ${lastId}\n`);
    return { "doc.json": `${JSON.stringify(JSON.parse(doc), null, 2)}\n`, "plain.sse": raw };
  }
  if (scenario.name === "tool") {
    const detail = await (await call(`/sessions/${stage.sessionId}`)).text();
    const sessions = await (await call("/sessions")).text();
    return {
      "session-detail.json": `${JSON.stringify(JSON.parse(detail), null, 2)}\n`,
      "sessions.json": `${JSON.stringify(JSON.parse(sessions), null, 2)}\n`,
    };
  }
  return {};
}

async function readUntil(response: Response, marker: string): Promise<string> {
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value, { stream: true });
    const end = text.indexOf("\n\n", text.indexOf(marker));
    if (text.includes(marker) && end !== -1) {
      await reader.cancel().catch(() => undefined);
      return text.slice(0, end + 2);
    }
  }
}

function normalizer(sessionId: string, cwd: string): (text: string) => string {
  const escapedCwd = JSON.stringify(cwd).slice(1, -1);
  const queueIds = new Map<string, string>();
  const queueId = (raw: string): string => {
    const known = queueIds.get(raw);
    if (known !== undefined) return known;
    const assigned = `q${queueIds.size + 1}`;
    queueIds.set(raw, assigned);
    return assigned;
  };
  return (text) =>
    text
      .replaceAll(sessionId, "s1")
      .replaceAll(escapedCwd, "<cwd>")
      .replaceAll(cwd, "<cwd>")
      .replace(uuid, queueId)
      .replace(wallClockField, '"$1": "2026-09-07T12:00:00.000Z"');
}

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const wallClockField = /"(createdAt|lastActivityAt)":\s*"[^"]+"/g;

function steppingClock(): () => Date {
  let now = Date.parse("2026-09-07T12:00:00.000Z");
  return () => {
    now += 250;
    return new Date(now);
  };
}

function moduleUrl(relative: string): string {
  return pathToFileURL(join(keyworkRepo, relative)).href;
}

if (import.meta.main) {
  const written = await recordAll();
  console.log(`recorded ${written.length} fixtures from ${keyworkRepo} into ${fixturesDir}`);
  for (const name of written) console.log(`  ${name}`);
  console.log(`event vocabulary: ${engineEventTypes.length} types`);
}
