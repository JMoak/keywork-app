import type { ToolRun } from "@keywork-app/client";
import type { CreatureLedgerEntry, DenyReason } from "@keywork-app/protocol";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { type AskChords, type AskPick, askChordsOf, denialFor } from "../../page/ask-card.tsx";
import { type AnswerBy, admitsAnswer } from "../../page/ask-card-guard.ts";
import { readWhyKeys } from "../../page/ask-card-why.ts";
import { answerHeldAsk, askingRun, type HeldAsk, reachAsk } from "../../shell/answer-ask.ts";
import type { ShellSeams } from "../registry.ts";
import { waitsOnKeeper } from "./ledger.ts";
import type { LedgerDesk } from "./ledger-desk.ts";

export interface LedgerAsks {
  keys(): AskChords;
  runOf(entry: CreatureLedgerEntry): ToolRun | undefined;
  wording(entry: CreatureLedgerEntry): boolean;
  answer(index: number, pick: AskPick, by: AnswerBy): void;
  giveReason(index: number, reason: DenyReason, by: AnswerBy): void;
  sendWords(note: string): void;
}

export interface LedgerAskSeams {
  readonly shell: Pick<ShellSeams, "store" | "keys">;
  readonly ledger: Pick<LedgerDesk, "rows" | "cursor" | "hold">;
  root(): HTMLElement | undefined;
  focused(): boolean;
  say(line: string | undefined): void;
  returnHome(): void;
}

export function askHeldBy(entry: CreatureLedgerEntry | undefined): HeldAsk | undefined {
  if (entry === undefined || entry.about.kind !== "ask" || !waitsOnKeeper(entry)) return undefined;
  return entry.session === null
    ? undefined
    : { sessionId: entry.session, callId: entry.about.callId };
}

export function createLedgerAsks(seams: LedgerAskSeams): LedgerAsks {
  const { shell, ledger } = seams;
  const [worded, setWorded] = createSignal<string>();
  const underTheCursor = (): HeldAsk | undefined =>
    seams.focused() ? askHeldBy(ledger.rows()[ledger.cursor()]) : undefined;
  const runHeldBy = (held: HeldAsk | undefined): ToolRun | undefined =>
    held === undefined ? undefined : askingRun(shell.store.projection(held.sessionId), held.callId);

  const answer = (
    index: number,
    pick: AskPick,
    by: AnswerBy,
    reason?: DenyReason,
    note?: string,
  ): void => {
    const held = askHeldBy(ledger.hold(index));
    if (held === undefined) return;
    const answering = { store: shell.store, approveKey: askChordsOf(shell.keys).approve };
    void answerHeldAsk(answering, held, pick, by, reason, note).then(seams.say);
  };
  const giveReason = (index: number, reason: DenyReason, by: AnswerBy): void => {
    if (reason !== "other") answer(index, "deny", by, reason);
    else if (admitsAnswer(by)) setWorded(askHeldBy(ledger.hold(index))?.callId);
  };

  createEffect(() => {
    for (const entry of ledger.rows()) {
      const held = askHeldBy(entry);
      if (held?.sessionId !== undefined) void shell.store.open(held.sessionId);
    }
  });
  onCleanup(reachAsk({ store: shell.store, root: seams.root, held: underTheCursor }));
  readWhyKeys(
    seams.root,
    () => (worded() === undefined ? underTheCursor()?.callId : undefined),
    (reason) => giveReason(ledger.cursor(), reason, "key"),
  );

  return {
    keys: () => askChordsOf(shell.keys),
    runOf: (entry) => runHeldBy(askHeldBy(entry)),
    wording: (entry) => worded() !== undefined && worded() === askHeldBy(entry)?.callId,
    answer,
    giveReason,
    sendWords: (note) => {
      setWorded(undefined);
      const denial = denialFor("other", note);
      answer(ledger.cursor(), "deny", "words", denial.reason, denial.note);
      seams.returnHome();
    },
  };
}
