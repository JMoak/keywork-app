import { afterEach, beforeEach } from "vitest";
import { askClock } from "./ask-card-guard.ts";

export interface AskClockInHand {
  pass(ms: number): void;
  release(): void;
}

export function answersNeverWait(): void {
  const onTheClock = askClock.after;
  beforeEach(() => {
    askClock.after = (_ms, run) => {
      run();
      return () => undefined;
    };
  });
  afterEach(() => {
    askClock.after = onTheClock;
  });
}

export function holdTheAskClock(): AskClockInHand {
  const onTheClock = askClock.after;
  let now = 0;
  let waiting: Wait[] = [];
  askClock.after = (ms, run) => {
    const wait = { due: now + ms, run };
    waiting.push(wait);
    return () => {
      waiting = waiting.filter((held) => held !== wait);
    };
  };
  return {
    pass: (ms) => {
      now += ms;
      const due = waiting.filter((held) => held.due <= now);
      waiting = waiting.filter((held) => held.due > now);
      for (const held of due) held.run();
    },
    release: () => {
      askClock.after = onTheClock;
    },
  };
}

interface Wait {
  readonly due: number;
  readonly run: () => void;
}
