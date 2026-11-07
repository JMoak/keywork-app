// Scripted engine for the first-light smoke: keywork's own CLI from the sibling checkout, run as
// `serve` exactly as the console runs it, with one seam changed. Inference is composed with one
// more provider, `scripted/first-light`, that answers from the prompt inside this process, and
// every binding of any other provider refuses to stream. Every fetch beyond loopback is refused.
// No turn here spends a token or reaches a network.
//
//   bun packages/desktop/e2e/first-light/scripted-engine.mjs serve --port <n>
//
// FIRST_LIGHT_LOG names a file that gains one JSON line per provider turn, per refused fetch,
// and one with this process's pid, so the smoke can say what the engine was asked and stop it.
import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const scriptedReference = "scripted/first-light";
export const introductionMarker = "this is your first thread";
export const notePath = "notes/first-light.md";
export const introduction =
  "I am your creature, made a moment ago in this folder. I could take on three things here: read what the folder holds and say what it is, keep a short notes file current, and run a read-only look each morning. I can reach this folder through a bare host workshop; I cannot reach the network or any other machine.";
export const delivered = `I wrote the first-light note to ${notePath}.`;
export const lookedAround = "This folder holds one notes file and nothing that needs you.";

const keyworkRepo = resolve(
  process.env.KEYWORK_REPO ?? join(import.meta.dirname, "../../../../../keywork"),
);
const logFile = process.env.FIRST_LIGHT_LOG;
const capabilities = { input: ["text"], toolCalls: true, contextWindow: 200_000 };

export async function serveScripted(argv) {
  record({ engine: process.pid });
  refuseTheNetwork();
  const cli = await import(keyworkModule("packages/cli/src/main.ts"));
  const inference = await import(keyworkModule("packages/cli/src/inference/runtime.ts"));
  return cli.main([...argv, "--model", scriptedReference], {
    composeInference: (inputs) => withScriptedProvider(inference.composeInference(inputs)),
  });
}

function withScriptedProvider(runtime) {
  runtime.registry.register(scriptedRegistration);
  const provider = (binding) =>
    binding.registration.name === scriptedRegistration.name
      ? scriptedProvider
      : refusingProvider(binding);
  return {
    ...runtime,
    provider,
    open: (request) => {
      const bound = runtime.open(request);
      return { ...bound, provider: provider(bound.binding) };
    },
  };
}

const scriptedRegistration = {
  name: "scripted",
  label: "first-light scripted provider",
  protocol: "chat-completions",
  endpoint: "https://first-light.invalid/v1",
  credential: { kind: "none" },
  models: [{ id: "first-light", origin: "declared", capabilities }],
  defaultModel: "first-light",
  openCatalog: false,
  enabled: true,
};

const scriptedProvider = {
  name: "scripted",
  modelId: "first-light",
  capabilities,
  async *stream(request) {
    const { kind, deltas } = turnFor(request.messages);
    record({ turn: kind, messages: request.messages.length });
    for (const delta of deltas) {
      request.signal?.throwIfAborted();
      yield delta;
      await Promise.resolve();
    }
  },
};

function refusingProvider(binding) {
  return {
    name: binding.registration.name,
    modelId: binding.spec.id,
    // biome-ignore lint/correctness/useYield: a refusing stream throws before its first delta
    async *stream() {
      record({ refusedProvider: `${binding.registration.name}/${binding.spec.id}` });
      throw new Error("the first-light smoke serves only its scripted provider");
    },
  };
}

function turnFor(messages) {
  const last = messages.at(-1);
  if (last?.role === "tool") return { kind: "after-tool", deltas: words(delivered) };
  const prompt = lastUserText(messages);
  if (prompt.toLowerCase().includes(introductionMarker)) {
    return { kind: "introduction", deltas: words(introduction) };
  }
  if (prompt.includes(notePath)) {
    return { kind: "write", deltas: [writeCall(messages.length), done()] };
  }
  return { kind: "plain", deltas: words(lookedAround) };
}

function writeCall(at) {
  return {
    type: "tool-call",
    call: {
      type: "tool-call",
      callId: `first-light-write-${at}`,
      name: "write",
      arguments: { path: notePath, content: "first light: the creature wrote this note.\n" },
    },
  };
}

function words(text) {
  return [...text.split(/(?<=\s)/).map((piece) => ({ type: "text", text: piece })), done()];
}

function done() {
  return { type: "done", usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
}

function lastUserText(messages) {
  const user = [...messages].reverse().find((message) => message.role === "user");
  return user?.parts.map((part) => part.text ?? "").join("") ?? "";
}

function refuseTheNetwork() {
  const reachable = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (isLoopback(url.hostname)) return reachable(input, init);
    record({ refusedFetch: url.origin });
    return Promise.reject(new TypeError(`the first-light smoke reaches no network: ${url.origin}`));
  };
}

function isLoopback(hostname) {
  return hostname === "localhost" || hostname === "[::1]" || hostname.startsWith("127.");
}

function keyworkModule(relative) {
  return pathToFileURL(join(keyworkRepo, relative)).href;
}

function record(line) {
  if (logFile === undefined || logFile === "") return;
  appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`);
}

if (import.meta.main) process.exitCode = await serveScripted(process.argv.slice(2));
