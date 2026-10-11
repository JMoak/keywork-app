import { type Accessor, createEffect, createSignal } from "solid-js";
import type { ShellSeams } from "../registry.ts";

export const noWorkingSession = "no session to act on · focus a conversation, then come back";

export function summonedFrom(shell: ShellSeams): { sessionId?: string } {
  const sessionId = shell.currentSession();
  return sessionId === undefined ? {} : { sessionId };
}

export function workingSession(
  shell: ShellSeams,
  summonedSession: string | undefined,
): Accessor<string | undefined> {
  const [latest, setLatest] = createSignal(summonedSession);
  createEffect(() => {
    const focused = shell.currentSession();
    if (focused !== undefined) setLatest(focused);
  });
  return latest;
}
