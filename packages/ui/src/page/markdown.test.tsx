import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { decodeEntities, Markdown } from "./markdown.tsx";

function html(source: string): { container: HTMLElement; text: string } {
  const { container } = render(() => <Markdown source={source} />);
  return { container, text: container.textContent ?? "" };
}

describe("Markdown", () => {
  it("never interprets model output as html", () => {
    const { container, text } = html("<script>alert(1)</script>\n\nsafe <b>bold?</b> & done");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain("<b>bold?</b> & done");
  });

  it("renders headings with a quiet mark, lists, code spans, fences with a language tag, quotes and rules", () => {
    const { container } = html(
      "# Title\n\nsome `code` here\n\n- one\n- two\n\n```ts\nlet a = 1;\n```\n\n> quoted\n\n---\n",
    );
    expect(container.querySelector("h1.kw-heading")?.textContent).toBe("▍Title");
    expect(container.querySelector(".kw-codespan")?.textContent).toBe("code");
    expect(
      [...container.querySelectorAll(".kw-list-item")].map((item) => item.textContent),
    ).toEqual(["one", "two"]);
    const fence = container.querySelector(".kw-fence");
    expect(fence?.getAttribute("data-lang")).toBe("ts");
    expect(fence?.querySelector("code")?.textContent).toBe("let a = 1;");
    expect(container.querySelector(".kw-quote")?.textContent).toBe("quoted");
    expect(container.querySelector("hr.kw-rule")).not.toBeNull();
  });

  it("keeps links to http, https and mailto only", () => {
    const { container } = html("[ok](https://keywork.dev) and [nope](javascript:alert(1))");
    const links = [...container.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://keywork.dev", null]);
  });

  it("renders tables with alignment and images as references", () => {
    const { container } = html("| a | b |\n|:--|--:|\n| 1 | 2 |\n\n![alt](https://x/y.png)");
    expect(container.querySelector("th")?.getAttribute("style")).toContain("text-align: left");
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector(".kw-image-ref")?.textContent).toBe("[image: alt]");
  });

  it("decodes the entities marked leaves in escaped text", () => {
    expect(decodeEntities("a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;")).toBe(
      "a & b < c > d \"e\" 'f'",
    );
  });
});
