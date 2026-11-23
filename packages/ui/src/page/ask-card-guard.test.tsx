import { emptyProjection, projectAll, type ToolRun } from "@keywork-app/client";
import type { AnswerOutcome, AskScope, AskVerdict, BusEnvelope } from "@keywork-app/protocol";
import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { AskCard } from "./ask-card.tsx";
import { answerWaitMs, typingWaitMs } from "./ask-card-guard.ts";
import { type AskClockInHand, holdTheAskClock } from "./ask-card-guard-testing.ts";

let clock: AskClockInHand | undefined;

afterEach(() => {
  cleanup();
  clock?.pass(typingWaitMs);
  clock?.release();
});

describe("the guard on answering a permission question", () => {
  it("lets a burst of keys answer nothing, then or later; one key answers after the quiet; the window coming to the front starts the wait again", async () => {
    clock = holdTheAskClock();
    const { card, answers } = showQuestion();
    clock.pass(answerWaitMs - 1);
    for (const key of ["y", "e", "s"]) await press(card, key);
    expect(answers).toEqual([]);
    clock.pass(typingWaitMs - 1);
    expect(answers).toEqual([]);

    clock.pass(1);
    await press(card, "y");
    expect(answers).toEqual([["granted", undefined]]);

    window.dispatchEvent(new Event("focus"));
    await press(card, "y");
    expect(answers).toHaveLength(1);
    clock.pass(answerWaitMs);
    await press(card, "y");
    expect(answers).toEqual([
      ["granted", undefined],
      ["granted", undefined],
    ]);
  });
});

type Answer = [AskVerdict, AskScope | undefined];

function showQuestion() {
  const answers: Answer[] = [];
  const { container } = render(() => (
    <AskCard
      run={askingRun}
      onAnswer={async (verdict, scope): Promise<AnswerOutcome> => {
        answers.push([verdict, scope]);
        return "settled";
      }}
    />
  ));
  return { card: container.querySelector(".kw-ask") as HTMLElement, answers };
}

async function press(card: HTMLElement, key: string): Promise<void> {
  fireEvent.keyDown(card, { key });
  for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
}

const askingRun: ToolRun = (() => {
  const asked = {
    id: 1,
    ts: "2026-11-23T09:00:00.000Z",
    sessionId: "s1",
    type: "gate.ask",
    payload: {
      ask: {
        tool: "bash",
        callId: "c1",
        arguments: { command: "bun test" },
        rule: "default",
        rules: [],
      },
    },
  } as BusEnvelope;
  const entry = projectAll(emptyProjection, [asked]).entries[0];
  if (entry?.kind !== "tool") throw new Error("the ask did not project to a tool run");
  return entry.run;
})();
