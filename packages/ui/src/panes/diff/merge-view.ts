import {
  type Chunk,
  getChunks,
  getOriginalDoc,
  goToNextChunk,
  goToPreviousChunk,
  MergeView,
  unifiedMergeView,
} from "@codemirror/merge";
import {
  Compartment,
  EditorSelection,
  EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { WidthTier } from "../../page/tiers.ts";
import { codeHighlighting, codeTheme } from "../../theme/code.ts";
import { dressInLanguage } from "../../theme/languages.ts";

export type MergeLayout = "unified" | "split";

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
  goToHunk(index: number): void;
  nextHunk(): void;
  previousHunk(): void;
  languageLoaded(): Promise<void>;
  destroy(): void;
}

export function mergeLayoutFor(tier: WidthTier): MergeLayout {
  return tier === "broadsheet" ? "split" : "unified";
}

export function mountMergeView(
  host: HTMLElement,
  sides: MergeSides,
  layout: MergeLayout,
): MergeMount {
  return layout === "split" ? splitView(host, sides) : unifiedView(host, sides);
}

export const mergeTheme: Extension = [
  codeTheme,
  codeHighlighting,
  EditorView.theme({
    ".cm-content": { caretColor: "transparent" },
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
  }),
];

const readOnly: Extension = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
];

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
        highlightChanges: true,
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
    goToHunk: (index) => landOn(view, chunks()[index]),
    nextHunk: () => goToNextChunk({ state: view.state, dispatch: view.dispatch }),
    previousHunk: () => goToPreviousChunk({ state: view.state, dispatch: view.dispatch }),
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
    highlightChanges: true,
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
    goToHunk: (index) => landOn(view.b, chunks()[index]),
    nextHunk: () => goToNextChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    previousHunk: () => goToPreviousChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    languageLoaded: () => languageLoaded,
    destroy: () => view.destroy(),
  };
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
