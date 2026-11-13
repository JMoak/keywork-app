import type { TextSpan } from "./graphemes.ts";

export const pasteCollapseLines = 6;
export const pasteCollapseChars = 4096;

export type HeldPastes = readonly (readonly [ordinal: number, text: string])[];

export interface PasteVault {
  hold(text: string): string;
  expandAll(draft: string): string;
  spanEndingAt(draft: string, caret: number): TextSpan | undefined;
  spanStartingAt(draft: string, caret: number): TextSpan | undefined;
  heldIn(draft: string): HeldPastes;
  restore(pastes: HeldPastes): void;
}

export function createPasteVault(): PasteVault {
  const held = new Map<number, string>();
  const heldSpansWithin = (draft: string, from: number, to: number): TextSpan[] => {
    const start = Math.max(0, from);
    return heldMatches(draft.slice(start, to)).map((match) => ({
      start: start + match.index,
      end: start + match.index + match[0].length,
    }));
  };
  const heldMatches = (text: string): RegExpExecArray[] =>
    held.size === 0
      ? []
      : Array.from(text.matchAll(placeholderPattern)).filter((match) => held.has(Number(match[1])));
  return {
    hold: (text) => {
      if (!overflows(text)) return text;
      const ordinal = Math.max(0, ...held.keys()) + 1;
      held.set(ordinal, text);
      return placeholderFor(ordinal, text);
    },
    expandAll: (draft) =>
      draft.replace(
        placeholderPattern,
        (token, ordinal: string) => held.get(Number(ordinal)) ?? token,
      ),
    spanEndingAt: (draft, caret) =>
      heldSpansWithin(draft, caret - placeholderReach, caret).find((span) => span.end === caret),
    spanStartingAt: (draft, caret) =>
      heldSpansWithin(draft, caret, caret + placeholderReach).find((span) => span.start === caret),
    heldIn: (draft) =>
      heldMatches(draft).map((match) => {
        const ordinal = Number(match[1]);
        return [ordinal, held.get(ordinal) ?? ""] as const;
      }),
    restore: (pastes) => {
      held.clear();
      for (const [ordinal, text] of pastes) held.set(ordinal, text);
    },
  };
}

export function lineCount(text: string): number {
  let newlines = 0;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) newlines += 1;
  return text.endsWith("\n") ? newlines : newlines + 1;
}

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const placeholderPattern = /\[pasted #(\d+), \d+ lines?, [\d.]+ [KM]?B\]/g;

const placeholderReach = 96;

function overflows(text: string): boolean {
  return text.length > pasteCollapseChars || lineCount(text) > pasteCollapseLines;
}

function placeholderFor(ordinal: number, text: string): string {
  const lines = lineCount(text);
  const noun = lines === 1 ? "line" : "lines";
  return `[pasted #${ordinal}, ${lines} ${noun}, ${humanBytes(utf8Bytes(text))}]`;
}
