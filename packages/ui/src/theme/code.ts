import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type Tag, tags } from "@lezer/highlight";
import type { SyntaxKey } from "./sections.ts";

export const codeHighlightStyle: HighlightStyle = HighlightStyle.define([
  dressed("comment", [
    tags.comment,
    tags.lineComment,
    tags.blockComment,
    tags.docComment,
    tags.meta,
  ]),
  dressed("keyword", [
    tags.keyword,
    tags.controlKeyword,
    tags.definitionKeyword,
    tags.moduleKeyword,
    tags.operatorKeyword,
    tags.modifier,
    tags.self,
  ]),
  dressed("string", [
    tags.string,
    tags.docString,
    tags.character,
    tags.regexp,
    tags.special(tags.string),
  ]),
  dressed("number", [tags.number, tags.integer, tags.float]),
  dressed("type", [tags.typeName, tags.className, tags.namespace, tags.standard(tags.typeName)]),
  dressed("function", [
    tags.function(tags.variableName),
    tags.function(tags.propertyName),
    tags.function(tags.definition(tags.variableName)),
    tags.macroName,
  ]),
  dressed("variable", [tags.variableName, tags.definition(tags.variableName), tags.labelName]),
  dressed("constant", [
    tags.bool,
    tags.null,
    tags.atom,
    tags.unit,
    tags.escape,
    tags.constant(tags.variableName),
    tags.standard(tags.variableName),
  ]),
  dressed("operator", [
    tags.operator,
    tags.derefOperator,
    tags.arithmeticOperator,
    tags.logicOperator,
    tags.compareOperator,
    tags.definitionOperator,
    tags.updateOperator,
  ]),
  dressed("punctuation", [
    tags.punctuation,
    tags.separator,
    tags.bracket,
    tags.angleBracket,
    tags.brace,
    tags.paren,
    tags.squareBracket,
  ]),
  dressed("tag", [tags.tagName]),
  dressed("attribute", [tags.attributeName, tags.propertyName]),
  { tag: tags.heading, color: syntaxVariable("heading"), fontWeight: "bold" },
  dressed("link", [tags.link, tags.url]),
  { tag: tags.link, textDecoration: "underline" },
  dressed("invalid", [tags.invalid]),
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.inserted, color: "var(--kw-success)" },
  { tag: tags.deleted, color: "var(--kw-error)" },
]);

export const codeHighlighting: Extension = syntaxHighlighting(codeHighlightStyle);

export const codeTheme: Extension = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--kw-panel)",
    color: "var(--kw-text)",
    fontFamily: "var(--kw-font-mono)",
  },
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

function dressed(key: SyntaxKey, tagged: readonly Tag[]) {
  return { tag: [...tagged], color: syntaxVariable(key) };
}
