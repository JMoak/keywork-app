import {
  type Chunk,
  getChunks,
  getOriginalDoc,
  goToNextChunk,
  goToPreviousChunk,
  MergeView,
  unifiedMergeView,
} from "@codemirror/merge";
import { Compartment, EditorSelection, type Extension, type Text } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import type { WidthTier } from "../../page/tiers.ts";
import { codeHighlighting, codeTheme, readOnlyCode } from "../../theme/code.ts";
import { dressInLanguage } from "../../theme/languages.ts";

export type MergeLayout = "unified" | "split";

export type ScrollMove = "line-down" | "line-up" | "page-down" | "page-up" | "top" | "end";

export interface MergeSides {
  readonly before: string;
  readonly after: string;
  readonly path?: string | undefined;
}

export interface MergeHunk {
  readonly header: string;
  readonly removed: readonly string[];
  readonly added: readonly string[];
  readonly line: number;
}

export interface MergeMount {
  readonly layout: MergeLayout;
  hunkCount(): number;
  hunks(): readonly MergeHunk[];
  hunkAt(): number;
  hunksInView(): readonly number[];
  goToHunk(index: number): void;
  nextHunk(): void;
  previousHunk(): void;
  scroll(move: ScrollMove): void;
  scrollOffset(): number;
  scrollToOffset(offset: number): void;
  languageLoaded(): Promise<void>;
  destroy(): void;
}

export function mergeLayoutFor(tier: WidthTier, sides?: MergeSides): MergeLayout {
  if (sides !== undefined && isOneSided(sides)) return "unified";
  return tier === "broadsheet" ? "split" : "unified";
}

export function mountMergeView(
  host: HTMLElement,
  sides: MergeSides,
  layout: MergeLayout,
): MergeMount {
  return layout === "split" ? splitView(host, sides) : unifiedView(host, sides);
}

const signColumn = "2.5ch";

const signGlyph = {
  display: "inline-block",
  width: "2ch",
  marginLeft: "-2ch",
  fontWeight: "bold",
};

export const mergeTheme: Extension = [
  codeTheme,
  codeHighlighting,
  EditorView.theme({
    ".cm-content": { caretColor: "transparent" },
    ".cm-line, .cm-deletedChunk .cm-deletedLine": { paddingLeft: signColumn },
    ".cm-deletedChunk": { paddingLeft: "0" },
    "&.cm-merge-b .cm-changedLine::before": {
      ...signGlyph,
      content: '"+"',
      color: "var(--kw-success)",
    },
    "&.cm-merge-a .cm-changedLine::before, .cm-deletedChunk .cm-deletedLine::before": {
      ...signGlyph,
      content: '"−"',
      color: "var(--kw-error)",
    },
    ".cm-changedLine, .cm-insertedLine": {
      backgroundColor: "var(--kw-diff-inserted-line)",
    },
    ".cm-deletedChunk, .cm-deletedLine": {
      backgroundColor: "var(--kw-diff-deleted-line)",
    },
    ".cm-changedText, ins.cm-insertedLine": {
      background: "var(--kw-diff-inserted-text)",
      textDecoration: "none",
    },
    ".cm-deletedText, del": {
      background: "var(--kw-diff-deleted-text)",
      textDecoration: "none",
    },
    ".cm-changeGutter": { width: "3px", paddingLeft: "0" },
    ".cm-changedLineGutter": { background: "var(--kw-success)" },
    ".cm-deletedLineGutter": { background: "var(--kw-error)" },
    ".cm-collapsedLines": {
      color: "var(--kw-text-dim)",
      background: "var(--kw-panel-lift)",
      borderTop: "1px solid var(--kw-border)",
      borderBottom: "1px solid var(--kw-border)",
      padding: "0.2rem 0.75rem",
    },
    ".cm-mergeSpacer": { backgroundColor: "var(--kw-panel-lift)" },
    ".cm-merge-revert": { display: "none" },
    "@media (forced-colors: active)": {
      ".cm-content .cm-deletedLine del, .cm-content del.cm-deletedLine, .cm-content .cm-deletedText":
        { textDecoration: "line-through" },
      ".cm-content ins .cm-changedText": { textDecoration: "underline" },
    },
  }),
];

const readOnly: Extension = [readOnlyCode, EditorView.lineWrapping, lineNumbers()];

const collapseUnchanged = { margin: 3, minSize: 4 };

function unifiedView(host: HTMLElement, sides: MergeSides): MergeMount {
  const language = new Compartment();
  const view = new EditorView({
    doc: sides.after,
    extensions: [
      readOnly,
      mergeTheme,
      language.of([]),
      unifiedMergeView({
        original: sides.before,
        mergeControls: false,
        highlightChanges: !isOneSided(sides),
        gutter: true,
        collapseUnchanged,
      }),
    ],
    parent: host,
  });
  const languageLoaded = dressInLanguage(view, language, sides.path);
  const chunks = (): readonly Chunk[] => getChunks(view.state)?.chunks ?? [];
  return {
    layout: "unified",
    hunkCount: () => chunks().length,
    hunks: () => chunks().map((chunk) => hunkOf(chunk, getOriginalDoc(view.state), view.state.doc)),
    hunkAt: () => hunkIndexAt(chunks(), view.state.selection.main.head),
    hunksInView: () => chunksInView(view, view.scrollDOM, chunks()),
    goToHunk: (index) => landOn(view, chunks()[index]),
    nextHunk: () => goToNextChunk({ state: view.state, dispatch: view.dispatch }),
    previousHunk: () => goToPreviousChunk({ state: view.state, dispatch: view.dispatch }),
    ...scrolling(view.scrollDOM, () => view.defaultLineHeight),
    languageLoaded: () => languageLoaded,
    destroy: () => view.destroy(),
  };
}

function splitView(host: HTMLElement, sides: MergeSides): MergeMount {
  const before = new Compartment();
  const after = new Compartment();
  const view = new MergeView({
    a: { doc: sides.before, extensions: [readOnly, mergeTheme, before.of([])] },
    b: { doc: sides.after, extensions: [readOnly, mergeTheme, after.of([])] },
    parent: host,
    highlightChanges: !isOneSided(sides),
    gutter: true,
    collapseUnchanged,
  });
  const languageLoaded = Promise.all([
    dressInLanguage(view.a, before, sides.path),
    dressInLanguage(view.b, after, sides.path),
  ]).then(() => undefined);
  const chunks = (): readonly Chunk[] => getChunks(view.b.state)?.chunks ?? [];
  return {
    layout: "split",
    hunkCount: () => chunks().length,
    hunks: () => chunks().map((chunk) => hunkOf(chunk, view.a.state.doc, view.b.state.doc)),
    hunkAt: () => hunkIndexAt(chunks(), view.b.state.selection.main.head),
    hunksInView: () => chunksInView(view.b, view.dom, chunks()),
    goToHunk: (index) => landOn(view.b, chunks()[index]),
    nextHunk: () => goToNextChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    previousHunk: () => goToPreviousChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    ...scrolling(view.dom, () => view.b.defaultLineHeight),
    languageLoaded: () => languageLoaded,
    destroy: () => view.destroy(),
  };
}

function isOneSided(sides: MergeSides): boolean {
  return sides.before === "" || sides.after === "";
}

type Scrolling = Pick<MergeMount, "scroll" | "scrollOffset" | "scrollToOffset">;

function scrolling(scroller: HTMLElement, lineHeight: () => number): Scrolling {
  return {
    scroll: (move) => {
      scroller.scrollTop = offsetAfter(move, scroller, lineHeight());
    },
    scrollOffset: () => scroller.scrollTop,
    scrollToOffset: (offset) => {
      scroller.scrollTop = offset;
    },
  };
}

function offsetAfter(move: ScrollMove, scroller: HTMLElement, line: number): number {
  const page = Math.max(line, scroller.clientHeight - line);
  switch (move) {
    case "line-down":
      return scroller.scrollTop + line;
    case "line-up":
      return Math.max(0, scroller.scrollTop - line);
    case "page-down":
      return scroller.scrollTop + page;
    case "page-up":
      return Math.max(0, scroller.scrollTop - page);
    case "top":
      return 0;
    case "end":
      return scroller.scrollHeight;
  }
}

function chunksInView(view: EditorView, scroller: HTMLElement, chunks: readonly Chunk[]): number[] {
  const top = scroller.getBoundingClientRect().top - view.documentTop;
  const bottom = top + scroller.clientHeight;
  const length = view.state.doc.length;
  return chunks.flatMap((chunk, index) => {
    const from = view.lineBlockAt(Math.min(chunk.fromB, length)).top;
    const to = view.lineBlockAt(Math.min(chunk.endB, length)).bottom;
    return to >= top && from <= bottom ? [index] : [];
  });
}

function hunkOf(chunk: Chunk, before: Text, after: Text): MergeHunk {
  const removed = linesOf(before, chunk.fromA, chunk.toA, chunk.endA);
  const added = linesOf(after, chunk.fromB, chunk.toB, chunk.endB);
  return {
    header: `@@ -${rangeOf(removed)} +${rangeOf(added)} @@`,
    removed: removed.lines,
    added: added.lines,
    line: added.from + 1,
  };
}

interface LineSpan {
  readonly from: number;
  readonly lines: readonly string[];
}

function linesOf(doc: Text, from: number, to: number, end: number): LineSpan {
  const start = doc.lineAt(Math.min(from, doc.length)).number;
  if (from === to) return { from: from >= doc.length ? doc.lines : start - 1, lines: [] };
  const last = doc.lineAt(Math.min(end, doc.length)).number;
  const lines: string[] = [];
  for (let number = start; number <= last; number += 1) lines.push(doc.line(number).text);
  return { from: start - 1, lines };
}

function rangeOf(span: LineSpan): string {
  return span.lines.length === 0 ? `${span.from},0` : `${span.from + 1},${span.lines.length}`;
}

function landOn(view: EditorView, chunk: Chunk | undefined): void {
  if (chunk === undefined) return;
  const to = Math.min(chunk.toB, view.state.doc.length);
  view.dispatch({
    selection: { anchor: chunk.fromB },
    effects: EditorView.scrollIntoView(EditorSelection.range(to, chunk.fromB)),
  });
}

function hunkIndexAt(chunks: readonly Chunk[], head: number): number {
  const index = chunks.findLastIndex((chunk) => chunk.fromB <= head);
  return Math.max(index, 0);
}
