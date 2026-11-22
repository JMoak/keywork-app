import { afterEach, describe, expect, it } from "vitest";
import { mergeLayoutFor, mountMergeView } from "./merge-view.ts";

const sides = { before: "one\ntwo\nthree\n", after: "one\n2\nthree\nfour\n" };

afterEach(() => {
  document.body.replaceChildren();
});

function host(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

function stylesheet(): string {
  return [...document.querySelectorAll("style")].map((style) => style.textContent ?? "").join("\n");
}

describe("the merge view", () => {
  it("mounts a unified read-only view that counts hunks and walks them", () => {
    const element = host();
    const mounted = mountMergeView(element, sides, "unified");
    expect(mounted.layout).toBe("unified");
    expect(element.querySelectorAll(".cm-editor")).toHaveLength(1);
    expect(mounted.hunkCount()).toBe(2);
    expect(element.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
    mounted.nextHunk();
    mounted.previousHunk();
    mounted.destroy();
    expect(element.querySelectorAll(".cm-editor")).toHaveLength(0);
  });

  it("names each hunk by its unified header and changed lines and knows which one the cursor is on", () => {
    const element = host();
    for (const layout of ["unified", "split"] as const) {
      const mounted = mountMergeView(element, sides, layout);
      expect(mounted.hunks()).toEqual([
        { header: "@@ -2,1 +2,1 @@", removed: ["two"], added: ["2"], line: 2 },
        { header: "@@ -4,0 +4,1 @@", removed: [], added: ["four"], line: 4 },
      ]);
      expect(mounted.hunkAt()).toBe(0);
      mounted.goToHunk(1);
      expect(mounted.hunkAt()).toBe(1);
      mounted.goToHunk(0);
      expect(mounted.hunkAt()).toBe(0);
      mounted.goToHunk(7);
      expect(mounted.hunkAt()).toBe(0);
      mounted.nextHunk();
      expect(mounted.hunkAt()).toBe(1);
      mounted.previousHunk();
      expect(mounted.hunkAt()).toBe(0);
      mounted.destroy();
    }
  });

  it("shows a new or deleted file as one column whatever the width", () => {
    const created = { before: "", after: "one\n" };
    const deleted = { before: "one\n", after: "" };
    expect(mergeLayoutFor("broadsheet", created)).toBe("unified");
    expect(mergeLayoutFor("broadsheet", deleted)).toBe("unified");
    expect(mergeLayoutFor("broadsheet", sides)).toBe("split");
  });

  it("signs every added line + and every removed line − so colour is never the only cue", () => {
    for (const layout of ["unified", "split"] as const) {
      const element = host();
      mountMergeView(element, sides, layout);
      expect(element.querySelector(".cm-merge-b .cm-changedLine")).not.toBeNull();
      expect(
        element.querySelector(".cm-merge-a .cm-changedLine, .cm-deletedChunk .cm-deletedLine"),
      ).not.toBeNull();
    }
    const css = stylesheet();
    expect(css).toMatch(/\.cm-merge-b \.cm-changedLine::before \{[^}]*content: "\+"/);
    expect(css).toMatch(
      /\.cm-merge-a \.cm-changedLine::before, \S+ \.cm-deletedChunk \.cm-deletedLine::before \{[^}]*content: "−"/,
    );
  });

  it("strikes removed text and underlines added words when the system forces its colours", () => {
    mountMergeView(host(), sides, "unified");
    const forced = stylesheet().slice(stylesheet().indexOf("@media (forced-colors: active)"));
    expect(forced).toMatch(/del\.cm-deletedLine[^{]*\{text-decoration: line-through;/);
    expect(forced).toMatch(/ins \.cm-changedText \{text-decoration: underline;/);
  });

  it("scrolls by line, by page and to either edge, and keeps an offset it is handed", () => {
    for (const layout of ["unified", "split"] as const) {
      const element = host();
      const mounted = mountMergeView(element, sides, layout);
      mounted.scroll("line-down");
      const line = mounted.scrollOffset();
      expect(line).toBeGreaterThan(0);
      mounted.scroll("page-down");
      expect(mounted.scrollOffset()).toBeGreaterThan(line);
      mounted.scroll("page-up");
      mounted.scroll("line-up");
      expect(mounted.scrollOffset()).toBe(0);
      mounted.scroll("line-up");
      expect(mounted.scrollOffset()).toBe(0);
      mounted.scrollToOffset(42);
      expect(mounted.scrollOffset()).toBe(42);
      mounted.scroll("top");
      expect(mounted.scrollOffset()).toBe(0);
      mounted.destroy();
    }
  });
});
