import type { CreatureLedgerEntry } from "@keywork-app/protocol";
import { cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { mountPane, settle } from "../overview/testing.tsx";
import { creaturePane } from "./index.tsx";
import { creatureHarness, ledgerEntry, minutesAgo } from "./testing.ts";

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
