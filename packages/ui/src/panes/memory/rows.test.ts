import type { InboxItem, LedgerEntry, MemoryGarden, MemoryNote } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { inertGarden } from "../../shell/memory-store.ts";
import {
  entriesTouching,
  flatRows,
  gardenSections,
  inboxView,
  ledgerSummary,
  newestFirst,
  noteNameOf,
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
    curing: 1,
    injected: false,
    recalls: 0,
    relations: [],
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

const staged: InboxItem = {
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
      notes: 2,
      curing: { 0: 1, 1: 1, 2: 0, 3: 0 },
      prompt: { budget: 4096, used: 120 },
    },
    {
      id: "arc:launch",
      kind: "arc",
      label: "launch",
      arc: "launch",
      notes: 1,
      curing: { 0: 1, 1: 0, 2: 0, 3: 0 },
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

describe("inbox items as rows", () => {
  it("reads a staged write as untrusted and a contradiction by its worse side", () => {
    expect(inboxView(staged)).toEqual({
      group: "staged",
      title: "Stray Claim.md",
      provenance: "untrusted",
      detail: "note",
      note: "Stray Claim",
    });
    expect(inboxView(garden.inbox[1] as InboxItem)).toMatchObject({
      group: "contradiction",
      title: "Layout Rects vs Layout Cells",
      provenance: "agent",
    });
  });

  it("names the bot that staged an owned item", () => {
    expect(inboxView({ ...staged, bot: "scout" }).title).toBe("scout · Stray Claim.md");
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
