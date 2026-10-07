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

describe("the merge view", () => {
  it("picks side-by-side only at the broadsheet tier", () => {
    expect(mergeLayoutFor("broadsheet")).toBe("split");
    expect(mergeLayoutFor("column")).toBe("unified");
    expect(mergeLayoutFor("clipping")).toBe("unified");
    expect(mergeLayoutFor("masthead")).toBe("unified");
  });

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

  it("mounts two editors side by side for the split layout", () => {
    const element = host();
    const mounted = mountMergeView(element, sides, "split");
    expect(mounted.layout).toBe("split");
    expect(element.querySelectorAll(".cm-editor")).toHaveLength(2);
    expect(mounted.hunkCount()).toBe(2);
    mounted.destroy();
  });

  it("colors every rule from a flavor token and never a literal", () => {
    const element = host();
    mountMergeView(element, sides, "unified");
    const rules = [...document.querySelectorAll("style")]
      .map((style) => style.textContent ?? "")
      .join("\n");
    const ours = rules.split("\n").filter((line) => line.includes("--kw-"));
    expect(ours.length).toBeGreaterThan(5);
    expect(ours.join("\n")).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
