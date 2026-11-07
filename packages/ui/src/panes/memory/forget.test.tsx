import type { ForgetSourcePlan, MemoryNote } from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import {
  craftOwnerOf,
  forgetApplyPath,
  forgetCard,
  forgetClient,
  forgetPreviewPath,
  forgotLine,
  isCraftNote,
  nothingToForgetLine,
  refusedLine,
  sourceOfNote,
  tallyLine,
} from "./forget.ts";
import { ForgetCard } from "./forget-card.tsx";

afterEach(cleanup);

const pricingPlan: ForgetSourcePlan = {
  source: "web:example.com",
  digest: "d1",
  counts: { notes: 4, anchors: 1, edges: 1, citations: 1, entries: 0 },
  notes: [
    { name: "Fetched Pricing", path: "Fetched Pricing.md", firstLine: "Prices from the page" },
    { name: "Vendor Notes", path: "Vendor Notes.md", firstLine: "Links out" },
    { name: "Third", path: "Third.md", firstLine: "three" },
    { name: "Fourth", path: "Fourth.md", firstLine: "four" },
  ],
  anchors: [{ note: "Fetched Pricing", at: "2026-11-05T10:00:00.000Z" }],
  edges: [{ subject: "Keeper Rule", predicate: "relates_to", object: "Fetched Pricing" }],
  citations: [{ note: "Vendor Notes", kind: "citation", timestamp: "2026-11-06T09:00:00.000Z" }],
  entries: [],
  kept: [],
};

function memoryNote(overrides: Partial<MemoryNote>): MemoryNote {
  return {
    name: "Note",
    path: "Note.md",
    title: "Note",
    provenance: "agent",
    pinned: false,
    aliases: [],
    body: "",
    links: [],
    tokens: 1,
    frontmatter: {},
    layer: "workspace",
    file: "C:/vault/Note.md",
    curing: 0,
    injected: false,
    recalls: 0,
    ...overrides,
  };
}

function fetchServing(table: Record<string, { status: number; body: unknown }>) {
  const calls: { path: string; body: unknown }[] = [];
  const fetch = async (path: string, init?: RequestInit): Promise<Response> => {
    calls.push({ path, body: JSON.parse(String(init?.body ?? "null")) });
    const served = table[path] ?? { status: 404, body: { error: "no such route" } };
    return new Response(JSON.stringify(served.body), { status: served.status });
  };
  return { fetch, calls };
}

describe("where a note came from", () => {
  it("reads a craft note as its creature's craft source, else origin_source, else its session", () => {
    const craft = memoryNote({
      name: "Triage Order",
      layer: "bot:wren",
      frontmatter: { section: "craft" },
    });
    expect(isCraftNote(craft)).toBe(true);
    expect(craftOwnerOf(craft)).toBe("wren");
    expect(sourceOfNote(craft)).toBe("craft:wren/Triage Order");
    expect(sourceOfNote(memoryNote({ frontmatter: { origin_source: "web:example.com" } }))).toBe(
      "web:example.com",
    );
    expect(sourceOfNote(memoryNote({ frontmatter: { origin_session: "s-1" } }))).toBe(
      "session:s-1",
    );
    expect(sourceOfNote(memoryNote({}))).toBeUndefined();
    expect(isCraftNote({ frontmatter: undefined as unknown as Record<string, unknown> })).toBe(
      false,
    );
  });
});

describe("the dry run card", () => {
  it("shows the counts and the first lines of each list, with how many more", () => {
    const view = forgetCard(pricingPlan);
    expect(view.title).toBe("Forget what came from web:example.com");
    expect(view.tally).toBe("4 notes, 1 anchor, 1 edge, 1 citation, 0 entries");
    expect(view.sections.map((part) => part.heading)).toEqual([
      "notes",
      "anchors",
      "edges",
      "citations",
    ]);
    expect(view.sections[0]).toEqual({
      heading: "notes",
      lines: [
        "Fetched Pricing · Prices from the page",
        "Vendor Notes · Links out",
        "Third · three",
      ],
      more: 1,
    });
    expect(view.sections[2]?.lines).toEqual(["Keeper Rule relates_to Fetched Pricing"]);
    expect(view.empty).toBe(false);
  });

  it("forgets on y and keeps everything on any other key", () => {
    const outcomes: string[] = [];
    const { container } = render(() => (
      <ForgetCard
        view={forgetCard(pricingPlan)}
        onForget={() => outcomes.push("forget")}
        onKeep={() => outcomes.push("keep")}
      />
    ));
    const card = container.querySelector("fieldset.kw-memory-forget") as HTMLElement;
    expect(card.querySelector("[data-part='tally']")?.textContent).toBe(
      "4 notes, 1 anchor, 1 edge, 1 citation, 0 entries",
    );
    expect(card.textContent).toContain("and 1 more");
    fireEvent.keyDown(card, { key: "q" });
    fireEvent.keyDown(card, { key: "y" });
    expect(outcomes).toEqual(["keep", "forget"]);
  });

  it("says nothing came from there and offers no forget for an empty plan", () => {
    const outcomes: string[] = [];
    const empty = {
      ...pricingPlan,
      counts: { notes: 0, anchors: 0, edges: 0, citations: 0, entries: 0 },
      notes: [],
      anchors: [],
      edges: [],
      citations: [],
    };
    const { container } = render(() => (
      <ForgetCard
        view={forgetCard(empty)}
        onForget={() => outcomes.push("forget")}
        onKeep={() => outcomes.push("keep")}
      />
    ));
    expect(container.textContent).toContain(nothingToForgetLine);
    fireEvent.keyDown(container.querySelector("fieldset") as HTMLElement, { key: "y" });
    expect(outcomes).toEqual(["keep"]);
  });
});

describe("the forget client", () => {
  it("previews with the source and applies with the previewed digest", async () => {
    const { fetch, calls } = fetchServing({
      [forgetPreviewPath]: { status: 200, body: { plan: pricingPlan } },
      [forgetApplyPath]: {
        status: 200,
        body: { forgot: { source: "web:example.com", counts: pricingPlan.counts, ledgerId: "l1" } },
      },
    });
    const client = forgetClient(fetch);
    const preview = await client.preview("web:example.com");
    expect(preview).toEqual({ ok: true, value: pricingPlan });
    const applied = await client.apply("web:example.com", "d1");
    expect(applied.ok && forgotLine(applied.value)).toBe(
      "forgot web:example.com · 4 notes, 1 anchor, 1 edge, 1 citation, 0 entries",
    );
    expect(calls).toEqual([
      { path: forgetPreviewPath, body: { source: "web:example.com" } },
      { path: forgetApplyPath, body: { source: "web:example.com", digest: "d1" } },
    ]);
  });

  it("turns a stale dry run, a missing route and a bad shape into lines the keeper can act on", async () => {
    const { fetch } = fetchServing({
      [forgetPreviewPath]: { status: 200, body: { plan: { source: 1 } } },
      [forgetApplyPath]: { status: 409, body: { error: "the vault changed" } },
    });
    const client = forgetClient(fetch);
    const odd = await client.preview("web:example.com");
    expect(odd.ok).toBe(false);
    const stale = await client.apply("web:example.com", "d1");
    expect(stale.ok ? "" : refusedLine(stale)).toBe(
      "memory moved since the dry run · run it again",
    );
    expect(refusedLine({ status: 501, detail: "x" })).toMatch(/^Blocked: .* Next step: /);
    expect(forgotLine({ source: "web:x", counts: pricingPlan.counts })).toBe(nothingToForgetLine);
    expect(tallyLine({ notes: 1, anchors: 0, edges: 0, citations: 0, entries: 1 })).toBe(
      "1 note, 0 anchors, 0 edges, 0 citations, 1 entry",
    );
  });
});
