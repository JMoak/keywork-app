import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import { fireEvent, render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
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
  it.each(["plain", "thinking", "tool", "denied", "interrupt", "queued"])(
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
    expect(tool.textContent).toContain("no one to ask");
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
