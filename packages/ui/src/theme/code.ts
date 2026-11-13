import { HighlightStyle, syntaxHighlighting, type TagStyle } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type Highlighter, type Tag, tagHighlighter, tags } from "@lezer/highlight";
import type { SyntaxKey } from "./sections.ts";

interface Ink {
  readonly key: SyntaxKey;
  readonly tags: readonly Tag[];
  readonly bold?: boolean;
}

const inks: readonly Ink[] = [
  {
    key: "comment",
    tags: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment, tags.meta],
  },
  {
    key: "keyword",
    tags: [
      tags.keyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.self,
    ],
  },
  {
    key: "string",
    tags: [tags.string, tags.docString, tags.character, tags.regexp, tags.special(tags.string)],
  },
  { key: "number", tags: [tags.number, tags.integer, tags.float] },
  {
    key: "type",
    tags: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)],
  },
  {
    key: "function",
    tags: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.function(tags.definition(tags.variableName)),
      tags.macroName,
    ],
  },
  {
    key: "variable",
    tags: [tags.variableName, tags.definition(tags.variableName), tags.labelName],
  },
  {
    key: "constant",
    tags: [
      tags.bool,
      tags.null,
      tags.atom,
      tags.unit,
      tags.escape,
      tags.constant(tags.variableName),
      tags.standard(tags.variableName),
    ],
  },
  {
    key: "operator",
    tags: [
      tags.operator,
      tags.derefOperator,
      tags.arithmeticOperator,
      tags.logicOperator,
      tags.compareOperator,
      tags.definitionOperator,
      tags.updateOperator,
    ],
  },
  {
    key: "punctuation",
    tags: [
      tags.punctuation,
      tags.separator,
      tags.bracket,
      tags.angleBracket,
      tags.brace,
      tags.paren,
      tags.squareBracket,
    ],
  },
  { key: "tag", tags: [tags.tagName] },
  { key: "attribute", tags: [tags.attributeName, tags.propertyName] },
  { key: "heading", tags: [tags.heading], bold: true },
  { key: "link", tags: [tags.link, tags.url] },
  { key: "invalid", tags: [tags.invalid] },
];

export const codeHighlightStyle: HighlightStyle = HighlightStyle.define([
  ...inks.map(dressed),
  { tag: tags.link, textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.inserted, color: "var(--kw-success)" },
  { tag: tags.deleted, color: "var(--kw-error)" },
]);

export const codeHighlighting: Extension = syntaxHighlighting(codeHighlightStyle);

export const syntaxClassPrefix = "kw-syntax-";

export const proseCodeHighlighter: Highlighter = tagHighlighter([
  ...inks.map((ink) => ({ tag: [...ink.tags], class: syntaxClass(ink.key) })),
  { tag: tags.emphasis, class: `${syntaxClassPrefix}emphasis` },
  { tag: tags.strong, class: `${syntaxClassPrefix}strong` },
  { tag: tags.strikethrough, class: `${syntaxClassPrefix}struck` },
  { tag: tags.inserted, class: `${syntaxClassPrefix}inserted` },
  { tag: tags.deleted, class: `${syntaxClassPrefix}deleted` },
]);

// CodeMirror cancels a press's native focus and focuses its content element itself, then blurs
// whatever held focus; read-only content is focusable only through a tabindex.
export const readOnlyCode: Extension = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
  EditorView.contentAttributes.of({ tabindex: "-1" }),
];

export const codeTheme: Extension = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--kw-panel)",
    color: "var(--kw-text)",
    fontFamily: "var(--kw-font-mono)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.45" },
  ".cm-content": { caretColor: "var(--kw-cursor)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--kw-cursor)" },
  ".cm-gutters": {
    backgroundColor: "var(--kw-panel)",
    color: "var(--kw-text-dim)",
    borderRight: "1px solid var(--kw-border)",
  },
  ".cm-activeLine": { backgroundColor: "var(--kw-panel-lift)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--kw-panel-lift)", color: "var(--kw-text-mid)" },
  ".cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    { backgroundColor: "var(--kw-selection)" },
  ".cm-content ::selection": {
    backgroundColor: "var(--kw-selection)",
    color: "var(--kw-selection-text)",
  },
  ".cm-matchingBracket": {
    backgroundColor: "var(--kw-panel-lift)",
    outline: "1px solid var(--kw-border)",
  },
});

export function syntaxVariable(key: SyntaxKey): string {
  return `var(--kw-syntax-${key})`;
}

export function syntaxClass(key: SyntaxKey): string {
  return `${syntaxClassPrefix}${key}`;
}

function dressed(ink: Ink): TagStyle {
  const colored = { tag: [...ink.tags], color: syntaxVariable(ink.key) };
  return ink.bold === true ? { ...colored, fontWeight: "bold" } : colored;
}
