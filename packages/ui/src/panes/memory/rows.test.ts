import type {
  LedgerEntry,
  MemoryDecision,
  MemoryGarden,
  MemoryNote,
  StagedItem,
} from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { inertGarden } from "../../shell/memory-store.ts";
import { airlockItem, askItem, inboxItem } from "../../shell/needs-you-testing.ts";
import {
  entriesTouching,
  flatRows,
  gardenSections,
  inboxView,
  ledgerSummary,
  newestFirst,
  noteNameOf,
  rowRevealing,
} from "./rows.ts";

function note(name: string, layer = "workspace"): MemoryNote {
  return {
    name,
    path: `${name}.md`,
    title: name,
    provenance: "agent",
    pinned: false,
    aliases: [],
    body: "",
    links: [],
    tokens: 4,
    frontmatter: {},
    layer,
    file: `C:/vault/${name}.md`,
    curing: 1,
    injected: false,
    recalls: 0,
  };
}

function entry(id: string, op: LedgerEntry["op"], path: string): LedgerEntry {
  return {
    id,
    op,
    timestamp: `2026-09-07T12:00:0${id}.000Z`,
    deltas: [{ path, before: null, beforeHash: null, after: "x", afterHash: "h" }],
  };
}

const staged: StagedItem = {
  id: "s1",
  kind: "note",
  target: "Stray Claim.md",
  created: "2026-09-07T12:00:00.000Z",
  content: "Thirds, maybe.",
};

const garden: MemoryGarden = {
  ...inertGarden,
  trusted: true,
  layers: [
    {
      id: "workspace",
      kind: "workspace",
      label: "workspace",
      prompt: { budget: 4096, used: 120 },
    },
    {
      id: "arc:launch",
      kind: "arc",
      label: "launch",
      arc: "launch",
    },
  ],
  inbox: [
    staged,
    {
      id: "r1",
      kind: "contradiction",
      key: "k",
      created: "2026-09-07T12:00:00.000Z",
      a: "Layout Rects",
      b: "Layout Cells",
      aProvenance: "user",
      bProvenance: "agent",
      confidence: 0.6,
    },
  ],
  airlocks: [
    {
      arc: "launch",
      candidates: [
        { note: "Plan", title: "Plan", provenance: "agent", eligible: true, shortfalls: [] },
      ],
      questions: [{ title: "Ship first?", provenance: "user" }],
      successor: "polish",
    },
  ],
};

describe("garden sections", () => {
  it("lays out layers with their notes, the dates, the inbox grouped by kind, and each airlock", () => {
    const sections = gardenSections({
      garden,
      notes: [note("Layout Rects"), note("Composer Enter"), note("Plan", "arc:launch")],
      dates: ["2026-09-07"],
    });
    expect(sections.map((section) => section.heading)).toEqual([
      "workspace",
      "launch",
      "daily",
      "inbox · staged",
      "inbox · contradiction",
      "airlock · launch",
    ]);
    expect(flatRows(sections).map((row) => row.kind)).toEqual([
      "layer",
      "note",
      "note",
      "layer",
      "note",
      "date",
      "inbox",
      "inbox",
      "candidate",
      "question",
      "finish",
    ]);
  });

  it("puts the ask hits first as note rows", () => {
    const sections = gardenSections({
      garden,
      notes: [],
      dates: [],
      hits: [
        { note: "Layout Rects", layer: "workspace", ranks: { lexical: 1 }, superseded: false },
      ],
    });
    expect(sections[0]?.heading).toBe("ask · 1 hits");
    expect(sections[0]?.rows[0]?.kind).toBe("hit");
    expect(gardenSections({ garden, notes: [], dates: [], hits: [] })[0]?.heading).toBe(
      "ask · nothing matches",
    );
  });
});

describe("rows a needs-you jump reveals", () => {
  const rows = flatRows(gardenSections({ garden, notes: [], dates: [] }));

  it("finds an inbox item by its id", () => {
    expect(rowRevealing(rows, inboxItem("r1"))).toBe("inbox:r1");
    expect(rowRevealing(rows, inboxItem("gone"))).toBeUndefined();
  });

  it("lands an airlock on its first undecided entry, else on its close row", () => {
    expect(rowRevealing(rows, airlockItem("launch"))).toBe("candidate:launch:Plan");
    const decided = flatRows(
      gardenSections({
        garden: {
          ...garden,
          airlocks: [
            {
              arc: "launch",
              candidates: [
                {
                  note: "Plan",
                  title: "Plan",
                  provenance: "agent",
                  eligible: true,
                  shortfalls: [],
                  choice: "deliver",
                },
              ],
              questions: [{ title: "Ship first?", provenance: "user", choice: "carry" }],
            },
          ],
        },
        notes: [],
        dates: [],
      }),
    );
    expect(rowRevealing(decided, airlockItem("launch"))).toBe("finish:launch");
  });

  it("reveals nothing for an item answered in a session", () => {
    expect(rowRevealing(rows, askItem("c1"))).toBeUndefined();
  });
});

describe("inbox items as rows", () => {
  it("reads a staged write as untrusted and a contradiction by its worse side", () => {
    expect(inboxView(staged)).toEqual({
      group: "staged",
      title: "Stray Claim.md",
      provenance: "untrusted",
      detail: "note",
      note: "Stray Claim",
    });
    expect(inboxView(garden.inbox[1] as StagedItem)).toMatchObject({
      group: "contradiction",
      title: "Layout Rects vs Layout Cells",
      provenance: "agent",
    });
  });
});

describe("a promotion card's odds", () => {
  const promotion: StagedItem = {
    id: "p1",
    key: "k",
    created: "2026-10-15T12:00:00.000Z",
    kind: "borderline-promotion",
    title: "Auth Tokens Rotate",
    body: "body",
    confidence: 0.7,
    source: "2026-10-15#3",
  };
  const triage: MemoryDecision = {
    id: "t1",
    question: "entry-durability@1",
    about: { kind: "entry", entryId: "2026-10-15#3" },
    candidates: ["2026-10-15#3"],
    choice: "changes-a-note",
    confidence: 0.91,
    decider: "jev",
    latencyMs: 80,
  };
  const viewOf = (decision: MemoryDecision) => {
    const sections = gardenSections({
      garden: { ...garden, inbox: [promotion] },
      notes: [],
      dates: [],
      entryDecisions: { "2026-10-15#3": decision },
    });
    const row = flatRows(sections).find((item) => item.kind === "inbox");
    return row?.kind === "inbox" ? row.view : undefined;
  };

  it("carries the entry's decision onto the card it was promoted from", () => {
    expect(viewOf(triage)?.odds).toBe("changes a note · jev 0.91");
  });

  it("carries nothing for the builtin, whose triage is always unsure", () => {
    const view = viewOf({ ...triage, choice: "unsure", decider: "builtin" });
    expect(view).toEqual(inboxView(promotion));
    expect(view).not.toHaveProperty("odds");
  });
});

describe("the ledger", () => {
  it("summarizes an entry by its op and the notes it touched, newest first", () => {
    const ledger = [entry("1", "create", "Layout Rects.md"), entry("2", "approve", ".staging/x")];
    expect(ledgerSummary(ledger[0] as LedgerEntry)).toBe("create Layout Rects");
    expect(ledgerSummary(ledger[1] as LedgerEntry)).toBe("approve .staging/x");
    expect(newestFirst(ledger).map((item) => item.id)).toEqual(["2", "1"]);
    expect(entriesTouching(ledger, "Layout Rects.md").map((item) => item.id)).toEqual(["1"]);
    expect(noteNameOf("entities/people/Ada.md")).toBe("people/Ada");
  });
});
