import fc from "fast-check";
import type { Tokens } from "marked";
import { describe, expect, it } from "vitest";
import { fenceIsClosed, keepUnchanged, lexMarkdown } from "./markdown-tokens.ts";

const lines = [
  "Plain words and **strong** ones",
  "",
  "# Heading",
  "- item",
  "  - nested",
  "1. first",
  "- [ ] task",
  "> quoted",
  "```ts",
  "const a = 1;",
  "```",
  "| a | b |",
  "|---|---|",
  "| 1 | 2 |",
  "---",
  "see [docs](https://keywork.dev)",
  "[ref]: https://keywork.dev",
  "a footnote mark[^1]",
  "[^1]: the footnote",
  "    indented code",
  "text\n===",
];

const documents = fc
  .array(fc.constantFrom(...lines), { maxLength: 24 })
  .map((picked) => picked.join("\n"));

describe("keepUnchanged", () => {
  it("always equals a fresh lex of the longer text, whatever the earlier text was", () => {
    fc.assert(
      fc.property(documents, fc.nat(), (document, cut) => {
        const earlier = lexMarkdown(document.slice(0, cut % (document.length + 1)));
        const fresh = lexMarkdown(document);
        expect([...keepUnchanged<unknown[]>(earlier, fresh)]).toEqual([...fresh]);
      }),
    );
  });

  it("hands back the very same block objects for blocks the new text did not touch", () => {
    const before = lexMarkdown("# Title\n\n| a |\n|---|\n| 1 |\n\ntail");
    const grown = lexMarkdown("# Title\n\n| a |\n|---|\n| 1 |\n\ntail grows");
    const after = keepUnchanged(before, grown);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(after.at(-1)).not.toBe(before.at(-1));
  });

  it("keeps finished rows of a growing table and only replaces the open one", () => {
    const before = lexMarkdown("| a |\n|---|\n| 1 |\n| tw") as Tokens.Table[];
    const grown = lexMarkdown("| a |\n|---|\n| 1 |\n| two |\n| 3");
    const after = keepUnchanged(before, grown) as Tokens.Table[];
    expect(after[0]).not.toBe(before[0]);
    expect(after[0]?.header).toBe(before[0]?.header);
    expect(after[0]?.rows[0]).toBe(before[0]?.rows[0]);
    expect(after[0]?.rows[1]).not.toBe(before[0]?.rows[1]);
  });

  it("returns the earlier list itself when nothing changed", () => {
    const before = lexMarkdown("one\n\ntwo");
    expect(keepUnchanged(before, lexMarkdown("one\n\ntwo"))).toBe(before);
  });
});

describe("fenceIsClosed", () => {
  const fence = (source: string) => lexMarkdown(source)[0] as Tokens.Code;

  it.each([
    ["```ts\nconst a = 1;\n```", true],
    ["```ts\nconst a = 1;\n```\n\nafter", true],
    ["~~~\nplain\n~~~~", true],
    ["````md\n```\ninner\n```\n````", true],
    ["```ts\nconst a = 1;", false],
    ["```ts\nconst a = 1;\n``", false],
    ["````\ncode\n```", false],
    ["```\ncode\n~~~", false],
    ["```", false],
  ])("reads %j as closed: %s", (source, closed) => {
    expect(fenceIsClosed(fence(source))).toBe(closed);
  });
});
