import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emptyProjection, projectAll, type SessionProjection } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import decided from "../../../client/src/fixtures/decided.jsonl?raw";
import { parseJsonl } from "../dev/replay.ts";
import { scenarios } from "../dev/scenarios.ts";
import {
  ConversationPane,
  callsQueuedBehind,
  endingLine,
  failureNextStep,
  headline,
  latestLine,
  moreLinesLine,
  promptFold,
  wordCount,
  workingLine,
} from "./pane.tsx";
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

  it("unfolds a long output to its head and then, on request, to every line", () => {
    const at = "2026-11-12T12:00:00.000Z";
    const call = { type: "tool-call", callId: "c1", name: "bash", arguments: { command: "cat" } };
    const output = Array.from({ length: 20 }, (_, line) => `line ${line + 1}`).join("\n");
    const projection = projectAll(emptyProjection, [
      { id: 1, ts: at, sessionId: "s1", type: "tool.started", payload: { call } },
      {
        id: 2,
        ts: at,
        sessionId: "s1",
        type: "tool.finished",
        payload: { callId: "c1", output, isError: false },
      },
    ] as BusEnvelope[]);
    const { container } = render(() => <ConversationPane projection={projection} />);
    fireEvent.keyDown(container.querySelector(".kw-tool") as HTMLElement, { key: "Enter" });
    const detail = () => container.querySelector(".kw-tool-detail")?.textContent ?? "";
    expect(detail().split("\n")).toHaveLength(12);
    const more = container.querySelector(".kw-tool-more") as HTMLButtonElement;
    expect(more.textContent).toBe(moreLinesLine(8));
    expect(more.hasAttribute("data-walk")).toBe(true);
    fireEvent.click(more);
    expect(detail().split("\n")).toHaveLength(20);
    expect(detail().endsWith("line 20")).toBe(true);
    expect(container.querySelector(".kw-tool-more")).toBeNull();
  });

  it("counts the calls of a turn that wait behind the one asking", () => {
    const at = "2026-11-12T12:00:00.000Z";
    const write = (callId: string, path: string) => ({
      type: "tool-call" as const,
      callId,
      name: "write",
      arguments: { path, content: "x" },
    });
    const delta = (id: number, callId: string, path: string): BusEnvelope => ({
      id,
      ts: at,
      sessionId: "s1",
      type: "turn.delta",
      payload: { delta: { type: "tool-call", call: write(callId, path) } },
    });
    const entries = projectAll(emptyProjection, [
      { id: 1, ts: at, sessionId: "s1", type: "turn.started", payload: { userText: "parallel" } },
      delta(2, "a", "a.txt"),
      delta(3, "b", "b.txt"),
      delta(4, "c", "c.txt"),
      {
        id: 5,
        ts: at,
        sessionId: "s1",
        type: "gate.ask",
        payload: {
          ask: {
            tool: "write",
            callId: "a",
            arguments: write("a", "a.txt").arguments,
            rule: "default",
          },
        },
      },
    ]).entries;
    expect(callsQueuedBehind(entries, 1)).toBe(2);
    expect(callsQueuedBehind(entries, 2)).toBe(0);
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

  it("carries the masthead headline from the first prompt, and the product name before one", async () => {
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

describe("following the tail", () => {
  const at = "2026-11-12T12:00:00.000Z";
  const told = (id: number, type: BusEnvelope["type"], payload: unknown): BusEnvelope =>
    ({ id, ts: at, sessionId: "s1", type, payload }) as BusEnvelope;
  const asked = projectAll(emptyProjection, [
    told(1, "turn.started", { userText: "first" }),
    told(2, "turn.delta", { delta: { type: "text", text: "a long answer" } }),
  ]);

  function scrolledUp(container: HTMLElement): { top(): number } {
    const pane = container.querySelector(".kw-pane") as HTMLElement;
    let top = 100;
    Object.defineProperty(pane, "scrollHeight", { configurable: true, get: () => 1000 });
    Object.defineProperty(pane, "clientHeight", { configurable: true, get: () => 200 });
    Object.defineProperty(pane, "scrollTop", {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.min(value, 800);
      },
    });
    fireEvent.scroll(pane);
    return { top: () => top };
  }

  it("stays where the reader scrolled while the reply streams or the pane is touched, and follows a new prompt", () => {
    const [projection, setProjection] = createSignal(asked);
    const { container } = render(() => <ConversationPane projection={projection()} />);
    const reader = scrolledUp(container);
    setProjection(
      projectAll(projection(), [
        told(3, "turn.delta", { delta: { type: "text", text: " grows" } }),
      ]),
    );
    setProjection({ ...projection() });
    expect(reader.top()).toBe(100);
    setProjection(
      projectAll(projection(), [
        told(4, "turn.completed", {
          message: { role: "assistant", parts: [] },
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
        told(5, "turn.started", { userText: "second" }),
      ]),
    );
    expect(reader.top()).toBe(800);
  });

  it("offers the latest while the reader is away from it, and the offer follows again", () => {
    const { container } = render(() => (
      <ConversationPane projection={asked} latestChord="ctrl+k end" />
    ));
    expect(container.querySelector(".kw-latest")).toBeNull();
    const reader = scrolledUp(container);
    const latest = container.querySelector(".kw-latest") as HTMLButtonElement;
    expect(latest.textContent).toBe(latestLine("ctrl+k end"));
    fireEvent.click(latest);
    expect(reader.top()).toBe(800);
    fireEvent.scroll(container.querySelector(".kw-pane") as HTMLElement);
    expect(container.querySelector(".kw-latest")).toBeNull();
  });
});

describe("a turn's signs of life", () => {
  const at = "2026-11-12T12:00:00.000Z";
  const started = projectAll(emptyProjection, [
    { id: 1, ts: at, sessionId: "s1", type: "turn.started", payload: { userText: "wait 20" } },
  ]);

  it("shows the model working from the prompt until its first words", () => {
    const [projection, setProjection] = createSignal(started);
    const { container } = render(() => <ConversationPane projection={projection()} />);
    const working = container.querySelector(".kw-working");
    expect(working?.textContent).toBe(workingLine);
    expect(
      working?.closest(".kw-entry")?.querySelector(".kw-stamp[data-streaming]"),
    ).not.toBeNull();
    setProjection(
      projectAll(started, [
        {
          id: 2,
          ts: at,
          sessionId: "s1",
          type: "turn.delta",
          payload: { delta: { type: "text", text: "here" } },
        },
      ]),
    );
    expect(container.querySelector(".kw-working")).toBeNull();
  });
});

describe("how a turn ended", () => {
  const at = "2026-11-12T12:00:00.000Z";
  const failed = projectAll(emptyProjection, [
    { id: 1, ts: at, sessionId: "s1", type: "turn.started", payload: { userText: "failnow" } },
    {
      id: 2,
      ts: at,
      sessionId: "s1",
      type: "engine.error",
      payload: { error: { name: "Error", message: "upstream 529 overloaded" } },
    },
  ]);

  it("says a failure with its next step and tries the prompt again on enter or a click", () => {
    const resent: string[] = [];
    const { container } = render(() => (
      <ConversationPane projection={failed} onResend={(prompt) => resent.push(prompt)} />
    ));
    const ending = container.querySelector(".kw-ending") as HTMLElement;
    expect(ending.textContent).toBe(
      "failed · upstream 529 overloaded · the provider is busy · give it a moment · enter tries again",
    );
    expect(ending.hasAttribute("data-walk")).toBe(true);
    expect(ending.getAttribute("data-level")).toBe("error");
    fireEvent.keyDown(ending, { key: "Enter" });
    fireEvent.click(ending);
    expect(resent).toEqual(["failnow", "failnow"]);
  });

  it("marks a stop the server made apart from one the keeper made", () => {
    expect(
      endingLine({ outcome: "shutdown", text: "the server stopped while this turn ran" }),
    ).toBe("· the server stopped while this turn ran");
    expect(endingLine({ outcome: "interrupted", text: "interrupted" })).toBe("· interrupted");
    expect(failureNextStep("ECONNREFUSED 127.0.0.1:443")).toBe("the provider could not be reached");
    expect(failureNextStep("a listener threw")).toBeUndefined();
  });

  it("draws the ending as plain text where nothing can resend it", () => {
    const { container } = render(() => <ConversationPane projection={failed} />);
    expect(container.querySelector(".kw-ending")).toBeNull();
    expect(container.querySelector("[data-ending='failed']")?.textContent).toBe(
      "failed · upstream 529 overloaded · the provider is busy · give it a moment",
    );
  });
});

describe("a long pasted prompt", () => {
  const pasted = Array.from({ length: 5000 }, (_, line) => `line ${line}`).join("\n");

  it("draws its head and a fold that shows the whole of it on request", () => {
    const projection = projectAll(emptyProjection, [
      {
        id: 1,
        ts: "2026-11-12T12:00:00.000Z",
        sessionId: "s1",
        type: "turn.started",
        payload: { userText: pasted },
      },
    ]);
    const { container } = render(() => <ConversationPane projection={projection} />);
    const prompt = () => container.querySelector(".kw-user")?.textContent ?? "";
    expect(prompt().length).toBeLessThan(200);
    const fold = container.querySelector(".kw-prompt-fold") as HTMLButtonElement;
    expect(fold.textContent).toBe("4988 more lines · show all");
    fireEvent.click(fold);
    expect(prompt()).toBe(pasted);
    expect(fold.textContent).toBe("show less");
  });

  it("leaves a short prompt whole, and folds one long line by its characters", () => {
    expect(promptFold("say hello")).toBeUndefined();
    expect(promptFold("x".repeat(2500))?.rest).toBe("500 more characters");
  });
});

describe("a narrow pane", () => {
  it("keeps a pending ask showing in the masthead tier while the rest of the transcript folds away", () => {
    const css = readFileSync(join(process.cwd(), "packages/ui/src/page/page.css"), "utf8");
    const masthead = css.slice(css.indexOf("@container pane (max-width: 319.98px)"));
    expect(masthead).toMatch(/\.kw-entry:not\(\[data-asking\]\)/);
    expect(masthead.slice(0, masthead.indexOf("}\n}"))).not.toContain(".kw-transcript");
  });

  it("marks the row holding a pending ask", () => {
    const projection = projectAll(emptyProjection, [
      {
        id: 1,
        ts: "2026-11-12T12:00:00.000Z",
        sessionId: "s1",
        type: "gate.ask",
        payload: {
          ask: {
            tool: "write",
            callId: "w1",
            arguments: { path: "a.md" },
            rule: "default",
            rules: [],
          },
        },
      },
    ]);
    const { container } = render(() => (
      <ConversationPane projection={projection} onAnswerAsk={() => undefined} />
    ));
    expect(container.querySelector(".kw-entry[data-asking] .kw-ask")).not.toBeNull();
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
