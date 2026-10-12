import { afterEach, describe, expect, it } from "vitest";
import { mountMergeView } from "../panes/diff/merge-view.ts";
import { mountTextView } from "../panes/file/text-view.ts";
import { codeHighlightStyle } from "./code.ts";
import { languageOf, languages } from "./languages.ts";

const numbering = { label: (index: number) => String(index + 1) };

afterEach(() => {
  document.body.replaceChildren();
});

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function stylesheetText(): string {
  return [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
}

function highlightedSpans(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(".cm-line span[class]")].filter((span) =>
    /ͼ/.test(span.className),
  );
}

describe("the code language set", () => {
  it.each([
    ["src/app.ts", "TypeScript"],
    ["src/view.tsx", "TSX"],
    ["index.mjs", "JavaScript"],
    ["package.json", "JSON"],
    ["docs/README.md", "Markdown"],
    ["app.css", "CSS"],
    ["index.html", "HTML"],
    ["tool.py", "Python"],
    ["main.rs", "Rust"],
    ["main.go", "Go"],
    [".github/ci.yml", "YAML"],
    ["schema.sql", "SQL"],
    ["engine.cpp", "C++"],
    ["Main.java", "Java"],
    ["icon.svg", "XML"],
    ["C:\\work\\lib.h", "C++"],
  ])("picks %s as %s by extension", (path, name) => {
    expect(languageOf(path)?.name).toBe(name);
  });

  it("leaves unknown files and no path plain", () => {
    expect(languageOf("notes.txt")).toBeUndefined();
    expect(languageOf(undefined)).toBeUndefined();
    expect(languages.length).toBeGreaterThanOrEqual(13);
  });

  it("colors every highlight from a --kw-syntax variable and never a literal", () => {
    const rules = codeHighlightStyle.module?.getRules() ?? "";
    const colors = [...rules.matchAll(/color:\s*([^;}]+)/g)].map(([, value]) => value?.trim());
    expect(colors.length).toBeGreaterThan(10);
    for (const color of colors) {
      expect(color).toMatch(/^var\(--kw-(syntax-[a-z]+|success|error)\)$/);
    }
    expect(rules).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});

describe("the file viewer", () => {
  it("highlights a TypeScript file once its language loads", async () => {
    const element = host();
    const mounted = mountTextView(
      element,
      "const answer: number = 42; // why\n",
      numbering,
      "a.ts",
    );
    await mounted.languageLoaded();
    expect(highlightedSpans(element).length).toBeGreaterThan(2);
    expect(stylesheetText()).toContain("var(--kw-syntax-keyword)");
    mounted.destroy();
  });

  it("highlights headings and links in prose files with the syntax inks", async () => {
    const element = host();
    const mounted = mountTextView(
      element,
      "# Title\n\nsee [the docs](https://example.com)\n",
      numbering,
      "README.md",
    );
    await mounted.languageLoaded();
    expect(highlightedSpans(element).length).toBeGreaterThan(0);
    const rules = codeHighlightStyle.module?.getRules() ?? "";
    expect(rules).toContain("var(--kw-syntax-heading)");
    expect(rules).toContain("var(--kw-syntax-link)");
    mounted.destroy();
  });

  it("dresses selection and cursor from the theme", () => {
    mountTextView(host(), "plain\n", numbering, "notes.txt").destroy();
    const css = stylesheetText();
    expect(css).toContain("var(--kw-selection)");
    expect(css).toContain("var(--kw-selection-text)");
    expect(css).toContain("var(--kw-cursor)");
  });
});

describe("the diff merge view", () => {
  it("highlights both sides by the file's language and paints diffs from the theme", async () => {
    const element = host();
    const mounted = mountMergeView(
      element,
      { before: "let a = 1;\n", after: "const a = 2;\n", path: "x.js" },
      "split",
    );
    await mounted.languageLoaded();
    expect(highlightedSpans(element).length).toBeGreaterThan(2);
    const css = stylesheetText();
    expect(css).toContain("var(--kw-diff-inserted-line)");
    expect(css).toContain("var(--kw-diff-deleted-text)");
    expect(css).not.toContain("color-mix");
    mounted.destroy();
  });
});
