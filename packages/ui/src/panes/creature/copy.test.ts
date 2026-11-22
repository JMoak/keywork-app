import { describe, expect, it } from "vitest";
import {
  cardKeysLine,
  choresLine,
  deleteTitle,
  doesNotUndoLine,
  goesLine,
  goneLine,
  memoryLine,
  shadowClassLine,
  staysLine,
  workshopLine,
} from "./copy.ts";

describe("the profile's words", () => {
  it("writes the delete card in the voice guide's order: what goes, what stays, what it does not undo", () => {
    expect(deleteTitle("Wren")).toBe("Delete Wren");
    expect(goesLine({ name: "Wren", threads: 3, notes: 12, chores: 2, workshop: "ws-wren" })).toBe(
      "Goes: Wren's threads (3, to trash), its notes (12), its chores (2), and its workshop ws-wren unless you keep it.",
    );
    expect(goesLine({ name: "Wren", threads: 1, notes: 0, chores: 0, workshop: undefined })).toBe(
      "Goes: Wren's threads (1, to trash), its notes (0) and its chores (0).",
    );
    expect(staysLine).toBe(
      "Stays: your own notes, the workspace, everything already in the storehouse, and the plaque on the boarded workshop.",
    );
    expect(doesNotUndoLine("Wren")).toBe(
      "Deleting does not undo anything Wren already did. The audit log keeps every step.",
    );
    expect(cardKeysLine({ confirm: "y", keep: "k" })).toBe(
      "y deletes · k toggles keeping the workshop · any other key cancels",
    );
    expect(cardKeysLine({ confirm: "y", keep: undefined })).toBe(
      "y deletes · any other key cancels",
    );
    expect(
      goneLine({
        name: "Wren",
        threads: 3,
        notes: 12,
        chores: 2,
        workshopKept: "ws-wren",
        workshopGone: undefined,
      }),
    ).toBe(
      "Wren is gone: 3 threads to trash, 12 notes retired, 2 chores removed, workshop ws-wren kept.",
    );
  });

  it("folds workshop, chores, memory and shadow facts into one line each", () => {
    expect(workshopLine("ws-wren", "sbx", "up", [])).toBe("ws-wren · sbx · up");
    expect(workshopLine("ws-wren", "host", "unresponsive", ["commands run unconfined"])).toBe(
      "ws-wren · host · not responding · commands run unconfined",
    );
    expect(workshopLine("ws-wren", undefined, undefined, [])).toBe("ws-wren · health unknown");
    expect(choresLine({ total: 0, off: 0, next: undefined })).toBe("no chores");
    expect(choresLine({ total: 2, off: 1, next: { title: "nightly tests", at: "02:00" } })).toBe(
      "2 chores · 1 off · next: nightly tests at 02:00",
    );
    expect(memoryLine(12, 1)).toBe("12 notes in its layer · 1 in the inbox");
    expect(memoryLine(undefined, 0)).toBe("no notes yet · inbox empty");
    expect(
      shadowClassLine({
        ruleClass: "bash",
        rows: 38,
        agreement: 0.92,
        wouldAct: 20,
        gradeWord: "estimated",
        oneWayDoor: false,
      }),
    ).toBe("38 rows · agreement 92% · would act 20 · estimated");
    expect(
      shadowClassLine({
        ruleClass: "rm",
        rows: 1,
        agreement: undefined,
        wouldAct: 0,
        gradeWord: "anecdotal",
        oneWayDoor: true,
      }),
    ).toBe("1 row · would act 0 · one-way door, stays ask-only");
  });
});
