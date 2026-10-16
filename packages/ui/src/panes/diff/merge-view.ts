import {
  getChunks,
  goToNextChunk,
  goToPreviousChunk,
  MergeView,
  unifiedMergeView,
} from "@codemirror/merge";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
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

export interface MergeMount {
  readonly layout: MergeLayout;
  hunkCount(): number;
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
  return {
    layout: "unified",
    hunkCount: () => getChunks(view.state)?.chunks.length ?? 0,
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
  return {
    layout: "split",
    hunkCount: () => getChunks(view.b.state)?.chunks.length ?? 0,
    nextHunk: () => goToNextChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    previousHunk: () => goToPreviousChunk({ state: view.b.state, dispatch: view.b.dispatch }),
    languageLoaded: () => languageLoaded,
    destroy: () => view.destroy(),
  };
}
