import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import type { Compartment } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export const languages: readonly LanguageDescription[] = [
  described("TypeScript", ["ts", "mts", "cts"], async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
  ),
  described("TSX", ["tsx"], async () =>
    (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true }),
  ),
  described("JavaScript", ["js", "mjs", "cjs"], async () =>
    (await import("@codemirror/lang-javascript")).javascript(),
  ),
  described("JSX", ["jsx"], async () =>
    (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  ),
  described("JSON", ["json", "jsonc", "json5"], async () =>
    (await import("@codemirror/lang-json")).json(),
  ),
  described("Markdown", ["md", "markdown", "mdx"], async () =>
    (await import("@codemirror/lang-markdown")).markdown({ codeLanguages: [...languages] }),
  ),
  described("CSS", ["css"], async () => (await import("@codemirror/lang-css")).css()),
  described("HTML", ["html", "htm"], async () => (await import("@codemirror/lang-html")).html()),
  described("Python", ["py", "pyi"], async () =>
    (await import("@codemirror/lang-python")).python(),
  ),
  described("Rust", ["rs"], async () => (await import("@codemirror/lang-rust")).rust()),
  described("Go", ["go"], async () => (await import("@codemirror/lang-go")).go()),
  described("YAML", ["yaml", "yml"], async () => (await import("@codemirror/lang-yaml")).yaml()),
  described("SQL", ["sql"], async () => (await import("@codemirror/lang-sql")).sql()),
  described("C++", ["c", "h", "cc", "cpp", "cxx", "hh", "hpp", "hxx"], async () =>
    (await import("@codemirror/lang-cpp")).cpp(),
  ),
  described("Java", ["java"], async () => (await import("@codemirror/lang-java")).java()),
  described("XML", ["xml", "svg", "xsd", "xsl", "plist", "csproj"], async () =>
    (await import("@codemirror/lang-xml")).xml(),
  ),
];

export function languageOf(path: string | undefined): LanguageDescription | undefined {
  if (path === undefined) return undefined;
  const filename = path.split(/[/]/).at(-1) ?? path;
  return LanguageDescription.matchFilename([...languages], filename) ?? undefined;
}

export async function loadLanguage(path: string | undefined): Promise<LanguageSupport | undefined> {
  return languageOf(path)?.load();
}

export async function dressInLanguage(
  view: EditorView,
  compartment: Compartment,
  path: string | undefined,
): Promise<void> {
  const support = await loadLanguage(path).catch(() => undefined);
  if (support === undefined || !view.dom.isConnected) return;
  view.dispatch({ effects: compartment.reconfigure(support) });
}

function described(
  name: string,
  extensions: readonly string[],
  load: () => Promise<LanguageSupport>,
): LanguageDescription {
  return LanguageDescription.of({ name, extensions: [...extensions], load });
}
