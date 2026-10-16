import { emptyProjection, type SessionProjection } from "@keywork-app/client";
import type { CompactReading, ContextReport, SessionSummary } from "@keywork-app/protocol";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import recordedAnswers from "../../../../client/src/fixtures/controls.json";
import { browserHost } from "../../host/browser.ts";
import { compactingNotice } from "../conversation/controls.ts";
import type { ShellSeams } from "../registry.ts";
import {
  type ContextSpec,
  contextHints,
  contextPane,
  flushNotice,
  noSessionNotice,
  unreadLine,
} from "./index.tsx";

const recordedReport = recordedAnswers.context.body as ContextReport;

afterEach(cleanup);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

interface Fakes {
  readings?: Record<string, ContextReport>;
  compact?: CompactReading;
  projection?: SessionProjection;
}

interface Recorded {
  watched: string[];
  compacted: string[];
  rebound: ContextSpec[];
  closed: string[];
}

function harness(fakes: Fakes = {}) {
  const recordedCalls: Recorded = { watched: [], compacted: [], rebound: [], closed: [] };
  const [focusedSession, setFocusedSession] = createSignal<string>();
  const readings = fakes.readings ?? { s1: pageGrammar() };
  const summary = (id: string | undefined): SessionSummary | undefined =>
    id === undefined
      ? undefined
      : { id, title: `session ${id}`, createdAt: "t", lastActivityAt: "t", messageCount: 2 };
  const store = {
    summary,
    projection: () => fakes.projection ?? emptyProjection,
    controls: {
      readings: (id: string | undefined) => ({
        context: id === undefined ? undefined : readings[id],
        cost: undefined,
      }),
      watchReadings: async (id: string) => {
        recordedCalls.watched.push(id);
      },
      compact: async (id: string) => {
        recordedCalls.compacted.push(id);
        return fakes.compact ?? { compacted: null, notices: [] };
      },
    },
  };
  const shell: Partial<ShellSeams> = {
    store: store as unknown as ShellSeams["store"],
    keys: { chord: (action) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: focusedSession,
    rebind: (_paneId, spec) => {
      recordedCalls.rebound.push(spec as ContextSpec);
    },
    closePane: (paneId) => {
      recordedCalls.closed.push(paneId);
    },
  };
  return { shell: shell as ShellSeams, recorded: recordedCalls, setFocusedSession };
}

function mount(shell: ShellSeams, initial: ContextSpec = { kind: "context", sessionId: "s1" }) {
  const [spec, setSpec] = createSignal(initial);
  let handle: (action: string) => void = () => {};
  const { container } = render(() => (
    <contextPane.component
      id="context-1"
      spec={spec()}
      focused={true}
      shell={shell}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return { container, setSpec, act: (action: string) => handle(action) };
}

function pageGrammar(overrides: Partial<ContextReport> = {}): ContextReport {
  return {
    ...recordedReport,
    used: 116_300,
    declared: true,
    parts: {
      system: { tokens: 2_900, basis: "estimated" },
      tools: { tokens: 6_100, basis: "estimated" },
      injected: { tokens: 2_400, basis: "estimated" },
      conversation: { tokens: 116_300, basis: "reported" },
      free: { tokens: 72_300, basis: "reported" },
    },
    thresholds: { flushAt: 186_824, compactAt: 195_016 },
    ...overrides,
  };
}

const text = (container: HTMLElement, selector: string): string[] =>
  [...container.querySelectorAll(selector)].map((node) => node.textContent ?? "");

const inks = (container: HTMLElement): string[] =>
  [...container.querySelectorAll(".kw-context-map-grid .kw-context-map-ink")].map(
    (ink) => (ink as HTMLElement).dataset.cell ?? "",
  );

describe("the context pane", () => {
  it("maps the session's reading: head, one square per percent, legend, basis and keys", () => {
    const { shell } = harness();
    const { container } = mount(shell);
    expect(text(container, ".kw-ov-head-lead")).toEqual(["session s1"]);
    expect(text(container, ".kw-context-map-total")).toEqual(["128k of 200k · 64%"]);
    const cells = inks(container);
    expect(cells).toHaveLength(100);
    expect(cells.filter((cell) => cell === "conversation")).toHaveLength(58);
    expect(cells.filter((cell) => cell === "flush")).toHaveLength(4);
    expect(cells.filter((cell) => cell === "compaction")).toHaveLength(2);
    expect(text(container, ".kw-context-map-row .kw-context-map-label")).toEqual([
      "system prompt",
      "tool schemas",
      "memory and skills",
      "conversation",
      "free",
      "memory flush",
      "compaction",
    ]);
    expect(text(container, ".kw-context-map-basis")).toEqual([
      "conversation from the usage the provider reported at the last turn · the rest estimated from the text keywork sends · window declared in keywork.json",
    ]);
    expect(container.querySelector(".kw-context-map-finding")).toBeNull();
    expect(text(container, ".kw-ov-line")).toEqual([contextHints]);
    const grid = container.querySelector(".kw-context-map-grid") as HTMLElement;
    expect(grid.getAttribute("aria-label")).toMatch(/^context 128k of 200k · 64% · system prompt/);
    expect(grid.style.getPropertyValue("--kw-map-columns")).toBe("10");
  });

  it("scales a 1M window to twenty squares a row, one per half percent", () => {
    const { shell } = harness({ readings: { s1: pageGrammar({ window: 1_000_000 }) } });
    const { container } = mount(shell);
    expect(inks(container)).toHaveLength(200);
    const grid = container.querySelector(".kw-context-map-grid") as HTMLElement;
    expect(grid.style.getPropertyValue("--kw-map-columns")).toBe("20");
  });

  it("says in one dim line when the server's lines fall past the window", () => {
    const past = pageGrammar({ thresholds: { flushAt: 226_724, compactAt: 234_916 } });
    const { shell } = harness({ readings: { s1: past } });
    const { container } = mount(shell);
    expect(text(container, ".kw-context-map-finding")).toEqual([
      "memory flush at 227k, compaction at 235k · past the window · keywork measures the conversation only",
    ]);
    expect(inks(container).includes("compaction")).toBe(false);
  });

  it("watches the session's readings, and the new session's when it is rebound", async () => {
    const { shell, recorded } = harness({ readings: { s1: pageGrammar(), s2: recordedReport } });
    const { container, setSpec } = mount(shell);
    expect(recorded.watched).toEqual(["s1"]);
    setSpec({ kind: "context", sessionId: "s2" });
    await settle();
    expect(recorded.watched).toEqual(["s1", "s2"]);
    expect(text(container, ".kw-context-map-total")).toEqual(["1.9k of 200k · 1%"]);
  });

  it("names the next step with no session and waits honestly for a first reading", () => {
    const { shell } = harness({ readings: {} });
    const empty = mount(shell, { kind: "context" });
    expect(text(empty.container, ".kw-empty")).toEqual([
      "no session to map · focus a session, or ctrl+k tree.summon picks one",
    ]);
    cleanup();
    const unread = mount(shell);
    expect(text(unread.container, ".kw-empty")).toEqual([unreadLine]);
  });
});

describe("the context pane's keys", () => {
  it("compacts with c through the controls, in the conversation's words, then rereads", async () => {
    const { shell, recorded } = harness({
      compact: {
        compacted: {
          id: "e9",
          parentId: "e8",
          timestamp: "t",
          type: "compaction",
          summary: "folded",
          tokensBefore: 116_300,
          firstKeptEntryId: "e7",
        },
        notices: [],
      },
    });
    const { container, act } = mount(shell);
    act("context.compact");
    expect(text(container, ".kw-ov-line")).toEqual([compactingNotice, contextHints]);
    await settle();
    expect(recorded.compacted).toEqual(["s1"]);
    expect(text(container, ".kw-ov-line")[0]).toBe("folded 116300 tokens into a summary");
    expect(recorded.watched).toEqual(["s1", "s1"]);
  });

  it("shows the server's refusal and rereads nothing", async () => {
    const { shell, recorded } = harness({
      compact: { refused: "busy", detail: "a turn is running · compact once it settles" },
    });
    const { container, act } = mount(shell);
    act("context.compact");
    await settle();
    expect(text(container, ".kw-ov-line")[0]).toBe("a turn is running · compact once it settles");
    expect(recorded.watched).toEqual(["s1"]);
  });

  it("asks for a session before compacting", () => {
    const { shell, recorded } = harness({ readings: {} });
    const { container, act } = mount(shell, { kind: "context" });
    act("context.compact");
    expect(recorded.compacted).toEqual([]);
    expect(text(container, ".kw-ov-line")[0]).toBe(noSessionNotice);
  });

  it("says with f where memory flushes, since keywork has no route to flush on demand", () => {
    const { shell } = harness();
    const { container, act } = mount(shell);
    act("context.flush");
    expect(text(container, ".kw-ov-line")[0]).toBe(
      "memory flushes when a turn settles past 187k · keywork has no route to flush now",
    );
    expect(flushNotice(undefined)).toBe(
      "memory flushes when a turn settles past the flush line · keywork has no route to flush now",
    );
  });

  it("closes itself on escape", () => {
    const { shell, recorded } = harness();
    const { act } = mount(shell);
    act("context.close");
    expect(recorded.closed).toEqual(["context-1"]);
  });

  it("drops a notice when it follows another session", async () => {
    const { shell } = harness({ readings: { s1: pageGrammar(), s2: recordedReport } });
    const { container, act, setSpec } = mount(shell);
    act("context.flush");
    setSpec({ kind: "context", sessionId: "s2" });
    await settle();
    expect(text(container, ".kw-ov-line")).toEqual([contextHints]);
  });
});

describe("the context pane follows focus", () => {
  it("rebinds to the conversation that takes focus and holds still otherwise", () => {
    const { shell, recorded, setFocusedSession } = harness();
    mount(shell);
    setFocusedSession("s1");
    setFocusedSession(undefined);
    expect(recorded.rebound).toEqual([]);
    setFocusedSession("s2");
    expect(recorded.rebound).toEqual([{ kind: "context", sessionId: "s2" }]);
  });

  it("summons for the focused conversation's session", async () => {
    const { shell, setFocusedSession } = harness();
    setFocusedSession("s4");
    expect(await contextPane.summon?.spec(shell)).toEqual({ kind: "context", sessionId: "s4" });
    expect(contextPane.summon?.chords).toBe("leader shift+g");
    expect(contextPane.summon?.command.name).toBe("context");
    expect(contextPane.home).toBe("right");
    expect(contextPane.attire).toBe("work");
  });
});

describe("the context pane's title row", () => {
  it("wears the session's gauge from the reading, parts and all", () => {
    const { shell } = harness();
    const level = contextPane.adornments?.({ kind: "context", sessionId: "s1" }, shell).context;
    expect(level).toMatchObject({ used: 116_300, basis: "reported", declared: true });
    expect(level?.parts?.conversation).toEqual({ tokens: 116_300, basis: "reported" });
  });

  it("falls back to the live usage before the first reading arrives", () => {
    const projection: SessionProjection = {
      ...emptyProjection,
      usage: { ...emptyProjection.usage, turns: 1, lastTurnContextTokens: 42_000 },
    };
    const { shell } = harness({ readings: {}, projection });
    const level = contextPane.adornments?.({ kind: "context", sessionId: "s1" }, shell).context;
    expect(level).toMatchObject({ used: 42_000, basis: "assumed" });
  });
});
