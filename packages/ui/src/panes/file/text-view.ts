import {
  Compartment,
  EditorState,
  type Extension,
  StateEffect,
  StateField,
} from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, lineNumbers } from "@codemirror/view";
import { codeHighlighting, codeTheme } from "../../theme/code.ts";
import { dressInLanguage } from "../../theme/languages.ts";

export interface TextMount {
  replace(text: string, numbering: LineNumbering, path?: string): void;
  scrollTo(edge: "top" | "end"): void;
  scrollBy(lines: number): void;
  lineAtTop(): number;
  find(query: string): FindReading;
  findStep(step: FindStep): FindReading;
  languageLoaded(): Promise<void>;
  destroy(): void;
}

export interface FindReading {
  readonly hits: number;
  readonly at: number | undefined;
}

export type FindStep = 1 | -1;

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
  let search: Search = { query: "", hits: [], at: undefined };
  const reveal = (next: Search): FindReading => {
    search = next;
    showFound(shown.view, search);
    return { hits: search.hits.length, at: search.at };
  };
  return {
    replace: (next, nextNumbering, nextPath = path) => {
      shown.view.destroy();
      shown = build(host, next, nextNumbering, nextPath);
      if (search.query !== "") reveal(searchFrom(shown.view, search.query, 0));
    },
    scrollTo: (edge) => {
      const position = edge === "top" ? 0 : shown.view.state.doc.length;
      shown.view.dispatch({ effects: EditorView.scrollIntoView(position, { y: "start" }) });
    },
    scrollBy: (lines) => {
      shown.view.scrollDOM.scrollTop += lines * shown.view.defaultLineHeight;
    },
    lineAtTop: () => shown.view.state.doc.lineAt(shown.view.viewport.from).number,
    find: (query) => reveal(searchFrom(shown.view, query, shown.view.viewport.from)),
    findStep: (step) => {
      if (search.at === undefined) return { hits: search.hits.length, at: undefined };
      const count = search.hits.length;
      return reveal({ ...search, at: (search.at + step + count) % count });
    },
    languageLoaded: () => shown.language,
    destroy: () => shown.view.destroy(),
  };
}

export const textTheme: Extension = [codeTheme, codeHighlighting];

const readOnly: Extension = [EditorState.readOnly.of(true), EditorView.editable.of(false)];

interface Search {
  readonly query: string;
  readonly hits: readonly Hit[];
  readonly at: number | undefined;
}

interface Hit {
  readonly from: number;
  readonly to: number;
}

const markFound = StateEffect.define<DecorationSet>();

const found = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (marks, transaction) => {
    for (const effect of transaction.effects) if (effect.is(markFound)) return effect.value;
    return marks.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

const hitMark = Decoration.mark({ class: "kw-find-hit" });
const currentHitMark = Decoration.mark({ class: "kw-find-hit kw-find-current" });

function searchFrom(view: EditorView, query: string, from: number): Search {
  const hits = hitsOf(view.state.doc.toString(), query);
  const ahead = hits.findIndex((hit) => hit.from >= from);
  return { query, hits, at: hits.length === 0 ? undefined : Math.max(0, ahead) };
}

function hitsOf(text: string, query: string): Hit[] {
  if (query === "") return [];
  const pattern = new RegExp(escapedForPattern(query), "giu");
  return [...text.matchAll(pattern)].map((match) => ({
    from: match.index,
    to: match.index + match[0].length,
  }));
}

function escapedForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function showFound(view: EditorView, search: Search): void {
  const marks = search.hits.map((hit, index) =>
    (index === search.at ? currentHitMark : hitMark).range(hit.from, hit.to),
  );
  const current = search.at === undefined ? undefined : search.hits[search.at];
  view.dispatch({
    effects: [
      markFound.of(Decoration.set(marks)),
      ...(current === undefined ? [] : [EditorView.scrollIntoView(current.from, { y: "center" })]),
    ],
  });
}

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
      found,
      lineNumbers({ formatNumber: (line) => numbering.label(line - 1) }),
      language.of([]),
    ],
    parent: host,
  });
  return { view, language: dressInLanguage(view, language, path) };
}
