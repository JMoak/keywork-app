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
// FIRST_LIGHT_KEYLESS names a folder served with no seam at all: keywork's own CLI resolves its
// inference from the scratch home, finds no model, and refuses the project in its own words.
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
export const trailRequest = "add a sum with its test, then set the change out for me";
export const sumPath = "src/sum.js";
export const sumTestPath = "src/sum.test.js";
export const changeTitle = "the sum and its test";
export const setOut = "The change is set out beside us.";
export const yardNoteOpening = "From the yard, not the keeper's words:";
export const firstRequest = "set the run's summary out for me to read";
export const firstTitle = "the run's summary";
export const secondRequest = "set the second note out beside it";
export const secondTitle = "the second note";
export const takeBackRequest = "see what is out and take the second note back";

const keyworkRepo = resolve(
  process.env.KEYWORK_REPO ?? join(import.meta.dirname, "../../../../../keywork"),
);
const logFile = process.env.FIRST_LIGHT_LOG;
const capabilities = { input: ["text"], toolCalls: true, contextWindow: 200_000 };
let yardPrompt;

export async function serveScripted(argv) {
  record({ engine: process.pid });
  refuseTheNetwork();
  const cli = await import(keyworkModule("packages/cli/src/main.ts"));
  if (servesTheKeylessFolder()) {
    record({ keyless: process.cwd() });
    return cli.main(argv);
  }
  const inference = await import(keyworkModule("packages/cli/src/inference/runtime.ts"));
  ({ yardPrompt } = await import(keyworkModule("packages/engine/src/index.ts")));
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
    record({ turn: kind, messages: request.messages.length, ...whatTheModelHeard(request) });
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
  const prompt = lastUserText(messages);
  if (prompt.includes(trailRequest)) return trailTurn(messages);
  const yardScript = yardScripts.find((script) => prompt.includes(script.request));
  if (yardScript !== undefined) return yardTurn(messages, yardScript);
  const last = messages.at(-1);
  if (last?.role === "tool") return { kind: "after-tool", deltas: words(delivered) };
  if (prompt.toLowerCase().includes(introductionMarker)) {
    return { kind: "introduction", deltas: words(introduction) };
  }
  if (prompt.includes(notePath)) {
    return { kind: "write", deltas: [writeCall(messages.length), done()] };
  }
  return { kind: "plain", deltas: words(lookedAround) };
}

function writeCall(at) {
  return toolCall(`first-light-write-${at}`, "write", {
    path: notePath,
    content: "first light: the creature wrote this note.\n",
  });
}

const trailSteps = [
  {
    kind: "trail-sum",
    call: (at) =>
      toolCall(`trail-sum-${at}`, "write", {
        path: sumPath,
        content: "export const sum = (a, b) => a + b;\n",
      }),
  },
  {
    kind: "trail-test",
    call: (at) =>
      toolCall(`trail-test-${at}`, "write", {
        path: sumTestPath,
        content: `import { sum } from "./sum.js";\n\nif (sum(2, 3) !== 5) throw new Error("sum");\n`,
      }),
  },
  {
    kind: "trail-show",
    call: (at) =>
      toolCall(`trail-show-${at}`, "show", {
        what: { kind: "diff", ref: "the sum change", title: changeTitle },
        rung: "unfold",
        why: "the sum and its test are written; read them here",
      }),
  },
];

function trailTurn(messages) {
  const answered = toolResultsSinceLastPrompt(messages);
  const step = trailSteps[answered];
  if (step === undefined) return { kind: "trail-set-out", deltas: words(setOut) };
  return { kind: step.kind, deltas: [step.call(messages.length), done()] };
}

const yardScripts = [
  {
    request: firstRequest,
    said: "The summary is out beside us.",
    steps: [
      {
        kind: "yard-first-show",
        call: (at) =>
          toolCall(`yard-first-${at}`, "show", {
            what: {
              kind: "note",
              ref: "Everything the run did, for a slow read.",
              title: firstTitle,
            },
            rung: "unfold",
            size: "working",
            why: "you asked to read the run's summary",
          }),
      },
    ],
  },
  {
    request: secondRequest,
    said: "The second note is out.",
    steps: [
      {
        kind: "yard-second-show",
        call: (at) =>
          toolCall(`yard-second-${at}`, "show", {
            what: { kind: "note", ref: "A second thing to look at.", title: secondTitle },
            rung: "unfold",
            size: "readable",
            why: "you asked for a second note",
          }),
      },
    ],
  },
  {
    request: takeBackRequest,
    said: "The second note has been taken back.",
    steps: [
      {
        kind: "yard-shown",
        call: (at) => toolCall(`yard-shown-${at}`, "shown", {}),
      },
      {
        kind: "yard-withdraw",
        call: (at, messages) =>
          toolCall(`yard-withdraw-${at}`, "withdraw", { id: settingListed(messages, secondTitle) }),
      },
    ],
  },
];

function yardTurn(messages, script) {
  const answered = toolResultsSinceLastPrompt(messages);
  const step = script.steps[answered];
  if (step === undefined) return { kind: "yard-said", deltas: words(script.said) };
  return { kind: step.kind, deltas: [step.call(messages.length, messages), done()] };
}

function settingListed(messages, title) {
  const rows =
    lastToolOutput(messages)
      ?.split("\n")
      .filter((line) => line.startsWith("{")) ?? [];
  return rows.map((row) => JSON.parse(row)).find((row) => row.what?.title === title)?.id;
}

function whatTheModelHeard(request) {
  const note = noteIn(request.messages.at(-1));
  const toolOutput = lastToolOutput(request.messages);
  return {
    yardSection: yardPrompt !== undefined && request.systemPrompt?.includes(yardPrompt) === true,
    ...(note !== undefined && { note }),
    ...(toolOutput !== undefined && { toolOutput }),
  };
}

function noteIn(message) {
  return message?.parts
    .map((part) => part.text ?? part.output ?? "")
    .find((text) => text.includes(yardNoteOpening));
}

function lastToolOutput(messages) {
  const last = messages.at(-1);
  return last?.role === "tool" ? last.parts.at(-1)?.output : undefined;
}

function toolResultsSinceLastPrompt(messages) {
  const prompt = messages.findLastIndex((message) => message.role === "user");
  return messages.slice(prompt + 1).filter((message) => message.role === "tool").length;
}

function toolCall(callId, name, args) {
  return { type: "tool-call", call: { type: "tool-call", callId, name, arguments: args } };
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

function servesTheKeylessFolder() {
  const keyless = process.env.FIRST_LIGHT_KEYLESS;
  if (keyless === undefined || keyless === "") return false;
  const same = (path) =>
    process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
  return same(process.cwd()) === same(keyless);
}

function keyworkModule(relative) {
  return pathToFileURL(join(keyworkRepo, relative)).href;
}

function record(line) {
  if (logFile === undefined || logFile === "") return;
  appendFileSync(logFile, `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`);
}

if (import.meta.main) process.exitCode = await serveScripted(process.argv.slice(2));
