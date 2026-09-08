import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { repoRoot } from "../lib/repo-files.ts";

const keyworkRepo = resolve(process.env.KEYWORK_REPO ?? join(repoRoot, "..", "keywork"));

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

interface ProviderRequest {
  messages: readonly { role: string; parts: readonly { type: string; text?: string }[] }[];
  signal?: AbortSignal;
}

interface Provider {
  name: string;
  modelId?: string;
  stream(request: ProviderRequest): AsyncIterable<Delta>;
}

interface ServerModule {
  EventLog: new () => unknown;
  issueToken(): string;
  listen(options: {
    token: string;
    host: unknown;
    log: unknown;
    version: string;
    port?: number;
  }): Promise<{ url: string; port: number; close(): Promise<void> }>;
}

interface ServeModule {
  fileSessionHost(options: {
    cwd: string;
    sessionDir: string;
    userRoot: string;
    projectTrusted: boolean;
    provider: Provider;
    permissions: (call: unknown) => "allow" | "ask" | "deny" | undefined;
    log: unknown;
  }): unknown;
}

export function scriptedProvider(delayMs: number, delay: (ms: number) => Promise<void>): Provider {
  let calls = 0;
  return {
    name: "scripted",
    modelId: "scripted/keywork-mock",
    async *stream(request) {
      const prompt = lastUserText(request.messages);
      const turn = turnFor(prompt, ++calls, request.messages);
      for (const delta of turn) {
        request.signal?.throwIfAborted();
        yield delta;
        await delay(delta.type === "text" || delta.type === "visible-thinking" ? delayMs : 0);
      }
    },
  };
}

function turnFor(prompt: string, call: number, messages: ProviderRequest["messages"]): Delta[] {
  const lastRole = messages.at(-1)?.role;
  if (lastRole === "tool") return [...words("The command ran; its output is above."), done(41, 9)];
  if (/\b(run|bash|echo|ls|list)\b/i.test(prompt)) {
    return [
      ...thoughts("A shell command answers this fastest."),
      {
        type: "tool-call",
        call: {
          type: "tool-call",
          callId: `c${call}`,
          name: "bash",
          arguments: { command: "echo served" },
        },
      },
      done(0, 0),
    ];
  }
  if (/\bslow|long|wait\b/i.test(prompt)) return [...words(longAnswer), done(120, 260, 0.0031)];
  return [
    ...thoughts("A short answer will do."),
    ...words(
      `You said: ${prompt}. This is the scripted mock provider, streaming at a human cadence so the page can be judged.`,
    ),
    done(30, 24),
  ];
}

const longAnswer = `# The page

The transcript is a **broadsheet** when it has room and a *column* when it does not. Prose keeps to a measure; machine output runs full bleed.

## Voice is provenance

- the user is the closest voice to the reader
- the agent sits one step back
- machine output is furthest away

\`\`\`ts
export function tierOf(widthPx: number): WidthTier {
  if (widthPx >= 800) return "broadsheet";
  return "column";
}
\`\`\`

> Louder in structure, quiet in palette.

That is the whole grammar; nothing decorative that is not also informative.`;

function words(text: string): Delta[] {
  return text.split(/(?<=\s)/).map((piece) => ({ type: "text", text: piece }));
}

function thoughts(text: string): Delta[] {
  return text.split(/(?<=\s)/).map((piece) => ({ type: "visible-thinking", text: piece }));
}

function done(inputTokens: number, outputTokens: number, costUsd?: number): Delta {
  return {
    type: "done",
    usage: { inputTokens, outputTokens, ...(costUsd !== undefined && { costUsd }) },
  };
}

function lastUserText(messages: ProviderRequest["messages"]): string {
  const user = [...messages].reverse().find((message) => message.role === "user");
  return user?.parts.map((part) => part.text ?? "").join("") ?? "";
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      port: { type: "string" },
      cadence: { type: "string", default: "40" },
      "write-ticket": { type: "boolean", default: false },
    },
  });
  const server = (await import(moduleUrl("packages/server/src/index.ts"))) as ServerModule;
  const serve = (await import(moduleUrl("packages/cli/src/serve.ts"))) as ServeModule;
  const cwd = await mkdtemp(join(tmpdir(), "keywork-app-mock-"));
  const sessionDir = join(cwd, ".sessions");
  const userRoot = join(cwd, ".user");
  await mkdir(sessionDir, { recursive: true });
  await mkdir(userRoot, { recursive: true });
  const log = new server.EventLog();
  const host = serve.fileSessionHost({
    cwd,
    sessionDir,
    userRoot,
    projectTrusted: false,
    provider: scriptedProvider(
      Number(values.cadence),
      (ms) => new Promise((r) => setTimeout(r, ms)),
    ),
    permissions: () => "allow",
    log,
  });
  const token = server.issueToken();
  const listening = await server.listen({
    token,
    host,
    log,
    version: "0.0.1",
    ...(values.port !== undefined && { port: Number(values.port) }),
  });
  console.log(`listening on ${listening.url}`);
  console.log(`token ${token}`);
  console.log(
    `page http://127.0.0.1:5173/?token=${token}  (start vite with KEYWORK_SERVER=${listening.url})`,
  );
  const ticketFile = join(homedir(), ".keywork", "server.json");
  if (values["write-ticket"]) {
    await mkdir(join(homedir(), ".keywork"), { recursive: true });
    await writeFile(
      ticketFile,
      `${JSON.stringify({ url: listening.url, token })}
`,
      { mode: 0o600 },
    );
    console.log(`ticket ${ticketFile} (the app will attach to this mock; removed on exit)`);
  }
  const stop = async (): Promise<void> => {
    if (values["write-ticket"]) await rm(ticketFile, { force: true });
    await listening.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
  await new Promise(() => undefined);
}

function moduleUrl(relative: string): string {
  return pathToFileURL(join(keyworkRepo, relative)).href;
}
