import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cardKeysLine,
  choresLine,
  deleteTitle,
  doesNotUndoLine,
  emptyStateLine,
  goesLine,
  goneLine,
  keyHints,
  memoryLine,
  modelChoiceLine,
  noVerbYetLine,
  pausedLine,
  resumedLine,
  shadowClassLine,
  staysLine,
  workshopLine,
} from "./copy.ts";

describe("the profile's words", () => {
  it("hold no exclamation mark and no emoji in any string", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/ui/src/panes/creature/copy.ts"),
      "utf8",
    );
    const literals = [...source.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
      ([, plain, template]) => plain ?? template ?? "",
    );
    expect(literals.length).toBeGreaterThan(20);
    for (const literal of literals) {
      expect(literal, literal).not.toMatch(/!/);
      expect(literal, literal).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("teaches one next action in two parts and lists the keys in one line", () => {
    expect(emptyStateLine("ctrl+k b")).toBe("No creature yet · make one with ctrl+k b");
    expect(
      keyHints({ rename: "r", skin: "b", policy: "m", conversation: "c", pause: "p", remove: "d" }),
    ).toBe("r rename · b body · m models · c conversation · p pause · d delete");
  });

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

  it("names the exact thing and the next step when the node has no route, and never a bare code", () => {
    const line = noVerbYetLine("name", ".keywork/bots/wren/creature.json", "e");
    expect(line).toBe(
      "Blocked: the node has no route to change the name yet. Next step: edit .keywork/bots/wren/creature.json; e opens it in your editor.",
    );
    expect(line).not.toMatch(/\b4\d\d\b/);
  });

  it("reports pause as a fact about chores, with what keeps going and nothing lost", () => {
    expect(pausedLine(2, "p")).toBe(
      "Paused: 2 chores do not fire until you resume; p resumes. Live threads finish.",
    );
    expect(pausedLine(1, "p")).toBe(
      "Paused: 1 chore does not fire until you resume; p resumes. Live threads finish.",
    );
    expect(resumedLine(1)).toBe("Resumed: 1 chore fires on schedule again.");
  });

  it("shows inherit with where it resolves and a chosen model as provider/model", () => {
    expect(modelChoiceLine("inherit")).toBe("inherit · workspace, then user");
    expect(modelChoiceLine({ provider: "ollama", model: "qwen3:8b" })).toBe("ollama/qwen3:8b");
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
