import type { ForgetSourcePlan, MemoryNote, MemoryNotes } from "@keywork-app/protocol";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { forgetApplyPath, forgetPreviewPath } from "../memory/forget.ts";
import { mountPane, settle } from "../overview/testing.tsx";
import type { ShellSeams } from "../registry.ts";
import { craftRows, craftSource, nothingLearned } from "./craft.tsx";
import { type CreatureSpec, creaturePane } from "./index.tsx";
import { type CreatureHarness, creatureHarness, flat } from "./testing.ts";

afterEach(cleanup);

const spec: CreatureSpec = { kind: "creature", slug: "wren" };

function lesson(name: string, body: string, craft = true): MemoryNote {
  return {
    name,
    path: `${name}.md`,
    title: name,
    provenance: "agent",
    pinned: false,
    aliases: [],
    body,
    links: [],
    tokens: 4,
    frontmatter: craft ? { section: "craft" } : {},
    layer: "bot:wren",
    file: `C:/vault/bots/wren/${name}.md`,
    curing: 0,
    injected: false,
    recalls: 0,
  };
}

const lessons: MemoryNote[] = [
  lesson("Triage Order", "\nOldest first, then by label.\n"),
  lesson("Label Words", "Short labels read better.\n"),
  lesson("Keeper Asked", "the keeper's own note\n", false),
];

const triagePlan: ForgetSourcePlan = {
  source: "craft:wren/Triage Order",
  digest: "d-triage",
  counts: { notes: 1, anchors: 0, edges: 0, citations: 2, entries: 0 },
  notes: [
    { name: "Triage Order", path: "Triage Order.md", firstLine: "Oldest first, then by label." },
  ],
  anchors: [],
  edges: [],
  citations: [
    { note: "Triage Order", kind: "recall", timestamp: "2026-11-06T08:00:00.000Z" },
    { note: "Triage Order", kind: "citation", timestamp: "2026-11-06T08:01:00.000Z" },
  ],
  entries: [],
  kept: [],
};

interface Opened {
  container: HTMLElement;
  act: (action: string) => void;
  harness: CreatureHarness;
  listings: () => number;
}

async function open(notes: MemoryNote[] = lessons): Promise<Opened> {
  const harness = creatureHarness();
  let listed: MemoryNote[] = notes;
  let listings = 0;
  const shell: ShellSeams = {
    ...harness.shell,
    keys: {
      ...harness.shell.keys,
      chord: (action) =>
        ({ "creature.craft": "l", "creature.craft-edit": "o", "creature.craft-forget": "x" })[
          action
        ] ?? harness.shell.keys.chord(action),
    },
    client: {
      ...harness.shell.client,
      memoryNotes: async (): Promise<MemoryNotes> => {
        listings += 1;
        return { trusted: true, notes: listed };
      },
    } as ShellSeams["client"],
  };
  harness.served.serve(`POST ${forgetPreviewPath}`, () => ({
    status: 200,
    body: { plan: triagePlan },
  }));
  harness.served.serve(`POST ${forgetApplyPath}`, (body) => {
    listed = listed.filter((note) => note.name !== "Triage Order");
    return {
      status: 200,
      body: {
        forgot: {
          source: (body as { source: string }).source,
          counts: triagePlan.counts,
          ledgerId: "l-1",
        },
      },
    };
  });
  const mounted = mountPane(creaturePane.component, spec, shell);
  await settle();
  await settle();
  await settle();
  return { ...mounted, harness, listings: () => listings };
}

function craftNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-creature-craft li")].map(
    (row) => row.getAttribute("data-craft") ?? "",
  );
}

function focusedCraft(container: HTMLElement): string | null {
  return (
    container
      .querySelector(".kw-creature-craft li[aria-current='true']")
      ?.getAttribute("data-craft") ?? null
  );
}

function noticeText(container: HTMLElement): string {
  const lines = container.querySelectorAll(".kw-ov-line:not([data-tone='ask'])");
  return lines[lines.length - 1]?.textContent ?? "";
}

describe("craft memory in the profile", () => {
  it("shows only the creature's craft section, apart from the keeper's notes, with first lines", async () => {
    const { container } = await open();
    expect(craftNames(container)).toEqual(["Triage Order", "Label Words"]);
    const rows = container.querySelector(".kw-creature-craft") as HTMLElement;
    expect(flat(rows)).toContain("Triage Order Oldest first, then by label. agent");
    expect(container.textContent).toContain(
      "l next lesson · o edits it · x forgets it after a dry run",
    );
  });

  it("says so when nothing has been learned yet", async () => {
    const { container } = await open([lessons[2] as MemoryNote]);
    expect(craftNames(container)).toEqual([]);
    expect(container.textContent).toContain(nothingLearned);
  });

  it("moves between lessons and opens the focused one in the editor", async () => {
    const { container, act, harness } = await open();
    expect(focusedCraft(container)).toBe("Triage Order");
    act("creature.craft");
    expect(focusedCraft(container)).toBe("Label Words");
    act("creature.craft-edit");
    expect(harness.edited).toEqual(["C:/vault/bots/wren/Label Words.md"]);
    act("creature.craft");
    expect(focusedCraft(container)).toBe("Triage Order");
  });

  it("forgets a lesson only after the dry run card, then reads the craft section again", async () => {
    const { container, act, harness, listings } = await open();
    act("creature.craft-forget");
    await settle();
    const card = container.querySelector("fieldset.kw-memory-forget") as HTMLElement;
    expect(card.querySelector("legend")?.textContent).toBe(
      "Forget what came from craft:wren/Triage Order",
    );
    expect(card.textContent).toContain("1 note, 0 anchors, 0 edges, 2 citations, 0 entries");
    expect(harness.served.calls.at(-1)).toMatchObject({
      method: "POST",
      path: forgetPreviewPath,
      body: { source: craftSource("wren", "Triage Order") },
    });
    const before = listings();
    fireEvent.keyDown(card, { key: "y" });
    await settle();
    await settle();
    expect(harness.served.calls.at(-1)).toMatchObject({
      path: forgetApplyPath,
      body: { source: "craft:wren/Triage Order", digest: "d-triage" },
    });
    expect(noticeText(container)).toBe(
      "forgot craft:wren/Triage Order · 1 note, 0 anchors, 0 edges, 2 citations, 0 entries",
    );
    expect(listings()).toBeGreaterThan(before);
    expect(craftNames(container)).toEqual(["Label Words"]);
  });

  it("keeps everything when the card hears any other key, and names a node without the route", async () => {
    const { container, act, harness } = await open();
    act("creature.craft-forget");
    await settle();
    fireEvent.keyDown(container.querySelector("fieldset.kw-memory-forget") as HTMLElement, {
      key: "n",
    });
    await settle();
    expect(container.querySelector("fieldset.kw-memory-forget")).toBeNull();
    expect(noticeText(container)).toBe("kept everything");
    expect(harness.served.calls.some((call) => call.path === forgetApplyPath)).toBe(false);

    harness.served.serve(`POST ${forgetPreviewPath}`, () => ({
      status: 501,
      body: { error: "this node does not serve forget by source yet" },
    }));
    act("creature.craft-forget");
    await settle();
    expect(noticeText(container)).toMatch(/^Blocked: this node cannot forget by source yet\./);
  });

  it("reads craft rows defensively from the wire", () => {
    expect(craftRows(undefined)).toEqual([]);
    expect(craftRows({ trusted: false, notes: lessons })).toEqual([]);
    expect(craftRows({ trusted: true, notes: lessons }).map((row) => row.firstLine)).toEqual([
      "Oldest first, then by label.",
      "Short labels read better.",
    ]);
  });
});
