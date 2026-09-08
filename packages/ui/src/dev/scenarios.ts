import type { BusEnvelope } from "@keywork-app/protocol";
import denied from "../../../client/src/fixtures/denied.jsonl?raw";
import interrupt from "../../../client/src/fixtures/interrupt.jsonl?raw";
import plain from "../../../client/src/fixtures/plain.jsonl?raw";
import queued from "../../../client/src/fixtures/queued.jsonl?raw";
import thinking from "../../../client/src/fixtures/thinking.jsonl?raw";
import tool from "../../../client/src/fixtures/tool.jsonl?raw";
import { parseJsonl } from "./replay.ts";

export interface Scenario {
  name: string;
  envelopes: readonly BusEnvelope[];
}

const proseFixture = [
  envelope(1, "turn.started", { userText: "explain the page grammar in a few paragraphs" }),
  envelope(2, "turn.delta", {
    delta: {
      type: "text",
      text: [
        "# The page\n\n",
        "The transcript is a **broadsheet** when it has room and a *column* when it does not. ",
        "Prose keeps to a measure; machine output runs full bleed, because a diff or a fence is not meant to be read like a paragraph.\n\n",
        "## Voice is provenance\n\n",
        "- `█` is you, the closest voice to the reader\n",
        "- `▓` is the agent\n",
        "- `░` is machine output, the furthest away\n\n",
        "The rail carries those stamps and the body hangs from it. A tool row reads `verb subject · duration · outcome`, and the outcome is the only colored word.\n\n",
        '```ts\nexport function tierOf(widthPx: number): WidthTier {\n  if (widthPx >= 800) return "broadsheet";\n  return "column";\n}\n```\n\n',
        "> Louder in structure, quiet in palette.\n\n",
        "| tier | width | measure |\n|---|---|---|\n| broadsheet | ≥ 800px | 72ch |\n| column | 560–799px | none |\n\n",
        "That is the whole grammar; nothing decorative that is not also informative.",
      ].join(""),
    },
  }),
  envelope(3, "turn.delta", {
    delta: { type: "done", usage: { inputTokens: 40, outputTokens: 160, costUsd: 0.0031 } },
  }),
  envelope(4, "turn.completed", {
    message: { role: "assistant", parts: [{ type: "text", text: "(prose)" }] },
    usage: { inputTokens: 40, outputTokens: 160, costUsd: 0.0031 },
  }),
]
  .map((line) => JSON.stringify(line))
  .join("\n");

function envelope(id: number, type: string, payload: unknown): unknown {
  return {
    id,
    ts: new Date(Date.UTC(2026, 8, 7, 12, 0, id)).toISOString(),
    sessionId: "s1",
    type,
    payload,
  };
}

export const scenarios: readonly Scenario[] = [
  { name: "plain", envelopes: parseJsonl(plain) },
  { name: "thinking", envelopes: parseJsonl(thinking) },
  { name: "tool", envelopes: parseJsonl(tool) },
  { name: "denied", envelopes: parseJsonl(denied) },
  { name: "interrupt", envelopes: parseJsonl(interrupt) },
  { name: "queued", envelopes: parseJsonl(queued) },
  { name: "prose", envelopes: parseJsonl(proseFixture) },
];
