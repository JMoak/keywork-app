import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyWords } from "./fence.tsx";
import { decodeEntities, externalLinkHint, Markdown } from "./markdown.tsx";
import { type MarkdownHost, MarkdownHostProvider } from "./markdown-host.ts";

afterEach(cleanup);

function html(source: string): { container: HTMLElement; text: string } {
  const { container } = render(() => <Markdown source={source} />);
  return { container, text: container.textContent ?? "" };
}

function hosted(source: string) {
  const host = {
    openExternal: vi.fn<MarkdownHost["openExternal"]>(async () => undefined),
    writeClipboard: vi.fn<MarkdownHost["writeClipboard"]>(async () => undefined),
  };
  const { container } = render(() => (
    <MarkdownHostProvider value={host}>
      <Markdown source={source} />
    </MarkdownHostProvider>
  ));
  return { container, host };
}

function streamed(first: string) {
  const [source, setSource] = createSignal(first);
  const { container } = render(() => <Markdown source={source()} />);
  const removed: Node[] = [];
  const watcher = new MutationObserver((records) => {
    for (const record of records) removed.push(...record.removedNodes);
  });
  watcher.observe(container, { childList: true, subtree: true });
  const append = async (more: string): Promise<void> => {
    setSource((before) => before + more);
    await Promise.resolve();
  };
  return { container, append, removed, stop: () => watcher.disconnect() };
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

  it("hides link reference definitions the way a reader expects", () => {
    const { container, text } = html("see [the docs][d]\n\n[d]: https://keywork.dev");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://keywork.dev");
    expect(text).not.toContain("[d]:");
  });
});

describe("Markdown while a reply streams", () => {
  it("keeps every finished block in place and only grows the open one", async () => {
    const reply = streamed("First paragraph.\n\nSecond, still");
    const first = reply.container.querySelector(".kw-paragraph");
    const firstText = first?.firstChild;
    await reply.append(" growing.\n\nThird");
    await reply.append(" arrives.");
    reply.stop();
    expect(reply.removed.filter((node) => node.nodeType === Node.ELEMENT_NODE)).toEqual([]);
    expect(reply.container.querySelector(".kw-paragraph")).toBe(first);
    expect(first?.firstChild).toBe(firstText);
    expect(
      [...reply.container.querySelectorAll(".kw-paragraph")].map((p) => p.textContent),
    ).toEqual(["First paragraph.", "Second, still growing.", "Third arrives."]);
  });

  it("adds table rows without rebuilding the rows already shown", async () => {
    const reply = streamed("| # | name |\n|---|---|\n| 1 | one |\n| 2 | tw");
    const rows = [...reply.container.querySelectorAll("tbody tr")];
    await reply.append("o |\n| 3 | three |\n| 4 | fo");
    reply.stop();
    const after = [...reply.container.querySelectorAll("tbody tr")];
    expect(after.slice(0, 2)).toEqual(rows);
    expect(after.map((row) => row.textContent)).toEqual(["1one", "2two", "3three", "4fo"]);
    expect(reply.removed.filter((node) => node.nodeType === Node.ELEMENT_NODE)).toEqual([]);
  });

  it("leaves a selection in a finished paragraph intact as text keeps arriving", async () => {
    const reply = streamed("Copy this command.\n\nThe model keeps");
    const finished = reply.container.querySelector(".kw-paragraph");
    const range = document.createRange();
    range.selectNodeContents(finished as Node);
    await reply.append(" writing more and more words");
    await reply.append("\n\nand another paragraph.");
    reply.stop();
    expect(finished?.isConnected).toBe(true);
    expect(range.toString()).toBe("Copy this command.");
  });

  it("keeps the code of a growing fence in one text node instead of rebuilding it", async () => {
    const reply = streamed("```ts\nconst a = 1;");
    const code = reply.container.querySelector(".kw-fence-code code");
    await reply.append("\nconst b = 2;");
    reply.stop();
    expect(reply.container.querySelector(".kw-fence-code code")).toBe(code);
    expect(code?.textContent).toBe("const a = 1;\nconst b = 2;");
    expect(code?.querySelector("span")).toBeNull();
  });
});

describe("Markdown task lists and footnotes", () => {
  it("renders task items as read-only checkboxes that carry their state", () => {
    const { container, text } = html("- [ ] an open task\n- [x] a done task\n- a plain item");
    const boxes = [...container.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((box) => box.checked)).toEqual([false, true]);
    expect(boxes.every((box) => box.disabled)).toBe(true);
    expect(text).not.toContain("[ ]");
    expect(text).not.toContain("[x]");
    const items = [...container.querySelectorAll(".kw-list-item")];
    expect(items.map((item) => item.getAttribute("data-task"))).toEqual(["false", "true", null]);
  });

  it("renders a footnote reference that jumps to its footnote", () => {
    const { container, text } = html("Claim with a source[^1].\n\n[^1]: The source itself.");
    const reference = container.querySelector<HTMLAnchorElement>(".kw-footnote-ref a");
    const footnote = container.querySelector<HTMLElement>(".kw-footnote");
    expect(reference?.textContent).toBe("1");
    expect(reference?.getAttribute("aria-label")).toBe("footnote 1");
    expect(footnote?.textContent).toBe("1The source itself.");
    expect(reference?.getAttribute("href")).toBe(`#${footnote?.id}`);
    expect(text).not.toContain("[^1]");
    fireEvent.click(reference as HTMLElement);
    expect(document.activeElement).toBe(footnote);
  });
});

describe("Markdown links", () => {
  it("opens a web link in the browser through the host, never in the app window", () => {
    const { container, host } = hosted("read [the docs](https://keywork.dev/docs) now");
    const link = container.querySelector<HTMLAnchorElement>("a.kw-link");
    expect(link?.title).toBe(`https://keywork.dev/docs · ${externalLinkHint}`);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(host.openExternal).toHaveBeenCalledWith("https://keywork.dev/docs");
  });

  it("opens a middle-clicked link the same way and ignores the right button", () => {
    const { container, host } = hosted("<https://keywork.dev>");
    const link = container.querySelector("a.kw-link") as HTMLElement;
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 2 }));
    expect(host.openExternal).not.toHaveBeenCalled();
    fireEvent(link, new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }));
    expect(host.openExternal).toHaveBeenCalledWith("https://keywork.dev");
  });

  it("keeps a link's own title beside where it goes", () => {
    const { container } = html('[docs](https://keywork.dev "the manual")');
    expect(container.querySelector("a")?.title).toBe(
      `the manual · https://keywork.dev · ${externalLinkHint}`,
    );
  });

  it("shows links the browser cannot open as plain text with their target", () => {
    const { container } = html(
      "[ok](https://keywork.dev), [script](javascript:alert(1)), [mail](mailto:a@b.c), [file](src/math.ts)",
    );
    expect([...container.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "https://keywork.dev",
    ]);
    expect(
      [...container.querySelectorAll(".kw-link-inert")].map((span) => [
        span.textContent,
        span.getAttribute("title"),
      ]),
    ).toEqual([
      ["script", "javascript:alert(1)"],
      ["mail", "mailto:a@b.c"],
      ["file", "src/math.ts"],
    ]);
  });
});

describe("Markdown code blocks", () => {
  it("keeps the language label and the copy button out of the code's text", () => {
    const { container } = hosted("```typescript\nconst aVeryLongIdentifierName = 1;\n```");
    const fence = container.querySelector(".kw-fence");
    expect(fence?.getAttribute("data-lang")).toBe("typescript");
    expect(fence?.querySelector(".kw-fence-code")?.textContent).toBe(
      "const aVeryLongIdentifierName = 1;",
    );
    expect(fence?.textContent).toBe(`${copyWords.idle}const aVeryLongIdentifierName = 1;`);
    expect(fence?.querySelector(".kw-fence-code .kw-fence-copy")).toBeNull();
  });

  it("copies exactly the block's code from its own button, reachable on the transcript walk", async () => {
    const { container, host } = hosted("```ts\nlet a = 1;\nlet b = 2;\n```\n\n```\nplain\n```");
    const buttons = [...container.querySelectorAll<HTMLButtonElement>(".kw-fence-copy")];
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "copy ts code",
      "copy code",
    ]);
    expect(buttons.every((button) => button.hasAttribute("data-walk"))).toBe(true);
    fireEvent.click(buttons[0] as HTMLButtonElement);
    expect(host.writeClipboard).toHaveBeenCalledWith("let a = 1;\nlet b = 2;");
    await waitFor(() => expect(buttons[0]?.textContent).toBe(copyWords.copied));
  });

  it("says so when the clipboard refuses", async () => {
    const { container, host } = hosted("```\nx\n```");
    host.writeClipboard.mockRejectedValueOnce(new Error("denied"));
    const button = container.querySelector(".kw-fence-copy") as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toBe(copyWords.failed));
  });

  it("highlights a finished fence with the theme's syntax inks and keeps its text", async () => {
    const source = "```ts\nexport const answer: number = 42; // why\n```";
    const { container } = html(source);
    const code = container.querySelector(".kw-fence-code code") as HTMLElement;
    await waitFor(() => expect(code.querySelector(".kw-syntax-keyword")).not.toBeNull());
    expect(code.querySelector(".kw-syntax-comment")?.textContent).toBe("// why");
    expect(code.textContent).toBe("export const answer: number = 42; // why");
  });

  it("leaves a fence in an unknown language plain", async () => {
    const { container } = html("```zork\nexport const a = 1;\n```");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector(".kw-fence-code span")).toBeNull();
  });
});
