import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  emptyProjection,
  type KeyworkClient,
  project,
  projectAll,
  type SessionProjection,
} from "@keywork-app/client";
import type {
  BusEnvelope,
  LedgerEntry,
  MemoryDecision,
  MemoryGarden,
  MemoryNoteDetail,
  MemoryNotes,
  StagedItem,
} from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { type Accessor, createRoot, createSignal } from "solid-js";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import decidedFixture from "../../../../client/src/fixtures/decided.jsonl?raw";
import gardenFixture from "../../../../client/src/fixtures/memory-garden.json";
import { parseJsonl } from "../../dev/replay.ts";
import { browserHost } from "../../host/browser.ts";
import {
  feedOf,
  inboxEnvelope,
  inertMemoryClient,
  stagedNote,
} from "../../shell/memory-store.test.ts";
import { createMemoryStore, inertGarden, type MemoryStore } from "../../shell/memory-store.ts";
import type { Reveal } from "../../shell/needs-you-jumps.ts";
import { inboxItem } from "../../shell/needs-you-testing.ts";
import { holdTypingFocus } from "../overview/rows.test.tsx";
import { noWorkingSession } from "../overview/working-session.ts";
import type { ShellSeams } from "../registry.ts";
import { noDecisionsLine } from "./decisions.ts";
import { inertLine, lifecycleOf, memoryPane, titleOf } from "./index.tsx";

const fixture = gardenFixture as MemoryGarden;

function note(name: string, body: string): MemoryNoteDetail {
  return {
    name,
    path: `${name}.md`,
    title: name,
    provenance: "user",
    pinned: true,
    aliases: [],
    body,
    links: [],
    tokens: 12,
    frontmatter: {},
    layer: "workspace",
    file: `C:/vault/${name}.md`,
    curing: 3,
    injected: true,
    recalls: 2,
    relations: [{ name: "Composer Enter", predicate: "relates to", direction: "out" }],
  };
}

const notes = [
  note("Layout Rects", "Rects are the **single** geometric truth."),
  note("Composer Enter", "Enter queues."),
];

interface Harness {
  store: MemoryStore;
  feed: ReturnType<typeof feedOf>;
  calls: string[];
  garden: () => MemoryGarden;
  setGarden: (next: MemoryGarden) => void;
}

function harness(initial: MemoryGarden): Harness {
  let garden = initial;
  const calls: string[] = [];
  const feed = feedOf();
  const client = {
    ...inertMemoryClient(),
    memory: async () => garden,
    memoryNotes: async (): Promise<MemoryNotes> => ({
      trusted: garden.trusted,
      notes: garden.trusted && garden.layers.length > 0 ? notes : [],
    }),
    memoryNote: async (name: string) => notes.find((item) => item.name === name),
    memoryDailyDates: async () => ({ trusted: true, dates: ["2026-09-07"] }),
    memoryDaily: async (date: string) => ({
      trusted: true,
      date,
      entries: [{ time: "12:00", provenance: "agent" as const, text: "Recorded the fixture." }],
    }),
    approveStagedItem: async (id: string) => {
      calls.push(`approve ${id}`);
      return { kind: "approved" as const, result: null };
    },
    discardStagedItem: async (id: string) => {
      calls.push(`discard ${id}`);
      return "discarded" as const;
    },
    revertLedgerEntry: async (id: string) => {
      calls.push(`revert ${id}`);
      return { kind: "needs-rebase" as const };
    },
    askMemory: async ({ query }: { query: string }) => {
      calls.push(`ask ${query}`);
      return {
        trusted: true,
        hits: [
          { note: "Layout Rects", layer: "workspace", ranks: { lexical: 1 }, superseded: false },
        ],
        source: "lexical" as const,
      };
    },
  } as KeyworkClient;
  const store = createRoot(() => createMemoryStore(client, feed));
  return {
    store,
    feed,
    calls,
    garden: () => garden,
    setGarden: (next) => {
      garden = next;
    },
  };
}

interface FocusedSession {
  id: string;
  projection: Accessor<SessionProjection>;
}

function seams(
  store: MemoryStore,
  revealing: () => Reveal | undefined,
  session?: FocusedSession,
): ShellSeams {
  return {
    store: {
      memory: store,
      projection: (id: string | undefined) =>
        id !== undefined && id === session?.id ? session.projection() : emptyProjection,
      summary: () => undefined,
    } as unknown as ShellSeams["store"],
    needsYou: { revealing } as unknown as ShellSeams["needsYou"],
    keys: { chord: (action: string) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: () => session?.id,
    rebind: () => {},
    unseen: () => false,
  } as unknown as ShellSeams;
}

function mount(
  store: MemoryStore,
  revealing: () => Reveal | undefined = () => undefined,
  session?: FocusedSession,
): (action: string) => void {
  let handle: (action: string) => void = () => {};
  render(() => (
    <memoryPane.component
      id="p1"
      spec={{ kind: "memory" }}
      focused={true}
      shell={seams(store, revealing, session)}
      onAction={(handler) => {
        handle = handler;
      }}
    />
  ));
  return (action: string) => handle(action);
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(cleanup);

describe("the memory pane definition", () => {
  it("summons on the leader, lives in the right dock, and goes needs-you at three waiting items", () => {
    expect(memoryPane.summon?.chords).toBe("leader shift+m");
    expect(memoryPane.home).toBe("right");
    expect(titleOf(0)).toBe("memory");
    expect(titleOf(2)).toBe("memory · 2 waiting");
    expect(lifecycleOf(2)).toBe("idle");
    expect(lifecycleOf(3)).toBe("needs-you");
    expect(inertLine({ chord: () => "ctrl+k shift+t", leader: () => "ctrl+k" })).toContain(
      "keywork trust",
    );
  });
});

describe("the garden lens", () => {
  it("renders the recorded garden: layers with their ramp, notes, the inbox by kind, the gardener", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-10T12:00:00Z") });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { store } = harness(fixture);
    mount(store);
    await settle();
    const text = document.body.textContent ?? "";
    expect(text).toContain("2 notes");
    expect(screen.getByLabelText("curing · 2 settled")).toBeTruthy();
    expect(screen.getByLabelText("prompt 0 of 4096 tokens")).toBeTruthy();
    expect(text).toContain("inbox · staged");
    expect(document.querySelectorAll('[data-kind="inbox"]')).toHaveLength(2);
    expect(text).toContain("gardener idle");
    expect(text).toContain("Layout Rects");
    expect(text).toContain("2026-09-07");
    expect(document.querySelector(".kw-memory")?.outerHTML).toMatchSnapshot();
  });

  it("approves and discards the focused inbox item through the client and refreshes on the event", async () => {
    const { store, feed, calls, garden, setGarden } = harness(fixture);
    const act = mount(store);
    await settle();
    act("memory.inbox");
    const first = garden().inbox[0];
    act("memory.approve");
    await settle();
    expect(calls).toEqual([`approve ${first?.id}`]);
    expect(document.querySelector(".kw-memory")?.textContent).toContain("approved");
    setGarden({ ...garden(), inbox: garden().inbox.slice(1) });
    feed.push([inboxEnvelope(9, 1)]);
    await settle();
    expect(store.state.inbox.count).toBe(1);
    expect(document.querySelectorAll('[data-kind="inbox"]')).toHaveLength(1);
    act("memory.inbox");
    act("memory.discard");
    await settle();
    expect(calls.at(-1)).toBe(`discard ${garden().inbox[0]?.id}`);
    expect(document.querySelector(".kw-memory")?.textContent).toContain("discarded");
    expect(document.querySelector(".kw-memory")?.textContent).not.toContain("that item is gone");
  });

  it("asks the garden inline and lists the hits as note rows", async () => {
    const { store, calls } = harness(fixture);
    const act = mount(store);
    await settle();
    act("memory.ask");
    const input = screen.getByLabelText("ask the garden") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "rects" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await settle();
    expect(calls).toEqual(["ask rects"]);
    expect(screen.getByText("ask · 1 hits")).toBeTruthy();
    expect(document.querySelector('[data-kind="hit"] .kw-memory-title')?.textContent).toBe(
      "Layout Rects",
    );
    act("memory.back");
    expect(screen.queryByLabelText("ask the garden")).toBeNull();
  });
});

describe("a needs-you jump into the garden", () => {
  it("leaves the lens it was in and puts the cursor on the inbox item it names", async () => {
    const { store } = harness(fixture);
    const [revealing, reveal] = createSignal<Reveal>();
    const act = mount(store, revealing);
    await settle();
    act("memory.ledger");
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("ledger");
    reveal({ item: inboxItem("q2"), pane: "elsewhere", seq: 1 });
    await settle();
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("ledger");
    reveal({ item: inboxItem("q2"), pane: "p1", seq: 2 });
    await settle();
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("garden");
    expect(document.querySelector("[data-cursor]")?.getAttribute("data-row")).toBe("inbox:q2");
  });
});

describe("the note lens", () => {
  it("opens the focused note with its facts, prose body and relations, and backs out", async () => {
    const { store } = harness(fixture);
    const act = mount(store);
    await settle();
    act("memory.next");
    act("memory.open");
    await settle();
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("note");
    expect(screen.getByText("single").tagName).toBe("STRONG");
    expect(screen.getByText("pinned")).toBeTruthy();
    expect(screen.getByText("→ relates to Composer Enter")).toBeTruthy();
    expect(document.querySelector(".kw-memory-note")?.outerHTML).toMatchSnapshot();
    act("memory.back");
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("garden");
  });
});

describe("the ledger lens", () => {
  it("lists entries newest first and reports a needs-rebase revert honestly", async () => {
    const { store, calls } = harness(fixture);
    const act = mount(store);
    await settle();
    act("memory.ledger");
    const rows = [...document.querySelectorAll('[data-kind="ledger"] .kw-memory-title')].map(
      (row) => row.textContent,
    );
    expect(rows).toEqual(["revert Stray Claim", "discard .staging/q5.md", "approve Stray Claim"]);
    act("memory.revert");
    await settle();
    expect(calls).toEqual([`revert ${(fixture.ledger.at(-1) as LedgerEntry).id}`]);
    expect(screen.getAllByText(/needs rebase/)).not.toHaveLength(0);
    expect(document.querySelector(".kw-memory")?.outerHTML).toMatchSnapshot();
  });
});

describe("the decisions lens", () => {
  const recorded = projectAll(emptyProjection, parseJsonl(decidedFixture));
  const titles = (): (string | null)[] =>
    [...document.querySelectorAll('[data-kind="decision"] .kw-memory-title')].map(
      (row) => row.textContent,
    );
  const jevRecall: MemoryDecision = {
    id: "j1",
    question: "action-relevance@1",
    about: { kind: "call", callId: "r1" },
    candidates: ["Layout Rects"],
    choice: { kept: ["Layout Rects"], dropped: [] },
    scores: { "Layout Rects": 0.97 },
    decider: "jev",
    latencyMs: 180,
  };
  const decidedLive: BusEnvelope = {
    id: 99,
    ts: "2026-09-07T12:00:09.000Z",
    sessionId: "s1",
    type: "memory.decided",
    payload: { decision: jevRecall },
  };

  it("lists the working session's decisions newest first and folds one open to its candidates and rule", async () => {
    const { store } = harness(fixture);
    const act = mount(store, undefined, { id: "s1", projection: () => recorded });
    await settle();
    act("memory.decisions");
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("decisions");
    expect(screen.getByText("decisions · write the layout rects module")).toBeTruthy();
    expect(titles()).toEqual([
      "recall before write src/layout/rects.test.ts",
      "recall before write src/layout/rects.ts",
    ]);
    expect(document.querySelector("[data-cursor]")?.textContent).toContain("kept 0 of 1");
    act("memory.next");
    act("memory.open");
    const unfolded = document.querySelector('[data-kind="decision"][data-cursor]');
    expect(unfolded?.querySelector("button")?.getAttribute("aria-expanded")).toBe("true");
    expect(unfolded?.querySelector('[data-verdict="kept"]')?.textContent).toBe(
      "kept[[Layout Rects]]",
    );
    expect(unfolded?.querySelector(".kw-memory-rule")?.textContent).toBe(
      '[[Layout Rects]] shares "layout", "rects" with the path',
    );
    expect(document.querySelector(".kw-memory")?.outerHTML).toMatchSnapshot();
    act("memory.open");
    expect(document.querySelector(".kw-memory-fold")).toBeNull();
    act("memory.back");
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("garden");
  });

  it("takes a decision live as the session's projection receives it", async () => {
    const { store } = harness(fixture);
    const [projection, setProjection] = createSignal(recorded);
    const act = mount(store, undefined, { id: "s1", projection });
    await settle();
    act("memory.decisions");
    setProjection(project(recorded, decidedLive));
    expect(titles()[0]).toBe("recall before write src/layout/rects.ts");
    expect(document.querySelector('[data-row="j1"]')?.textContent).toContain("jev 0.97");
    expect(document.querySelector('[data-row="j1"] .kw-memory-mark')?.getAttribute("title")).toBe(
      "odds 0.97",
    );
  });

  it("teaches what it will show before any decision, and asks for a session when it has none", async () => {
    const { store } = harness(fixture);
    const act = mount(store, undefined, { id: "s1", projection: () => emptyProjection });
    await settle();
    act("memory.decisions");
    expect(screen.getByText(noDecisionsLine)).toBeTruthy();
    cleanup();
    const unbound = mount(harness(fixture).store);
    await settle();
    unbound("memory.decisions");
    expect(screen.getByText(noWorkingSession)).toBeTruthy();
  });
});

describe("odds on an inbox card", () => {
  const promotion: StagedItem = {
    id: "p1",
    key: "k",
    created: "2026-10-15T12:00:00.000Z",
    kind: "borderline-promotion",
    title: "Auth Tokens Rotate",
    body: "Tokens rotate hourly.",
    confidence: 0.7,
    source: "2026-10-15#3",
  };
  const triage = (decision: Partial<MemoryDecision>): BusEnvelope => ({
    id: 70,
    ts: "2026-10-15T12:00:01.000Z",
    sessionId: "",
    type: "memory.decided",
    payload: {
      decision: {
        id: "t1",
        question: "entry-durability@1",
        about: { kind: "entry", entryId: "2026-10-15#3" },
        candidates: ["2026-10-15#3"],
        choice: "new-durable",
        confidence: 0.93,
        decider: "jev",
        latencyMs: 90,
        ...decision,
      },
    },
  });
  const oddsFact = () => document.querySelector('[data-kind="inbox"] [data-fact="odds"]');

  it("shows the entry's durability and odds on the promotion it became", async () => {
    const { store, feed } = harness({ ...fixture, inbox: [promotion] });
    mount(store);
    await settle();
    feed.push([triage({})]);
    expect(oddsFact()?.textContent).toBe("new durable · jev 0.93");
  });

  it("shows nothing for the builtin, whose every triage is unsure", async () => {
    const { store, feed } = harness({ ...fixture, inbox: [promotion] });
    mount(store);
    await settle();
    feed.push([triage({ choice: "unsure", decider: "builtin" })]);
    expect(document.querySelector('[data-kind="inbox"]')).toBeTruthy();
    expect(oddsFact()).toBeNull();
  });
});

describe("the daily lens", () => {
  it("opens a day's entries from the dates row", async () => {
    const { store } = harness(fixture);
    const act = mount(store);
    await settle();
    const date = document.querySelector('[data-kind="date"] > .kw-memory-row') as HTMLElement;
    fireEvent.click(date);
    act("memory.open");
    await settle();
    expect(document.querySelector(".kw-memory")?.getAttribute("data-lens")).toBe("daily");
    expect(screen.getByText("Recorded the fixture.")).toBeTruthy();
  });
});

describe("the inert state", () => {
  it("names trusting the workspace as the next action and never shows a 403", async () => {
    const { store } = harness(inertGarden);
    mount(store);
    await settle();
    expect(screen.getByText(/memory is inert/).textContent).toContain("keywork trust");
    expect(screen.getByText(/memory is inert/).textContent).toContain("ctrl+k terminal.summon");
    expect(screen.queryByText(/403/)).toBeNull();
  });

  it("teaches one key when the garden is trusted but empty", async () => {
    const { store } = harness({ ...inertGarden, trusted: true, inbox: [] });
    mount(store);
    await settle();
    expect(screen.getByText(/nothing in the garden yet/).textContent).toContain(
      "ctrl+k pane.split",
    );
  });
});

describe("the staged helper", () => {
  it("builds a staged note the store counts", () => {
    expect(stagedNote("x", "X.md").kind).toBe("note");
  });
});

describe("the memory pane's keyboard home", () => {
  it("takes DOM focus from a typing field when it is focused", async () => {
    const typing = holdTypingFocus();
    const { store } = harness(fixture);
    mount(store);
    await settle();
    expect(document.querySelector(".kw-memory")?.contains(document.activeElement)).toBe(true);
    typing.remove();
  });
});

describe("the memory pane's chrome", () => {
  it("draws no focus ring of its own, since the frame already marks focus", () => {
    expect(memoryCss).toMatch(/\.kw-memory:focus \{\s*outline: none;/);
  });

  it("insets the daily lens title like the note lens title, never flush to the frame", () => {
    expect(memoryCss).toMatch(
      /\.kw-memory-daily > \.kw-memory-note-title \{\s*padding: 0\.5rem 1rem 0;/,
    );
  });
});

const memoryCss = readFileSync(
  join(process.cwd(), "packages/ui/src/panes/memory/memory.css"),
  "utf8",
);
