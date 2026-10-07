import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";

export interface TextMount {
  replace(text: string, numbering: LineNumbering): void;
  scrollTo(edge: "top" | "end"): void;
  scrollBy(lines: number): void;
  lineAtTop(): number;
  destroy(): void;
}

export interface LineNumbering {
  label(index: number): string;
}

export const highlighting: Extension[] = [];

export function mountTextView(host: HTMLElement, text: string, numbering: LineNumbering): TextMount {
  let view = build(host, text, numbering);
  return {
    replace: (next, nextNumbering) => {
      view.destroy();
      view = build(host, next, nextNumbering);
    },
    scrollTo: (edge) => {
      const position = edge === "top" ? 0 : view.state.doc.length;
      view.dispatch({ effects: EditorView.scrollIntoView(position, { y: "start" }) });
    },
    scrollBy: (lines) => {
      view.scrollDOM.scrollTop += lines * view.defaultLineHeight;
    },
    lineAtTop: () => view.state.doc.lineAt(view.viewport.from).number,
    destroy: () => view.destroy(),
  };
}

export const textTheme: Extension = EditorView.theme({
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
});

const readOnly: Extension = [EditorState.readOnly.of(true), EditorView.editable.of(false)];

function build(host: HTMLElement, text: string, numbering: LineNumbering): EditorView {
  return new EditorView({
    doc: text,
    extensions: [
      readOnly,
      textTheme,
      lineNumbers({ formatNumber: (line) => numbering.label(line - 1) }),
      ...highlighting,
    ],
    parent: host,
  });
}
