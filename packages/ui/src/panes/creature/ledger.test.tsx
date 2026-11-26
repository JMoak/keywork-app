import type { CreatureLedgerEntry } from "@keywork-app/protocol";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { answersNeverWait } from "../../page/ask-card-guard-testing.ts";
import { mountPane, settle } from "../overview/testing.tsx";
import { askingToRun, projectOpenHere } from "../stead/project-open-testing.ts";
import { creaturePane } from "./index.tsx";
import { creatureHarness, ledgerEntry, minutesAgo } from "./testing.ts";

answersNeverWait();

afterEach(cleanup);

describe("the creature's ledger", () => {
  it("puts unanswered questions first, newest first, then the rest newest first with running work as now, and marks what is unseen", async () => {
    const { container, harness } = await open([
      ledgerEntry("q-old", { kind: "question", state: "waiting", openedAt: minutesAgo(30) }),
      ledgerEntry("t-blocked", {
        kind: "task",
        state: "blocked",
        openedAt: minutesAgo(90),
        closedAt: minutesAgo(40),
      }),
      ledgerEntry("t-back", {
        kind: "task",
        state: "finished",
        openedAt: minutesAgo(50),
        closedAt: minutesAgo(10),
      }),
      ledgerEntry("q-answered", {
        kind: "question",
        state: "answered",
        answer: "granted",
        openedAt: minutesAgo(60),
        closedAt: minutesAgo(5),
      }),
      ledgerEntry("t-running", { kind: "task", state: "running", openedAt: minutesAgo(120) }),
      ledgerEntry("q-new", { kind: "question", state: "waiting", openedAt: minutesAgo(2) }),
      ledgerEntry("t-done", {
        kind: "task",
        state: "done",
        openedAt: minutesAgo(20),
        closedAt: minutesAgo(1),
      }),
    ]);
    expect(rows(container)).toEqual([
      ["?", "q-new", "seen"],
      ["?", "q-old", "seen"],
      ["▸", "t-running", "seen"],
      ["✓", "t-done", "seen"],
      ["?", "q-answered", "seen"],
      ["●", "t-back", "unseen"],
      ["!", "t-blocked", "seen"],
    ]);
    harness.dispose();
  });

  it("opens the row's own conversation on enter with one request to that entry, rising from the creature's workshop", async () => {
    const { container, act, harness } = await open([
      ledgerEntry("q1", { kind: "question", state: "waiting", openedAt: minutesAgo(3) }),
      ledgerEntry("t1", { kind: "task", state: "running", openedAt: minutesAgo(9) }),
    ]);
    act("creature.down");
    act("creature.open");
    await settle();
    expect(harness.ledgerCalls.filter((call) => call.method !== "read")).toEqual([
      { method: "conversation", slug: "wren", id: "t1" },
    ]);
    expect(harness.setOut).toEqual([
      {
        spec: { kind: "conversation", sessionId: "about-t1" },
        place: { kind: "workshop", creature: "wren" },
      },
    ]);
    const talking = container.querySelector(".kw-ledger-row[data-conversation='open']");
    expect(talking?.querySelector(".kw-ledger-words")?.textContent).toBe("t1");
    harness.dispose();
  });

  it("shows a bound project's entry under its project's name, answers it in that project, and offers it no conversation", async () => {
    const harness = creatureHarness({
      ledger: [
        ledgerEntry("q-orchard", {
          kind: "question",
          state: "waiting",
          openedAt: minutesAgo(2),
          directory: "C:/work/orchard",
          session: "p1",
          about: { kind: "ask", callId: "c7", tool: "bash" },
          project: "4e1c0d9a7b23",
        }),
      ],
    });
    const orchard = projectOpenHere(harness.shell, {
      workspace: "4e1c0d9a7b23",
      label: "orchard",
      sessions: {
        p1: { title: "run the orchard tests", projection: askingToRun("c7", "bun test") },
      },
    });
    const { container, act } = mountPane(
      creaturePane.component,
      { kind: "creature", slug: "wren" },
      { ...harness.shell, steadHome: orchard.scope },
    );
    await settle();
    await settle();
    await settle();
    const row = container.querySelector(".kw-ledger-row") as Element;
    expect(row.querySelector(".kw-ledger-meta")?.textContent).toMatch(/^orchard · /);
    expect(orchard.loaded).toContain("p1");
    const once = [...row.querySelectorAll(".kw-ledger-answer")].find((answer) =>
      answer.textContent?.startsWith("once"),
    );
    fireEvent.pointerDown(once as Element);
    fireEvent.click(once as Element, { detail: 1 });
    await settle();
    expect(orchard.answered).toEqual([["c7", "granted", undefined]]);

    expect(container.querySelector(".kw-ledger-hint")?.textContent).not.toMatch(/talk it over/);
    act("creature.open");
    await settle();
    expect(harness.ledgerCalls.filter((call) => call.method === "conversation")).toEqual([]);
    expect(orchard.went).toEqual([{ workspace: "4e1c0d9a7b23", session: "p1" }]);
    harness.dispose();
  });
});

async function open(ledger: CreatureLedgerEntry[]) {
  const harness = creatureHarness({ ledger });
  const mounted = mountPane(
    creaturePane.component,
    { kind: "creature", slug: "wren" },
    harness.shell,
  );
  await settle();
  await settle();
  await settle();
  return { ...mounted, harness };
}

function rows(container: HTMLElement): [string, string, "seen" | "unseen"][] {
  return [...container.querySelectorAll(".kw-ledger-row")].map((row) => [
    row.querySelector(".kw-ledger-sign")?.textContent ?? "",
    row.querySelector(".kw-ledger-words")?.textContent ?? "",
    row.hasAttribute("data-unseen") ? "unseen" : "seen",
  ]);
}
