import type { Honour, HonourKind } from "@keywork-app/protocol";
import { cleanup, fireEvent } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { mountPane, settle } from "../overview/testing.tsx";
import { creaturePane } from "./index.tsx";
import { creatureHarness, flat } from "./testing.ts";

afterEach(cleanup);

describe("what a creature has earned, on its profile", () => {
  it("lists only its own honours, newest first, the highest of each kind standing for the earlier ones until they are asked for", async () => {
    const harness = creatureHarness();
    harness.served.serve("GET /creature-honours", () => ({
      status: 200,
      body: {
        honours: [
          earned("wren", "conversations", 1, "2026-09-02", "10 conversations."),
          earned("wren", "partners", 1, "2026-09-20", "10 hand-offs with tam.", "tam"),
          earned("tam", "night", 1, "2026-10-01", "Tam worked a night."),
          earned(null, "hamlet", 1, "2026-10-02", "Three creatures stand."),
          earned("wren", "conversations", 2, "2026-10-15", "100 conversations."),
          earned("wren", "run", 1, "2026-10-28", "7 days in a row."),
        ],
      },
    }));
    const { container, act } = mountPane(
      creaturePane.component,
      { kind: "creature", slug: "wren" },
      harness.shell,
    );
    await settle();
    await settle();
    await settle();
    act("creature.profile");

    expect(rows(container)).toEqual([
      "2026-10-28 A ribbon: seven days in a row 7 days in a row.",
      "2026-10-15 A hundred conversations 100 conversations. 1 earlier",
      "2026-09-20 Ten hand-offs with tam 10 hand-offs with tam.",
    ]);

    fireEvent.click(pressable(container, "1 earlier"));
    expect(rows(container)).toEqual([
      "2026-10-28 A ribbon: seven days in a row 7 days in a row.",
      "2026-10-15 A hundred conversations 100 conversations. fold",
      "2026-09-02 Ten conversations 10 conversations.",
      "2026-09-20 Ten hand-offs with tam 10 hand-offs with tam.",
    ]);
    act("creature.earned");
    act("creature.earned");
    expect(rows(container)).toHaveLength(3);
    harness.dispose();
  });
});

function earned(
  holder: string | null,
  kind: HonourKind,
  tier: number,
  day: string,
  proof: string,
  partner: string | null = null,
): Honour {
  return { holder, kind, tier, with: partner, earnedAt: `${day}T08:00:00.000Z`, proof };
}

function rows(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".kw-creature-earned li")].map(flat);
}

function pressable(container: HTMLElement, words: string): HTMLElement {
  const found = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === words,
  );
  if (found === undefined) throw new Error(`nothing to press reads "${words}"`);
  return found;
}
