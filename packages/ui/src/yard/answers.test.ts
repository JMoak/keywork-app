import { describe, expect, it, vi } from "vitest";
import { answerSetting, pinAnswer, type SettingAnswers } from "./answers.ts";

describe("the keeper's answers", () => {
  it("post the outcome to the wire and say what follows, settling nothing here", async () => {
    const answers = { answerSetting: vi.fn(async () => undefined) };
    expect(await answerSetting(answers, "set-1", "dismissed")).toBe("dismissed · it closes");
    expect(await answerSetting(answers, "set-1", "pinned")).toBe("pinned · it stays open");
    expect(await answerSetting(answers, "set-1", "seen")).toBe("marked seen · it leaves the yard");
    expect(answers.answerSetting.mock.calls).toEqual([
      ["set-1", "dismissed"],
      ["set-1", "pinned"],
      ["set-1", "seen"],
    ]);
  });

  it("take a conflict as already settled and say nothing of it", async () => {
    const settledAlready: SettingAnswers = {
      answerSetting: async () => ({
        refused: "conflict",
        detail: "setting set-1 is not pinned, so there is nothing to unpin",
      }),
    };
    expect(await answerSetting(settledAlready, "set-1", "unpinned")).toBeUndefined();
  });

  it("carry a refusal or a failure back in the server's words", async () => {
    const gone: SettingAnswers = {
      answerSetting: async () => ({
        refused: "missing",
        detail: "no setting out has the id set-1",
      }),
    };
    expect(await answerSetting(gone, "set-1", "seen")).toBe(
      "not answered · no setting out has the id set-1",
    );
    const failing: SettingAnswers = {
      answerSetting: async () => {
        throw new Error("the server answered 500");
      },
    };
    expect(await answerSetting(failing, "set-1", "seen")).toBe(
      "not answered · the server answered 500",
    );
  });

  it("toggle a pin by what the setting already is", () => {
    expect(pinAnswer(false)).toBe("pinned");
    expect(pinAnswer(true)).toBe("unpinned");
  });
});
