import type { SessionSummary } from "@keywork-app/protocol";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { cursorRow, mountPane, overviewShell, rowTexts, settle } from "../overview/rows.test.tsx";
import { noWorkingSession } from "../overview/working-session.ts";
import { type ArcsSpec, arcHueStyle, arcRows, arcsPane, closeOutcomeLine } from "./index.tsx";

afterEach(cleanup);

const session = (id: string, arc?: string): SessionSummary => ({
  id,
  title: `session ${id}`,
  createdAt: "2026-10-07T00:00:00.000Z",
  lastActivityAt: "2026-10-07T00:00:00.000Z",
  messageCount: 1,
  ...(arc !== undefined && { arc }),
});

const keys = { chord: (action: string) => `ctrl+k ${action}`, leader: () => "ctrl+k" };

describe("the arcs pane", () => {
  it("groups sessions under their arc once unfolded and keeps the unbound ones apart", () => {
    const arcs = [{ slug: "arc-1", status: "active" as const, created: "t", sessions: 1 }];
    const sessions = [session("s1", "arc-1"), session("s2")];
    expect(arcRows(arcs, { "arc-1": 1 }, sessions, new Set()).map((row) => row.kind)).toEqual([
      "arc",
      "group",
    ]);
    expect(
      arcRows(arcs, { "arc-1": 1 }, sessions, new Set(["arc-1", "unbound"])).map((row) => row.kind),
    ).toEqual(["arc", "session", "group", "session"]);
    expect(arcHueStyle(4)).toEqual({ "--kw-arc-hue": "var(--kw-ramp-2)" });
    expect(arcHueStyle(undefined)).toEqual({});
  });

  it("says pending honestly and points at the memory pane for the review", () => {
    expect(
      closeOutcomeLine("arc-1", { kind: "pending", candidates: 2, questions: 1, wedged: 0 }, keys),
    ).toBe(
      "arc-1 pending · 2 candidates, 1 question wait for review · ctrl+k memory.summon opens the memory pane",
    );
    expect(closeOutcomeLine("arc-1", { kind: "closed", delivered: 3, released: 1 }, keys)).toBe(
      "arc-1 closed · 3 delivered · 1 released",
    );
  });

  it("renders arcs with their hue chip by ordinal and opens a session on enter", async () => {
    const harness = overviewShell({ summaries: [session("s1", "arc-1")] });
    await harness.surfaces.load();
    const { container, act } = mountPane(arcsPane.component, { kind: "arcs" }, harness.shell);
    expect(rowTexts(container)).toEqual([
      "▸ arc-1 2 sessions",
      "▸ pricing 0 sessions",
      "▸ arc-0 archived · 1 session",
    ]);
    const chip = container.querySelector(".kw-ov-chip") as HTMLElement;
    expect(chip.style.getPropertyValue("--kw-arc-hue")).toBe("var(--kw-ramp-2)");
    act("arcs.open");
    expect(rowTexts(container)[1]).toBe("░ session s1");
    act("arcs.down");
    expect(cursorRow(container)).toBe("session s1");
    act("arcs.open");
    expect(harness.opened).toEqual(["s1"]);
    harness.dispose();
  });

  it("creates, closes, binds, releases, and abandons after a confirm keystroke", async () => {
    const calls: string[] = [];
    const harness = overviewShell({
      currentSession: "s1",
      client: {
        createArc: async (slug) => {
          calls.push(`create:${slug}`);
          return { slug: slug ?? "arc-3", status: "active", created: "t", sessions: 0 };
        },
        closeArc: async (slug) => {
          calls.push(`close:${slug}`);
          return { kind: "pending", candidates: 1, questions: 0, wedged: 0 };
        },
        bindSessionArc: async (id, slug) => {
          calls.push(`bind:${id}:${slug}`);
          return { sessionId: id, arc: slug };
        },
        abandonArc: async (slug) => {
          calls.push(`abandon:${slug}`);
          return "abandoned";
        },
      },
    });
    await harness.surfaces.load();
    const { container, act } = mountPane(arcsPane.component, { kind: "arcs" }, harness.shell);
    act("arcs.new");
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.input(input, { target: { value: "pricing-2" } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await settle();
    act("arcs.close");
    await settle();
    expect(container.textContent).toContain("arc-1 pending · 1 candidate, 0 questions wait");
    act("arcs.bind");
    await settle();
    act("arcs.release");
    await settle();
    act("arcs.abandon");
    fireEvent.keyDown(container.querySelector("[data-tone='ask']") as HTMLElement, { key: "y" });
    await settle();
    expect(calls).toEqual([
      "create:pricing-2",
      "close:arc-1",
      "bind:s1:arc-1",
      "bind:s1:null",
      "abandon:arc-1",
    ]);
    expect(harness.refreshed()).toBe(2);
    harness.dispose();
  });

  it("shows the server's readiness notice instead of an empty list when arcs are refused", async () => {
    const notice = "arcs need a trusted workspace with memory · /init sets one up";
    const harness = overviewShell({
      client: { arcs: async () => ({ refused: "not-ready", detail: notice }) },
    });
    await harness.surfaces.load();
    const { container } = mountPane(arcsPane.component, { kind: "arcs" }, harness.shell);
    expect(container.querySelector(".kw-empty")?.textContent).toBe(notice);
    harness.dispose();
  });
});

describe("the arcs pane's working session", () => {
  it("binds the session it was summoned from, though the arcs pane now holds focus", async () => {
    const calls: string[] = [];
    const harness = overviewShell({
      client: {
        bindSessionArc: async (id, slug) => {
          calls.push(`bind:${id}:${slug}`);
          return { sessionId: id, arc: slug };
        },
      },
    });
    await harness.surfaces.load();
    const fromConversation = { ...harness.shell, currentSession: () => "s7" };
    const spec = (await arcsPane.summon?.spec(fromConversation)) as ArcsSpec;
    expect(spec).toEqual({ kind: "arcs", sessionId: "s7" });
    const { container, act } = mountPane(arcsPane.component, spec, harness.shell);
    act("arcs.bind");
    await settle();
    expect(calls).toEqual(["bind:s7:arc-1"]);
    expect(container.textContent).not.toContain(noWorkingSession);
    harness.dispose();
  });
});
