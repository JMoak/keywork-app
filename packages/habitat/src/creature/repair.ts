import type { SessionId, Thread } from "../world/types.ts";

export const repairAfter = 3;

export type RepairChoice = "try-again" | "try-differently" | "set-it-down";

export const repairChoices: readonly RepairChoice[] = [
  "try-again",
  "try-differently",
  "set-it-down",
];

export interface RepairQuestion {
  readonly thread: SessionId;
  readonly title: string;
  readonly failure: string;
  readonly attempts: number;
  readonly question: string;
  readonly choices: readonly RepairChoice[];
}

export function repairOf(thread: Thread): RepairQuestion | undefined {
  if (thread.failure === undefined || thread.failures < repairAfter) return undefined;
  const title = thread.title === "" ? "this thread" : thread.title;
  return {
    thread: thread.id,
    title,
    failure: thread.failure.message,
    attempts: thread.failures,
    question: `${title} failed ${timesWord(thread.failures)} running, the same way each time: ${thread.failure.message}. Try again, try differently, or set it down?`,
    choices: repairChoices,
  };
}

function timesWord(count: number): string {
  return count === 3 ? "three times" : `${count} times`;
}
