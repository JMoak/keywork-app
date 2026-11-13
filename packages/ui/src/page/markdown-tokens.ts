import { Marked, type Token, type TokenizerExtension, type Tokens } from "marked";

export interface FootnoteToken {
  type: "footnote";
  raw: string;
  label: string;
  tokens: Token[];
}

export interface FootnoteRefToken {
  type: "footnoteRef";
  raw: string;
  label: string;
}

export function lexMarkdown(source: string): Token[] {
  return reader.lexer(source);
}

export function keepUnchanged<T>(before: T, after: T): T {
  return shared(before, after) as T;
}

export function fenceIsClosed(code: Tokens.Code): boolean {
  const lines = code.raw.trimEnd().split("\n");
  const opening = fenceMark(lines[0], /^ {0,3}(`{3,}|~{3,})/);
  const closing = lines.length > 1 ? fenceMark(lines.at(-1), /^ {0,3}(`{3,}|~{3,})[ \t]*$/) : "";
  return opening !== "" && closing[0] === opening[0] && closing.length >= opening.length;
}

const footnoteDefinition: TokenizerExtension = {
  name: "footnote",
  level: "block",
  start: (source) => {
    const at = source.search(/\n\[\^[^\]\s]+\]:/);
    return at === -1 ? undefined : at + 1;
  },
  tokenizer(source) {
    const match = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?: {2,}|\t)[^\n]*)*)(?:\n|$)/.exec(source);
    if (match === null) return undefined;
    const [raw, label = "", text = ""] = match;
    return { type: "footnote", raw, label, tokens: this.lexer.inline(text.trim()) };
  },
};

const footnoteReference: TokenizerExtension = {
  name: "footnoteRef",
  level: "inline",
  start: (source) => {
    const at = source.indexOf("[^");
    return at === -1 ? undefined : at;
  },
  tokenizer(source) {
    const match = /^\[\^([^\]\s]+)\]/.exec(source);
    if (match === null) return undefined;
    const [raw, label = ""] = match;
    return { type: "footnoteRef", raw, label };
  },
};

const reader = new Marked({ gfm: true, extensions: [footnoteDefinition, footnoteReference] });

function fenceMark(line: string | undefined, pattern: RegExp): string {
  return pattern.exec(line ?? "")?.[1] ?? "";
}

function shared(before: unknown, after: unknown): unknown {
  if (Object.is(before, after)) return before;
  if (Array.isArray(after)) return Array.isArray(before) ? sharedList(before, after) : after;
  if (isRecord(after)) return isRecord(before) ? sharedRecord(before, after) : after;
  return after;
}

function sharedList(before: readonly unknown[], after: readonly unknown[]): readonly unknown[] {
  const merged = after.map((item, index) => shared(before[index], item));
  const unchanged =
    merged.length === before.length && merged.every((item, index) => item === before[index]);
  return unchanged ? before : merged;
}

function sharedRecord(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const keys = Object.keys(after);
  const merged = Object.fromEntries(keys.map((key) => [key, shared(before[key], after[key])]));
  const unchanged =
    keys.length === Object.keys(before).length &&
    keys.every((key) => Object.hasOwn(before, key) && merged[key] === before[key]);
  return unchanged ? before : merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
