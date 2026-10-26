import type { SessionProjection, ToolRun, TranscriptEntry } from "@keywork-app/client";
import { lexer, type Token, type Tokens } from "marked";
import type { HostPort } from "../../host/port.ts";
import { type PatchSides, unifiedPatch } from "../diff/patch.ts";
import type { PaneLocalAction } from "../registry.ts";

export const copyActions: Readonly<Record<string, PaneLocalAction>> = {
  "conversation.copy-message": {
    chords: "none",
    help: "copy the last reply",
    command: {
      name: "copy-message",
      aliases: ["copy-reply", "copy"],
      description: "copy the last reply to the clipboard",
    },
  },
  "conversation.copy-code": {
    chords: "none",
    help: "copy the last code block",
    command: {
      name: "copy-code",
      aliases: ["copy-block"],
      description: "copy the last code block of the last reply that has one",
    },
  },
  "conversation.copy-diff": {
    chords: "none",
    help: "copy the last diff",
    command: {
      name: "copy-diff",
      aliases: ["copy-hunk"],
      description: "copy the last edit as a patch, the pending ask's first",
    },
  },
};

export function copyVerbs(
  host: Pick<HostPort, "writeClipboard">,
  projection: () => SessionProjection | undefined,
  say: (line: string) => void,
): Record<string, () => void> {
  const copy = (what: string, pick: (seen: SessionProjection) => string | undefined) => () =>
    void copyInto(host, what, projection(), pick).then(say);
  return {
    "conversation.copy-message": copy("reply", lastReply),
    "conversation.copy-code": copy("code block", lastCodeBlock),
    "conversation.copy-diff": copy("diff", lastDiff),
  };
}

export function lastReply(projection: SessionProjection): string | undefined {
  return newestFirst(projection.entries).find((entry) => entry.kind === "assistant")?.text;
}

export function lastCodeBlock(projection: SessionProjection): string | undefined {
  for (const entry of newestFirst(projection.entries)) {
    if (entry.kind !== "assistant") continue;
    const block = fencedBlocks(lexer(entry.text, { gfm: true })).at(-1);
    if (block !== undefined) return block.text;
  }
  return undefined;
}

export function lastDiff(projection: SessionProjection): string | undefined {
  const runs = newestFirst(projection.entries).flatMap((entry) =>
    entry.kind === "tool" ? [entry.run] : [],
  );
  const pending = runs.find((run) => run.phase === "asking")?.ask?.preview;
  if (pending !== undefined) return unifiedPatch(pending);
  for (const run of runs) {
    const sides = editedSides(run);
    if (sides !== undefined) return unifiedPatch(sides);
  }
  return undefined;
}

async function copyInto(
  host: Pick<HostPort, "writeClipboard">,
  what: string,
  projection: SessionProjection | undefined,
  pick: (seen: SessionProjection) => string | undefined,
): Promise<string> {
  if (projection === undefined) return "nothing to copy · focus a session first";
  const text = pick(projection);
  if (text === undefined || text === "") return `nothing to copy · no ${what} yet`;
  try {
    await host.writeClipboard(text);
  } catch {
    return "the clipboard refused it";
  }
  return `copied the last ${what} · ${text.length} chars`;
}

function newestFirst(entries: readonly TranscriptEntry[]): TranscriptEntry[] {
  return [...entries].reverse();
}

function fencedBlocks(tokens: readonly Token[]): Tokens.Code[] {
  return tokens.flatMap((token): Tokens.Code[] => {
    if (token.type === "code") return [token as Tokens.Code];
    const nested = childTokensOf(token);
    return nested === undefined ? [] : fencedBlocks(nested);
  });
}

function childTokensOf(token: Token): readonly Token[] | undefined {
  if (token.type === "list") return (token as Tokens.List).items.flatMap((item) => item.tokens);
  return "tokens" in token && Array.isArray(token.tokens) ? token.tokens : undefined;
}

function editedSides(run: ToolRun): PatchSides | undefined {
  const args = argumentsOf(run.args);
  const path = stringField(args, "path") ?? stringField(args, "file") ?? run.subject;
  if (run.name === "edit") {
    const before = stringField(args, "oldText");
    const after = stringField(args, "newText");
    return before === undefined || after === undefined ? undefined : { path, before, after };
  }
  if (run.name === "write") {
    const after = stringField(args, "content");
    return after === undefined ? undefined : { path, before: null, after };
  }
  return undefined;
}

function argumentsOf(args: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(args);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}
