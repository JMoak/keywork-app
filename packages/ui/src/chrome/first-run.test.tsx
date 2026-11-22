import { steadProfile } from "@keywork-app/product";
import { cleanup } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { appActions } from "../keys/actions.ts";
import { keymapFromConfig } from "../keys/config.ts";
import { firstRunActions, firstRunLessons } from "./first-run.tsx";

afterEach(cleanup);

const keymap = keymapFromConfig();
const keys = { chord: (action: string) => keymap.describe(action) ?? "an unbound key" };

describe("the first-run lessons", () => {
  it("teach exactly five keys, every one bound on the hot path and rendered from the keymap", () => {
    const lessons = firstRunLessons(keys);
    expect(lessons).toHaveLength(5);
    expect(lessons.map((lesson) => lesson.chord)).toEqual([
      "enter",
      "ctrl+k s",
      "ctrl+k t",
      "ctrl+p",
      "ctrl+k /",
    ]);
    for (const action of firstRunActions) expect(appActions[action], action).toBeDefined();
  });

  it("teaches creature shortcuts in the Stead profile", () => {
    const lessons = firstRunLessons(keys, steadProfile);
    expect(lessons.map((lesson) => lesson.chord)).toEqual([
      "ctrl+k 0",
      "ctrl+k 1",
      "ctrl+k s",
      "ctrl+p",
      "ctrl+k /",
    ]);
    expect(lessons[0]?.does).toContain("stead");
    expect(lessons[1]?.does).toContain("creature");
  });

  it("follow a rebinding instead of hard-coding the chord", () => {
    const rebound = {
      chord: (action: string) => (action === "palette.go" ? "f2" : keys.chord(action)),
    };
    expect(firstRunLessons(rebound).map((lesson) => lesson.chord)).toContain("f2");
  });
});
