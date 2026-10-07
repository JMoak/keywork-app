import {
  getChunks,
  goToNextChunk,
  goToPreviousChunk,
  MergeView,
  unifiedMergeView,
} from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { WidthTier } from "../../page/tiers.ts";

export type MergeLayout = "unified" | "split";

export interface MergeSides {
  readonly before: string;
  readonly after: string;
}

export interface MergeMount {
  readonly layout: MergeLayout;
  hunkCount(): number;
  nextHunk(): void;
  previousHunk(): void;
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

export const mergeTheme: Extension = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--kw-panel)",
    color: "var(--kw-text)",
    fontFamily: "var(--kw-font-mono)",
  },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.45" },
  ".cm-content": { caretColor: "transparent" },
  ".cm-gutters": {
    backgroundColor: "var(--kw-panel)",
    color: "var(--kw-text-dim)",
    borderRight: "1px solid var(--kw-border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--kw-accent-soft)",
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
    backgroundColor: "var(--kw-panel-lift)",
    borderTop: "1px solid var(--kw-border)",
    borderBottom: "1px solid var(--kw-border)",
    padding: "0.2rem 0.75rem",
  },
  ".cm-mergeSpacer": { backgroundColor: "var(--kw-panel-lift)" },
  ".cm-merge-revert": { display: "none" },
});

const readOnly: Extension = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.lineWrapping,
];

const collapseUnchanged = { margin: 3, minSize: 4 };

function unifiedView(host: HTMLElement, sides: MergeSides): MergeMount {
  const view = new EditorView({
    doc: sides.after,
    extensions: [
      readOnly,
      mergeTheme,
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
  return {
    layout: "unified",
    hunkCount: () => getChunks(view.state)?.chunks.length ?? 0,
    nextHunk: () => goToNextChunk({ state: view.state, dispatch: view.dispatch }),
    previousHunk: () => goToPreviousChunk({ state: view.state, dispatch: view.dispatch }),
    destroy: () => view.destroy(),
  };
}

function splitView(host: HTMLElement, sides: MergeSides): MergeMount {
  const view = new MergeView({
    a: { doc: sides.before, extensions: [readOnly, mergeTheme] },
    b: { doc: sides.after, extensions: [readOnly, mergeTheme] },
    parent: host,
    highlightChanges: true,
    gutter: true,
    collapseUnchanged,
  });
  return {
    layout: "split",
    hunkCount: () => getChunks(view.b.state)?.chunks.length ?? 0,
    nextHunk: () => goToNextChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    previousHunk: () => goToPreviousChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    destroy: () => view.destroy(),
  };
}
