import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import decided from "../../../client/src/fixtures/decided.jsonl?raw";
import { parseJsonl } from "../dev/replay.ts";
import { scenarios } from "../dev/scenarios.ts";
import { ConversationPane, headline, wordCount } from "./pane.tsx";
import { tierMinPx, tierOf } from "./tiers.ts";

async function fixture(name: string): Promise<SessionProjection> {
  const scenario = scenarios.find((candidate) => candidate.name === name);
  if (scenario === undefined) throw new Error(`no fixture named ${name}`);
  return projectAll(emptyProjection, scenario.envelopes);
}

function rows(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-entry")].map(
    (row) =>
      `${row.getAttribute("data-voice")} ${row.querySelector(".kw-body")?.textContent?.trim() ?? ""}`,
  );
}

describe("ConversationPane over the recorded fixtures", () => {
  it.each(["plain", "thinking", "tool", "denied", "interrupt", "queued", "injected", "delegated"])(
    "renders %s",
    async (name) => {
      const projection = await fixture(name);
      const { container } = render(() => <ConversationPane projection={projection} />);
      expect(container.querySelectorAll(".kw-entry")).toHaveLength(projection.entries.length);
      expect(rows(container)).toMatchSnapshot();
    },
  );

  it("stamps voices by provenance and shows a settled agent stamp when the turn is over", async () => {
    const projection = await fixture("tool");
    const { container } = render(() => <ConversationPane projection={projection} />);
    const stamps = [...container.querySelectorAll(".kw-stamp")].map((stamp) =>
      stamp.getAttribute("data-voice"),
    );
    expect(stamps).toEqual(["user", "machine", "agent"]);
    expect(container.querySelector(".kw-stamp[data-streaming]")).toBeNull();
  });

  it("tags a prompt another client injected with its machine voice", () => {
    const projection = projectAll(emptyProjection, [
      {
        id: 1,
        ts: "2026-09-07T12:00:00.000Z",
        sessionId: "s1",
        type: "turn.started",
        payload: { userText: "dictated", origin: { kind: "external", client: "wispr-flow" } },
      },
    ]);
    const { container } = render(() => <ConversationPane projection={projection} />);
    expect(container.querySelector(".kw-origin")?.textContent).toBe("via wispr-flow");
    expect(container.querySelector(".kw-user")?.textContent).toBe("dictatedvia wispr-flow");
  });

  it("animates the agent stamp while the answer streams", async () => {
    const streaming = projectAll(emptyProjection, [
      {
        id: 1,
        ts: "2026-09-07T12:00:00.000Z",
        sessionId: "s1",
        type: "turn.started",
        payload: { userText: "go" },
      },
      {
        id: 2,
        ts: "2026-09-07T12:00:00.250Z",
        sessionId: "s1",
        type: "turn.delta",
        payload: { delta: { type: "text", text: "partial" } },
      },
    ]);
    const { container } = render(() => <ConversationPane projection={streaming} />);
    expect(container.querySelector(".kw-stamp[data-voice='agent'][data-streaming]")).not.toBeNull();
  });

  it("renders the tool row from toolRowSpans with the outcome as the only colored word and folds detail", async () => {
    const projection = await fixture("tool");
    const { container } = render(() => <ConversationPane projection={projection} />);
    const tool = container.querySelector(".kw-tool") as HTMLElement;
    expect(tool.textContent).toBe("bash echo served · 1.3s · done");
    expect([...tool.querySelectorAll("[data-tone='ok']")].map((span) => span.textContent)).toEqual([
      "done",
    ]);
    expect(container.querySelector(".kw-tool-detail")).toBeNull();
    fireEvent.click(tool);
    expect(container.querySelector(".kw-tool-detail")?.textContent).toBe("served");
    fireEvent.keyDown(tool, { key: "Enter" });
    expect(container.querySelector(".kw-tool-detail")).toBeNull();
  });

  it("colors a refusal with the error token and names the reason", async () => {
    const projection = await fixture("denied");
    const { container } = render(() => <ConversationPane projection={projection} />);
    const tool = container.querySelector(".kw-tool") as HTMLElement;
    expect(tool.getAttribute("data-phase")).toBe("refused");
    expect(tool.querySelector("[data-tone='bad']")?.textContent).toBe("refused");
    expect(tool.textContent).toContain("no one answered");
  });

  it("folds thinking to one line and unfolds on click", async () => {
    const projection = await fixture("thinking");
    const { container } = render(() => <ConversationPane projection={projection} />);
    const fold = container.querySelector(".kw-thinking") as HTMLButtonElement;
    expect(fold.textContent).toBe("thinking · 7 words");
    expect(container.querySelector(".kw-thinking-text")).toBeNull();
    fireEvent.click(fold);
    expect(container.querySelector(".kw-thinking-text")?.textContent).toBe(
      "Two files changed; the second one matters.",
    );
    expect(fold.getAttribute("aria-expanded")).toBe("true");
  });

  it("carries the masthead headline from the first prompt", async () => {
    const projection = await fixture("plain");
    expect(headline(projection)).toBe("say hello");
    expect(headline(emptyProjection)).toBe("keywork");
    expect(wordCount("one")).toBe("1 word");
  });
});

describe("a delegated child on the parent's transcript", () => {
  const recorded = async (count?: number) => {
    const scenario = scenarios.find((candidate) => candidate.name === "delegated");
    return projectAll(emptyProjection, scenario?.envelopes.slice(0, count) ?? []);
  };
  const sigils = (name: string) => (name === "researcher" ? `◇ ${name}` : name);

  it("reads title, bot by sigil, time, usage and the outcome as the only colored word", async () => {
    const projection = await recorded();
    const opened: string[] = [];
    const { container } = render(() => (
      <ConversationPane
        projection={projection}
        botLabel={sigils}
        onOpenSession={(id) => opened.push(id)}
      />
    ));
    const row = container.querySelector(".kw-tool[data-child]") as HTMLElement;
    expect(row.textContent).toBe(
      'child "audit the trust rules" · ◇ researcher · 1.0s · 17 tokens · completed ·· ↵ open',
    );
    expect([...row.querySelectorAll("[data-tone='ok']")].map((span) => span.textContent)).toEqual([
      "completed",
    ]);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.click(row);
    expect(opened).toEqual(["q2", "q2"]);
    expect(container.querySelector(".kw-tool-detail")).toBeNull();
    fireEvent.click(container.querySelector(".kw-stamp-fold") as HTMLElement);
    expect(container.querySelector(".kw-tool-detail")?.textContent).toBe(
      "Two rules allow more than they say.",
    );
  });

  it("says running with the child's latest step while it works", async () => {
    const working = projectAll(await recorded(7), [
      {
        id: 50,
        ts: "2026-09-07T12:00:01.900Z",
        sessionId: "s1",
        type: "tool.output",
        payload: { chunk: "read docs/trust.md\n", callId: "d1" },
      },
    ]);
    const { container } = render(() => (
      <ConversationPane projection={working} onOpenSession={() => undefined} />
    ));
    expect(container.querySelector(".kw-tool")?.textContent).toBe(
      'child "audit the trust rules" · researcher · running · read docs/trust.md ·· ↵ open',
    );
  });

  it("names refused calls and cost as facts, and offers no open without a way to open", async () => {
    const refused = projectAll(await recorded(7), [
      {
        id: 51,
        ts: "2026-09-07T12:00:02.000Z",
        sessionId: "s1",
        type: "child.finished",
        payload: {
          callId: "d1",
          sessionId: "q1",
          outcome: "denied",
          usage: { inputTokens: 1200, outputTokens: 300 },
          costNanos: 3_100_000,
          refused: [
            { tool: "bash", callId: "c1" },
            { tool: "bash", callId: "c2" },
          ],
        },
      },
    ]);
    const { container } = render(() => <ConversationPane projection={refused} />);
    const row = container.querySelector(".kw-tool") as HTMLElement;
    expect(row.querySelector("[data-part='facts']")?.textContent).toBe(
      " · 1.5k tokens · $0.0031 · refused bash",
    );
    expect(row.querySelector("[data-tone='bad']")?.textContent).toBe("denied");
    expect(row.textContent).not.toContain("open");
    expect(row.tagName).toBe("DIV");
  });
});

describe("why memory recalled a note", () => {
  it("reads the decision on the call it rode, dim, and says nothing where nothing was recalled", () => {
    const projection = projectAll(emptyProjection, parseJsonl(decided));
    const { container } = render(() => <ConversationPane projection={projection} />);
    const [recalled, dropped] = [...container.querySelectorAll(".kw-tool")];
    const fact = recalled?.querySelector("[data-part='recall']");
    expect(fact?.textContent).toBe(
      ' · recalled [[Layout Rects]] · shares "layout", "rects" with the path',
    );
    expect(fact?.getAttribute("data-tone")).toBe("meta");
    expect(dropped?.querySelector("[data-part='recall']")).toBeNull();
  });

  it("hides the recall fact under 560px with the waited and duration facts", () => {
    const css = readFileSync(join(process.cwd(), "packages/ui/src/page/page.css"), "utf8");
    const narrow = css.slice(css.indexOf("@container pane (max-width: 559.98px)"));
    expect(narrow).toMatch(
      /\.kw-tool-span\[data-part="facts"\],\s*\.kw-tool-span\[data-part="recall"\] \{\s*display: none;/,
    );
  });
});

describe("width tiers", () => {
  it("translates keywork's column thresholds at 8px per column", () => {
    expect(tierMinPx).toEqual({ broadsheet: 800, column: 560, clipping: 320 });
    expect(tierOf(1200)).toBe("broadsheet");
    expect(tierOf(800)).toBe("broadsheet");
    expect(tierOf(799)).toBe("column");
    expect(tierOf(560)).toBe("column");
    expect(tierOf(400)).toBe("clipping");
    expect(tierOf(319)).toBe("masthead");
  });

  it("uses the same numbers in the stylesheet's container queries", async () => {
    const css = readFileSync(join(process.cwd(), "packages/ui/src/page/page.css"), "utf8");
    expect(css).toContain("(min-width: 800px)");
    expect(css).toContain("(max-width: 559.98px)");
    expect(css).toContain("(max-width: 319.98px)");
  });
});
