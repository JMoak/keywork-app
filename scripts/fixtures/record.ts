import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { sseFrames } from "@keywork-app/client";
import { type BusEnvelope, engineEventTypes } from "@keywork-app/protocol";
import { keyworkModuleUrl, keyworkRepo } from "../lib/keywork-checkout.ts";
import { repoRoot } from "../lib/repo-files.ts";
import { seedVault } from "./seed-vault.ts";

export const fixturesDir = join(repoRoot, "packages/client/src/fixtures");
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
  fileSessionHost(
    options: HostSeams & {
      cwd: string;
      sessionDir: string;
      userRoot: string;
      projectTrusted: boolean;
      provider: Provider;
      permissions: (call: unknown) => "allow" | "ask" | "deny" | undefined;
      askTimeoutMs?: number;
      checkpointsGitDir?: string;
      log: EventLogLike;
    },
  ): unknown;
}

interface ServerTestingModule {
  inferenceOver(models: Readonly<Record<string, Provider>>): unknown;
}

interface HostSeams {
  inference?: unknown;
  presets?: { active(): string; apply(name: string): Promise<void> };
}

interface Scenario {
  name: string;
  provider(engine: EngineModule): Provider;
  seams?(engine: EngineModule, testing: ServerTestingModule): HostSeams;
  permissions: "allow" | "default";
  drive(stage: Stage): Promise<void>;
  capacity?: number;
  askTimeoutMs?: number;
  trusted?: boolean;
  prepare?(cwd: string): Promise<void>;
}

interface Stage {
  sessionId: string;
  call(path: string, init?: RequestInit): Promise<Response>;
  prompt(text: string): Promise<void>;
  inject(text: string, client: string): Promise<void>;
  abort(): Promise<void>;
  answer(callId: string, verdict: "granted" | "denied"): Promise<void>;
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

const writeCall = {
  type: "tool-call",
  callId: "w1",
  name: "write",
  arguments: { path: "notes.txt", content: "one\ntwo\n" },
} as const;

async function post(stage: Stage, path: string, body?: unknown): Promise<unknown> {
  const response = await stage.call(path, {
    method: "POST",
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text.startsWith("<") ? "<html>" : JSON.parse(text) };
}

async function get(stage: Stage, path: string): Promise<unknown> {
  const response = await stage.call(path);
  return { status: response.status, body: await response.json() };
}

const controlAnswers = new Map<string, unknown>();

function controlProviders(engine: EngineModule): Record<string, Provider> {
  return {
    "mock/alpha": new engine.MockProvider([engine.textTurn("Lights on.", usage)], "alpha"),
    "mock/beta": new engine.MockProvider([], "beta"),
  };
}

let controlModels: Record<string, Provider> = {};

function presetSwitch(): NonNullable<HostSeams["presets"]> {
  let active = "standard";
  return {
    active: () => active,
    apply: async (name) => {
      active = name;
    },
  };
}

async function driveControls(stage: Stage): Promise<void> {
  const session = `/sessions/${stage.sessionId}`;
  const answer = async (name: string, reading: Promise<unknown>) => {
    controlAnswers.set(name, await reading);
  };
  await stage.prompt("turn on the lights");
  await stage.until("turn.completed");
  await answer("model", post(stage, `${session}/model`, { reference: "mock/beta" }));
  await answer("modelUnknown", post(stage, `${session}/model`, { reference: "mock/gamma" }));
  await answer("thinking", post(stage, `${session}/thinking`, { on: true }));
  await answer("effort", post(stage, `${session}/effort`, { level: "high" }));
  await answer("effortUnknown", post(stage, `${session}/effort`, { level: "extreme" }));
  await answer("rename", post(stage, `${session}/rename`, { title: "Lights" }));
  await answer("context", get(stage, `${session}/context`));
  await answer("cost", get(stage, `${session}/cost`));
  await answer("undo", post(stage, `${session}/undo`));
  await answer("undoAgain", post(stage, `${session}/undo`));
  await answer("redo", post(stage, `${session}/redo`));
  await answer("redoAgain", post(stage, `${session}/redo`));
  await answer("presetLoosening", post(stage, "/preset", { name: "open" }));
  await answer("preset", post(stage, "/preset", { name: "open", confirmed: true }));
  await answer("export", post(stage, `${session}/export`, {}));
  await answer("sessions", get(stage, "/sessions"));
  await stage.until("session.state", 6);
  await stage.until("gate.preset");
}

async function entryIdsOf(stage: Stage): Promise<string[]> {
  const tree = (await (await stage.call(`/sessions/${stage.sessionId}/entries`)).json()) as {
    entries: Array<{ id: string }>;
  };
  return tree.entries.map((entry) => entry.id);
}

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
    askTimeoutMs: 50,
    drive: async (stage) => {
      await stage.prompt("run echo served");
      await stage.until("turn.completed");
    },
  },
  {
    name: "asked-granted",
    provider: (engine) =>
      new engine.MockProvider(
        [engine.toolCallTurn(bashCall), engine.textTurn("It printed served.", usage)],
        "mock-model",
      ),
    permissions: "default",
    drive: async (stage) => {
      await stage.prompt("run echo served");
      await stage.until("gate.ask");
      await stage.answer("c1", "granted");
      await stage.until("turn.completed");
    },
  },
  {
    name: "asked-denied",
    provider: (engine) =>
      new engine.MockProvider(
        [engine.toolCallTurn(bashCall), engine.textTurn("Understood, I will not.", usage)],
        "mock-model",
      ),
    permissions: "default",
    drive: async (stage) => {
      await stage.prompt("run echo served");
      await stage.until("gate.ask");
      await stage.answer("c1", "denied");
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
  {
    name: "injected",
    provider: (engine) => releasingProvider(engine),
    permissions: "allow",
    drive: async (stage) => {
      await stage.prompt("first");
      await stage.until("turn.delta");
      await stage.inject("second", "wispr-flow");
      await stage.until("queue.changed");
      release?.();
      await stage.until("turn.completed", 2);
    },
  },
  {
    name: "tree",
    provider: (engine) =>
      new engine.MockProvider(
        [engine.textTurn("Left it is.", usage), engine.textTurn("Right, then.", usage)],
        "mock-model",
      ),
    permissions: "allow",
    drive: async (stage) => {
      await stage.prompt("which way?");
      await stage.until("session.tree");
      const [question, answer] = await entryIdsOf(stage);
      await stage.call(`/sessions/${stage.sessionId}/fork`, {
        method: "POST",
        body: JSON.stringify({ entryId: question }),
      });
      await stage.call(`/sessions/${stage.sessionId}/label`, {
        method: "POST",
        body: JSON.stringify({ entryId: answer, label: "went left" }),
      });
      await stage.call(`/sessions/${stage.sessionId}/leaf`, {
        method: "POST",
        body: JSON.stringify({ entryId: question }),
      });
      await stage.prompt("no, the other way");
      await stage.until("session.tree", 5);
    },
  },
  {
    name: "changes",
    provider: (engine) =>
      new engine.MockProvider(
        [engine.toolCallTurn(writeCall), engine.textTurn("Wrote notes.txt.", usage)],
        "mock-model",
      ),
    permissions: "allow",
    trusted: true,
    drive: async (stage) => {
      await stage.prompt("write two lines to notes.txt");
      await stage.until("changes.updated");
      await stage.until("turn.completed");
    },
  },
  {
    name: "workspace",
    provider: (engine) =>
      new engine.MockProvider([engine.textTurn("The tree is small.", usage)], "mock-model"),
    permissions: "allow",
    prepare: (cwd) => plantWorkspaceFiles(cwd),
    drive: async (stage) => {
      await stage.prompt("look around");
      await stage.until("turn.completed");
    },
  },
  {
    name: "controls",
    provider: (engine) => {
      controlModels = controlProviders(engine);
      return controlModels["mock/alpha"] as Provider;
    },
    seams: (_engine, testing) => ({
      inference: testing.inferenceOver(controlModels),
      presets: presetSwitch(),
    }),
    permissions: "allow",
    trusted: true,
    drive: driveControls,
  },
  {
    name: "memory",
    provider: (engine) => new engine.MockProvider([], "mock-model"),
    permissions: "allow",
    trusted: true,
    prepare: seedVault,
    drive: async (stage) => {
      const inbox = (await (await stage.call("/memory/inbox")).json()) as {
        items: Array<{ id: string }>;
      };
      const [first, second] = inbox.items;
      await stage.call(`/memory/inbox/${first?.id}/approve`, { method: "POST" });
      await stage.until("memory.inbox");
      await stage.call(`/memory/inbox/${second?.id}/discard`, { method: "POST" });
      await stage.until("memory.inbox", 2);
      const ledger = (await (await stage.call("/memory/ledger")).json()) as {
        entries: Array<{ id: string; op: string }>;
      };
      const approved = ledger.entries.find((entry) => entry.op === "approve");
      await stage.call(`/memory/ledger/${approved?.id}/revert`, { method: "POST" });
      await stage.until("memory.inbox", 3);
    },
  },
];

const workspaceFiles: Record<string, string> = {
  ".gitignore": "dist/\n",
  ".editorconfig": "root = true\n",
  "README.md": "# fixture\n\nA workspace the browser pane can walk.\n",
  "src/index.ts": 'export const greeting = "hello";\nexport const farewell = "goodbye";\n',
  "src/util/pad.ts": 'export const pad = (s: string) => " " + s + " ";\n',
  "dist/index.js": "module.exports = {};\n",
};

async function plantWorkspaceFiles(cwd: string): Promise<void> {
  for (const [relative, text] of Object.entries(workspaceFiles)) {
    await mkdir(dirname(join(cwd, relative)), { recursive: true });
    await writeFile(join(cwd, relative), text);
  }
}

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

export async function recordAll(only?: string): Promise<string[]> {
  const engine = (await import(keyworkModuleUrl("packages/engine/src/index.ts"))) as EngineModule;
  const server = (await import(keyworkModuleUrl("packages/server/src/index.ts"))) as ServerModule;
  const serve = (await import(keyworkModuleUrl("packages/cli/src/serve.ts"))) as ServeModule;
  const testing = (await import(
    keyworkModuleUrl("packages/server/src/testing.ts")
  )) as ServerTestingModule;
  await mkdir(fixturesDir, { recursive: true });
  const written: string[] = [];
  const chosen = scenarios.filter((scenario) => only === undefined || scenario.name === only);
  if (chosen.length === 0) throw new Error(`no scenario named "${only}"`);
  for (const scenario of chosen) {
    const recorded = await record(scenario, { engine, server, serve, testing });
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
  testing: ServerTestingModule;
}

interface Recorded {
  jsonl: string;
  extras: Record<string, string>;
}

async function record(scenario: Scenario, modules: Modules): Promise<Recorded> {
  const keepAlive = setInterval(() => undefined, 1000);
  const root = await mkdtemp(join(tmpdir(), "keywork-app-fixture-"));
  const cwd = join(root, "workspace");
  const sessionDir = join(root, "sessions");
  const userRoot = join(root, "user");
  await mkdir(cwd, { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await mkdir(userRoot, { recursive: true });
  await scenario.prepare?.(cwd);
  const clock = steppingClock();
  const log = new modules.server.EventLog({
    now: clock,
    ...(scenario.capacity !== undefined && { capacity: scenario.capacity }),
  });
  const host = modules.serve.fileSessionHost({
    cwd,
    sessionDir,
    userRoot,
    projectTrusted: scenario.trusted === true,
    provider: scenario.provider(modules.engine),
    ...scenario.seams?.(modules.engine, modules.testing),
    permissions: () => (scenario.permissions === "allow" ? "allow" : undefined),
    ...(scenario.askTimeoutMs !== undefined && { askTimeoutMs: scenario.askTimeoutMs }),
    ...(scenario.trusted === true && { checkpointsGitDir: join(root, "checkpoints") }),
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
      inject: async (text, client) => {
        await call(`/sessions/${created.id}/inject`, {
          method: "POST",
          body: JSON.stringify({ text, client }),
        });
      },
      abort: async () => {
        await call(`/sessions/${created.id}/abort`, { method: "POST" });
      },
      answer: async (callId, verdict) => {
        await call(`/asks/${callId}`, { method: "POST", body: JSON.stringify({ verdict }) });
      },
      until: (type, count = 1) =>
        new Promise<void>((resolveWait) => {
          if (seen.filter((item) => item.type === type).length >= count) resolveWait();
          else waiters.push({ type, count, resolve: resolveWait });
        }),
    };
    await scenario.drive(stage);
    await persisted(stage);
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
    clearInterval(keepAlive);
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
}

const persistGraceMs = 750;

function persisted(stage: Stage): Promise<void> {
  const settledTurns = stage.seen.filter((envelope) => envelope.type === "turn.completed").length;
  const written = Promise.all([
    stage.until("session.tree", settledTurns),
    stage.until("memory.inbox", settledTurns),
  ]).then(() => undefined);
  return Promise.race([written, new Promise<void>((grace) => setTimeout(grace, persistGraceMs))]);
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
    return { "doc.json": await mergedIntoDocFixture(doc), "plain.sse": raw };
  }
  if (scenario.name === "controls") {
    const doc = await (await call("/doc")).text();
    const lastId = stage.seen.at(-1)?.id ?? 0;
    const replayed = await call("/events", { headers: { "last-event-id": "0" } });
    return {
      "doc.json": await mergedIntoDocFixture(doc),
      "controls.sse": await readUntil(replayed, `\nid: ${lastId}\n`),
      "controls.json": `${JSON.stringify(Object.fromEntries(controlAnswers), null, 2)}\n`,
    };
  }
  if (scenario.name === "tool") {
    const detail = await (await call(`/sessions/${stage.sessionId}`)).text();
    const sessions = await (await call("/sessions")).text();
    return {
      "session-detail.json": `${JSON.stringify(JSON.parse(detail), null, 2)}\n`,
      "sessions.json": `${JSON.stringify(JSON.parse(sessions), null, 2)}\n`,
    };
  }
  if (scenario.name === "tree") {
    const entries = await (await call(`/sessions/${stage.sessionId}/entries`)).text();
    return { "entries.json": pretty(entries) };
  }
  if (scenario.name === "workspace") {
    const read = async (path: string) => pretty(await (await call(path)).text());
    return {
      "workspace.json": await read("/workspace"),
      "tree-root.json": await read("/tree?path="),
      "tree-src.json": await read("/tree?path=src"),
      "file.json": await read("/files?path=src%2Findex.ts"),
      "file-range.json": await read("/files?path=src%2Findex.ts&from=34&to=60"),
    };
  }
  if (scenario.name === "memory") {
    const garden = await (await call("/memory")).text();
    const inbox = await (await call("/memory/inbox")).text();
    return { "memory-garden.json": pretty(garden), "memory-inbox.json": pretty(inbox) };
  }
  if (scenario.name === "changes") {
    const changes = await (await call(`/sessions/${stage.sessionId}/changes`)).text();
    const file = await (
      await call(`/sessions/${stage.sessionId}/changes/file?path=notes.txt`)
    ).text();
    return { "changes.json": pretty(changes), "changed-file.json": pretty(file) };
  }
  return {};
}

export interface DocLike {
  paths: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, { properties?: Record<string, { enum?: string[] }> }> };
  [key: string]: unknown;
}

async function mergedIntoDocFixture(recorded: string): Promise<string> {
  const existing = await readFile(join(fixturesDir, "doc.json"), "utf8").catch(() => undefined);
  const merged =
    existing === undefined
      ? (JSON.parse(recorded) as DocLike)
      : mergeDocuments(JSON.parse(existing) as DocLike, JSON.parse(recorded) as DocLike);
  return `${JSON.stringify(merged, null, 2)}\n`;
}

export function mergeDocuments(existing: DocLike, recorded: DocLike): DocLike {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const path of mergedOrder(Object.keys(existing.paths), Object.keys(recorded.paths))) {
    paths[path] = { ...existing.paths[path], ...recorded.paths[path] };
  }
  return { ...existing, ...recorded, paths, ...mergedEnvelopeTypes(existing, recorded) };
}

function mergedEnvelopeTypes(existing: DocLike, recorded: DocLike): Pick<DocLike, "components"> {
  const envelope = recorded.components?.schemas?.BusEnvelope;
  const type = envelope?.properties?.type;
  if (envelope === undefined || type?.enum === undefined) return {};
  const known = existing.components?.schemas?.BusEnvelope?.properties?.type?.enum ?? [];
  return {
    components: {
      ...recorded.components,
      schemas: {
        ...recorded.components?.schemas,
        BusEnvelope: {
          ...envelope,
          properties: {
            ...envelope.properties,
            type: { ...type, enum: mergedOrder(known, type.enum) },
          },
        },
      },
    },
  };
}

export function mergedOrder(existing: readonly string[], recorded: readonly string[]): string[] {
  const order = [...recorded];
  let anchor = -1;
  for (const key of existing) {
    const at = order.indexOf(key);
    if (at !== -1) {
      anchor = at;
      continue;
    }
    order.splice(anchor + 1, 0, key);
    anchor += 1;
  }
  return order;
}

function pretty(text: string): string {
  return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
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
  const shortIds = new Map<string, string>();
  const shortId = (raw: string): string => {
    const known = shortIds.get(raw);
    if (known !== undefined) return known;
    const assigned = `q${shortIds.size + 1}`;
    shortIds.set(raw, assigned);
    return assigned;
  };
  return (text) =>
    text
      .replaceAll(sessionId, "s1")
      .replaceAll(escapedCwd, "<cwd>")
      .replaceAll(cwd, "<cwd>")
      .replace(uuid, shortId)
      .replace(wallClockField, '"$1": "2026-09-07T12:00:00.000Z"')
      .replace(embeddedClock, '$1\\"2026-09-07T12:00:00.000Z\\"')
      .replace(gitObjectField, '"$1": "<sha>"');
}

const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const wallClockField = /"(createdAt|lastActivityAt|timestamp|created|sweptAt)":\s*"[^"]+"/g;
const embeddedClock = /(created: |\\"created\\":)\\"[^"\\]+\\"/g;
const gitObjectField = /"(checkpoint)":\s*"[0-9a-f]{40}"/g;

function steppingClock(): () => Date {
  let now = Date.parse("2026-09-07T12:00:00.000Z");
  return () => {
    now += 250;
    return new Date(now);
  };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { only: { type: "string" } } });
  const written = await recordAll(values.only);
  console.log(`recorded ${written.length} fixtures from ${keyworkRepo} into ${fixturesDir}`);
  for (const name of written) console.log(`  ${name}`);
  console.log(`event vocabulary: ${engineEventTypes.length} types`);
}
