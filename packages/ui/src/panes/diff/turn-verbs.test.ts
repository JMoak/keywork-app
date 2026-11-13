import type { PathTurn } from "@keywork-app/client";
import type { RestorePreview } from "@keywork-app/protocol";
import { describe, expect, it } from "vitest";
import { undoQuestion } from "./turn-verbs.tsx";

describe("the undo question", () => {
  it("counts only the files that go back, not the keeper's own that stay", () => {
    expect(
      undoQuestion("ctrl+k shift+u", lastTurn, previewOf(["src/a.ts", "src/b.ts"], ["mine.md"])),
    ).toBe('undo turn 2, "write the helpers"? 2 files go back · ctrl+k shift+u redoes it');
  });

  it("says nothing changes when only the keeper's files differ", () => {
    expect(undoQuestion("ctrl+k shift+u", lastTurn, previewOf([], ["mine.md"]))).toBe(
      'undo turn 2, "write the helpers"? no file changes · ctrl+k shift+u redoes it',
    );
  });
});

const lastTurn: PathTurn = {
  turn: 2,
  promptId: "p2",
  leafId: "l2",
  text: "write the helpers",
  costUsd: undefined,
  marks: [],
};

function previewOf(goingBack: readonly string[], staying: readonly string[]): RestorePreview {
  const candidate = (path: string, goesBack: boolean) => ({
    path,
    added: 1,
    deleted: 0,
    touched: goesBack,
    goesBack,
  });
  return {
    turn: 2,
    prompt: { entryId: "p2", text: "write the helpers" },
    undoneTurns: 1,
    scope: "session",
    files: [
      ...goingBack.map((path) => candidate(path, true)),
      ...staying.map((path) => candidate(path, false)),
    ],
    others: [],
  };
}
