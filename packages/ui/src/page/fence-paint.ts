import { type Language, LanguageDescription } from "@codemirror/language";
import { highlightTree } from "@lezer/highlight";
import { proseCodeHighlighter } from "../theme/code.ts";
import { languages } from "../theme/languages.ts";

export interface PaintedRun {
  readonly text: string;
  readonly classes: string;
}

export const largestPaintedFence = 40_000;

export function fenceLanguageName(info: string | undefined): string {
  return info?.trim().split(/\s+/)[0] ?? "";
}

export function fenceLanguage(name: string): LanguageDescription | undefined {
  if (name === "") return undefined;
  return (
    LanguageDescription.matchLanguageName(languages, name, false) ??
    LanguageDescription.matchFilename(languages, `fence.${name.toLowerCase()}`) ??
    undefined
  );
}

export function fenceIsPaintable(name: string, code: string): boolean {
  return code.length <= largestPaintedFence && fenceLanguage(name) !== undefined;
}

export function paintFence(name: string, code: string): Promise<readonly PaintedRun[] | undefined> {
  const language = fenceLanguage(name);
  if (language === undefined || code.length > largestPaintedFence) {
    return Promise.resolve(undefined);
  }
  const key = `${name}\n${code}`;
  const known = recentPaint.get(key);
  if (known !== undefined) return known;
  const painting = paintWith(language, code).catch(() => undefined);
  remember(key, painting);
  return painting;
}

export function paintedNodes(runs: readonly PaintedRun[]): Node[] {
  return runs.map((run) => {
    if (run.classes === "") return document.createTextNode(run.text);
    const span = document.createElement("span");
    span.className = run.classes;
    span.textContent = run.text;
    return span;
  });
}

const recentPaint = new Map<string, Promise<readonly PaintedRun[] | undefined>>();
const recentPaintLimit = 64;

async function paintWith(language: LanguageDescription, code: string): Promise<PaintedRun[]> {
  const support = await language.load();
  await afterThisTask();
  return runsOf(code, support.language);
}

function afterThisTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function runsOf(code: string, language: Language): PaintedRun[] {
  const runs: PaintedRun[] = [];
  let at = 0;
  highlightTree(language.parser.parse(code), proseCodeHighlighter, (from, to, classes) => {
    if (from > at) runs.push({ text: code.slice(at, from), classes: "" });
    runs.push({ text: code.slice(from, to), classes });
    at = to;
  });
  if (at < code.length) runs.push({ text: code.slice(at), classes: "" });
  return runs;
}

function remember(key: string, painting: Promise<readonly PaintedRun[] | undefined>): void {
  recentPaint.set(key, painting);
  const oldest = recentPaint.keys().next().value;
  if (recentPaint.size > recentPaintLimit && oldest !== undefined) recentPaint.delete(oldest);
}
