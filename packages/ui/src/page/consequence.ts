import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import {
  exactOnlyCommands,
  onceOnlyTools,
  type PermissionAsk,
  type PermissionRule,
  type RememberedScope,
  type ToolPreview,
  unrememberedCommands,
} from "@keywork-app/protocol";

export type Consequence =
  | { readonly kind: "file"; readonly tool: string; readonly preview: ToolPreview }
  | { readonly kind: "unpreviewed" }
  | { readonly kind: "command"; readonly parts: readonly CommandPart[] }
  | {
      readonly kind: "call";
      readonly server: string;
      readonly tool: string;
      readonly rows: readonly ArgumentRow[];
    }
  | { readonly kind: "arguments" };

export type CommandRole = "program" | "flag" | "operator" | "path" | "word" | "space";

export interface CommandPart {
  readonly text: string;
  readonly role: CommandRole;
}

export interface ArgumentRow {
  readonly name: string;
  readonly value: string;
  readonly fold: string | undefined;
}

export interface FileChange {
  readonly added: number;
  readonly removed: number;
  readonly firstLine: number;
  readonly hunks: number;
}

export type AskShape = Pick<PermissionAsk, "tool" | "arguments" | "preview">;

export const unpreviewedLine =
  "no preview from keywork · too large, binary, a memory note, or an edit that would not apply";

export function consequenceOf(ask: AskShape | undefined): Consequence {
  if (ask === undefined) return { kind: "arguments" };
  if (onceOnlyTools.has(ask.tool)) {
    return ask.preview === undefined
      ? { kind: "unpreviewed" }
      : { kind: "file", tool: ask.tool, preview: ask.preview };
  }
  const command = ask.tool === "bash" ? stringField(ask.arguments, "command") : undefined;
  if (command !== undefined) return { kind: "command", parts: commandParts(command) };
  const call = mcpCallName(ask.tool);
  if (call !== undefined && isRecord(ask.arguments)) {
    return { kind: "call", ...call, rows: argumentRows(ask.arguments) };
  }
  return { kind: "arguments" };
}

export function fileHead(tool: string, preview: ToolPreview): string {
  const where = `${tool} ${preview.path}`;
  if (preview.before === null)
    return `${where} · new file · ${linesWord(lineCount(preview.after))}`;
  const change = fileChange(preview.before, preview.after);
  if (change.hunks === 0) return `${where} · no change`;
  const at = change.hunks > 1 ? `${change.hunks} places` : `line ${change.firstLine}`;
  return `${where} · ${at} · +${change.added} −${change.removed}`;
}

export function fileChange(before: string, after: string): FileChange {
  const a = documentOf(before);
  const b = documentOf(after);
  const chunks = Chunk.build(a, b);
  const first = chunks[0];
  return {
    added: sumOf(chunks, (chunk) => linesIn(b, chunk.fromB, chunk.toB)),
    removed: sumOf(chunks, (chunk) => linesIn(a, chunk.fromA, chunk.toA)),
    firstLine: first === undefined ? 0 : lineNumberAt(b, first.fromB),
    hunks: chunks.length,
  };
}

export function commandParts(command: string): CommandPart[] {
  let expected: Expectation = "program";
  return [...command.matchAll(commandToken)].map(([text]) => {
    const role = roleOf(text, expected);
    if (role !== "space") expected = expectationAfter(text, expected);
    return { text, role };
  });
}

export function mcpCallName(tool: string): { server: string; tool: string } | undefined {
  const split = tool.indexOf(mcpToolSeparator);
  if (split <= 0 || split + mcpToolSeparator.length >= tool.length) return undefined;
  return { server: tool.slice(0, split), tool: tool.slice(split + mcpToolSeparator.length) };
}

export function argumentRows(args: Readonly<Record<string, unknown>>): ArgumentRow[] {
  return Object.entries(args).map(([name, value]) => {
    const [first = "", ...rest] = valueLines(value);
    return {
      name,
      value: first.length > valueWidth ? `${first.slice(0, valueWidth)}…` : first,
      fold: rest.length === 0 ? undefined : `… ${linesWord(rest.length, "more ")}`,
    };
  });
}

export function coverageLines(
  rules: readonly PermissionRule[],
  scopes: readonly RememberedScope[],
): string[] {
  const subject = `no ask for ${rules.map(ruleWords).join(" or ")}`;
  return scopes.map((scope, at) => `${at === 0 ? subject : "the same"} ${reachOf[scope]}`);
}

export function ruleWords(rule: PermissionRule): string {
  const resource = rule.resource;
  if (!resource.includes("*")) return `the exact command ${resource}`;
  const head = resource.slice(0, -wildcardTail.length);
  if (!resource.endsWith(wildcardTail) || head.includes("*")) {
    return `any command matching ${resource}`;
  }
  const held = heldBack(head);
  return held.length === 0 ? `any ${head} command` : `any ${head} command but ${held.join(", ")}`;
}

const mcpToolSeparator = "__";
const wildcardTail = " *";
const valueWidth = 80;

const reachOf: Readonly<Record<RememberedScope, string>> = {
  session: "until this session ends",
  workspace: "in every session of this workspace, until revoked",
};

const commandToken = /\s+|&&|\|\||[|;&]|\d?>&\d+|\d?>>?|<|"(?:[^"\\]|\\.)*"|'[^']*'|[^\s|;&<>]+/g;

type Expectation = "program" | "path" | "any";

const separators: ReadonlySet<string> = new Set(["&&", "||", "|", ";", "&"]);
const fileRedirection = /^\d?(>>?|<)$/;
const descriptorRedirection = /^\d?>&\d+$/;
const assignment = /^[A-Za-z_]\w*=/;
const pathLike = /[\\/]|^[.~]|\.[A-Za-z][A-Za-z0-9]{0,7}$/;

function roleOf(text: string, expected: Expectation): CommandRole {
  if (/^\s+$/.test(text)) return "space";
  if (isOperator(text)) return "operator";
  if (expected === "path") return "path";
  if (expected === "program") return assignment.test(text) ? "word" : "program";
  if (text.startsWith("-")) return "flag";
  return pathLike.test(text) ? "path" : "word";
}

function expectationAfter(text: string, expected: Expectation): Expectation {
  if (separators.has(text)) return "program";
  if (fileRedirection.test(text)) return "path";
  if (descriptorRedirection.test(text)) return expected;
  return expected === "program" && assignment.test(text) ? "program" : "any";
}

function isOperator(text: string): boolean {
  return separators.has(text) || fileRedirection.test(text) || descriptorRedirection.test(text);
}

function heldBack(head: string): string[] {
  return [...unrememberedCommands, ...exactOnlyCommands].filter((form) =>
    form.startsWith(`${head} `),
  );
}

function valueLines(value: unknown): string[] {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+$/, ""));
  while (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

function documentOf(text: string): Text {
  return Text.of(text.split("\n"));
}

function sumOf(chunks: readonly Chunk[], count: (chunk: Chunk) => number): number {
  return chunks.reduce((sum, chunk) => sum + count(chunk), 0);
}

function linesIn(document: Text, from: number, to: number): number {
  if (from === to) return 0;
  return lineNumberAt(document, Math.max(from, to - 1)) - lineNumberAt(document, from) + 1;
}

function lineNumberAt(document: Text, position: number): number {
  return document.lineAt(Math.min(position, document.length)).number;
}

function lineCount(text: string): number {
  if (text === "") return 0;
  const lines = text.split("\n").length;
  return text.endsWith("\n") ? lines - 1 : lines;
}

function linesWord(count: number, qualifier = ""): string {
  return `${count} ${qualifier}${count === 1 ? "line" : "lines"}`;
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
