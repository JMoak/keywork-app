import type { BusEnvelope, PermissionRule, ToolPreview } from "@keywork-app/protocol";
import { parseJsonl } from "../src/dev/replay.ts";

export interface StagedAsk {
  readonly title: string;
  readonly envelopes: readonly BusEnvelope[];
}

export const stagedAsks: readonly StagedAsk[] = [
  {
    title: "rename the tiler verbs",
    envelopes: asking({
      prompt: "rename the tiler verbs to keywork's action ids",
      reply: "keywork names these `pane.*`; renaming the table keeps every caller as it is.",
      tool: "edit",
      args: { path: "src/layout/verbs.ts", oldText: verbNames(""), newText: verbNames("pane.") },
      preview: {
        path: "src/layout/verbs.ts",
        before: verbsFile(""),
        after: verbsFile("pane."),
      },
    }),
  },
  {
    title: "fix the flaky trash test",
    envelopes: asking({
      prompt: "find out why trash.test.ts flakes",
      reply: "Running it twenty times under one process shows whether the order matters.",
      tool: "bash",
      args: {
        command: "bun test src/shell/trash.test.ts --rerun-each 20 | tee artifacts/trash.log",
      },
      rules: [bashRule("bun test *"), bashRule("tee *")],
    }),
  },
  {
    title: "file the redo finding",
    envelopes: asking({
      prompt: "file the redo finding upstream",
      reply: "I'll file it against keywork with the reproduction from wave 6.",
      tool: "github__create_issue",
      args: {
        repo: "JMoak/keywork",
        title: "POST /redo answers 404 right after an undo announced redoable",
        labels: ["server", "S14"],
        body: "Seen from keywork-app: POST /undo returned redoable: true.\nThe next POST /redo answered 404.\nReproduced on 0.2.0.",
      },
      rules: [{ action: "github__create_issue", resource: "*", effect: "allow" }],
    }),
  },
];

function verbNames(prefix: string): string {
  return ["split", "rotate", "zoom", "close", "focus", "jump"]
    .map((kind) => `  ${kind}: "${prefix}${kind}",`)
    .join("\n");
}

function verbsFile(prefix: string): string {
  return [
    'import type { Direction } from "./geometry.ts";',
    "",
    "export type TilerVerb =",
    '  | { kind: "split"; direction: Direction }',
    '  | { kind: "rotate" }',
    '  | { kind: "zoom" }',
    '  | { kind: "close" }',
    '  | { kind: "focus"; direction: Direction }',
    '  | { kind: "jump"; ordinal: number };',
    "",
    'export const verbNames: Record<TilerVerb["kind"], string> = {',
    verbNames(prefix),
    "};",
    "",
    "export function verbName(verb: TilerVerb): string {",
    "  return verbNames[verb.kind];",
    "}",
    "",
  ].join("\n");
}

function bashRule(resource: string): PermissionRule {
  return { action: "bash", resource, effect: "allow" };
}

interface AskingTurn {
  readonly prompt: string;
  readonly reply: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly rules?: readonly PermissionRule[];
  readonly preview?: ToolPreview;
}

function asking(turn: AskingTurn): BusEnvelope[] {
  const call = { type: "tool-call", callId: "c1", name: turn.tool, arguments: turn.args };
  const ask = {
    tool: turn.tool,
    callId: "c1",
    arguments: turn.args,
    rule: "default",
    rules: turn.rules ?? [],
    ...(turn.preview === undefined ? {} : { preview: turn.preview }),
  };
  const done = { type: "done", usage: { inputTokens: 0, outputTokens: 0 } };
  return parseJsonl(
    [
      envelope(1, "turn.started", { userText: turn.prompt }),
      envelope(2, "turn.delta", { delta: { type: "text", text: turn.reply } }),
      envelope(3, "turn.delta", { delta: { type: "tool-call", call } }),
      envelope(4, "turn.delta", { delta: done }),
      envelope(5, "tool.started", { call }),
      envelope(6, "gate.ask", { ask }),
    ].join("\n"),
  );
}

function envelope(id: number, type: string, payload: unknown): string {
  const ts = new Date(Date.parse("2026-10-15T16:00:00.000Z") + id * 250).toISOString();
  return JSON.stringify({ id, ts, sessionId: "s1", type, payload });
}
