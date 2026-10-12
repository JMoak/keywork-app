import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { codeHighlighting, codeTheme } from "../../theme/code.ts";
import { dressInLanguage } from "../../theme/languages.ts";

export interface TextMount {
  replace(text: string, numbering: LineNumbering, path?: string): void;
  scrollTo(edge: "top" | "end"): void;
  scrollBy(lines: number): void;
  lineAtTop(): number;
  languageLoaded(): Promise<void>;
  destroy(): void;
}

export interface LineNumbering {
  label(index: number): string;
}

export function mountTextView(
  host: HTMLElement,
  text: string,
  numbering: LineNumbering,
  path?: string,
): TextMount {
  let shown = build(host, text, numbering, path);
  return {
    replace: (next, nextNumbering, nextPath = path) => {
      shown.view.destroy();
      shown = build(host, next, nextNumbering, nextPath);
    },
    scrollTo: (edge) => {
      const position = edge === "top" ? 0 : shown.view.state.doc.length;
      shown.view.dispatch({ effects: EditorView.scrollIntoView(position, { y: "start" }) });
    },
    scrollBy: (lines) => {
      shown.view.scrollDOM.scrollTop += lines * shown.view.defaultLineHeight;
    },
    lineAtTop: () => shown.view.state.doc.lineAt(shown.view.viewport.from).number,
    languageLoaded: () => shown.language,
    destroy: () => shown.view.destroy(),
  };
}

export const textTheme: Extension = [codeTheme, codeHighlighting];

const readOnly: Extension = [EditorState.readOnly.of(true), EditorView.editable.of(false)];

interface Shown {
  readonly view: EditorView;
  readonly language: Promise<void>;
}

function build(host: HTMLElement, text: string, numbering: LineNumbering, path?: string): Shown {
  const language = new Compartment();
  const view = new EditorView({
    doc: text,
    extensions: [
      readOnly,
      textTheme,
      lineNumbers({ formatNumber: (line) => numbering.label(line - 1) }),
      language.of([]),
    ],
    parent: host,
  });
  return { view, language: dressInLanguage(view, language, path) };
}
