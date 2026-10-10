import type { KeyworkClient } from "@keywork-app/client";
import type { LedgerEntry, MemoryGarden, MemoryNote } from "@keywork-app/protocol";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import gardenFixture from "../../../../client/src/fixtures/memory-garden.json";
import { browserHost } from "../../host/browser.ts";
import {
  feedOf,
  inboxEnvelope,
  inertMemoryClient,
  stagedNote,
} from "../../shell/memory-store.test.ts";
import { createMemoryStore, inertGarden, type MemoryStore } from "../../shell/memory-store.ts";
import type { ShellSeams } from "../registry.ts";
import { inertLine, lifecycleOf, memoryPane, titleOf } from "./index.tsx";

const fixture = gardenFixture as MemoryGarden;

function note(name: string, body: string): MemoryNote {
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
    memoryNotes: async () => ({ trusted: garden.trusted, notes: garden.trusted ? notes : [] }),
    memoryNote: async (name: string) => ({
      trusted: true,
      note: notes.find((item) => item.name === name) ?? null,
    }),
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

function seams(store: MemoryStore): ShellSeams {
  return {
    store: { memory: store } as unknown as ShellSeams["store"],
    keys: { chord: (action: string) => `ctrl+k ${action}`, leader: () => "ctrl+k" },
    sessions: { openSession: () => {}, newSession: async () => {}, startSession: async () => {} },
    host: browserHost(),
    workspace: "C:/work",
    currentSession: () => undefined,
    rebind: () => {},
    unseen: () => false,
  } as unknown as ShellSeams;
}

function mount(store: MemoryStore): (action: string) => void {
  let handle: (action: string) => void = () => {};
  render(() => (
    <memoryPane.component
      id="p1"
      spec={{ kind: "memory" }}
      focused={true}
      shell={seams(store)}
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
    const { store } = harness(fixture);
    mount(store);
    await settle();
    const text = document.body.textContent ?? "";
    expect(text).toContain("2 notes");
    expect(screen.getByLabelText("curing · 1 curing · 1 settled")).toBeTruthy();
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
    setGarden({ ...garden(), inbox: garden().inbox.slice(1) });
    feed.push([inboxEnvelope(9, 1, { note: 1 })]);
    await settle();
    expect(store.state.inbox.count).toBe(1);
    expect(document.querySelectorAll('[data-kind="inbox"]')).toHaveLength(1);
    act("memory.inbox");
    act("memory.discard");
    await settle();
    expect(calls.at(-1)).toBe(`discard ${garden().inbox[0]?.id}`);
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
