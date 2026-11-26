import type { ToolRun } from "@keywork-app/client";
import type { CreatureLedgerEntry, DenyReason } from "@keywork-app/protocol";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { type AskChords, type AskPick, askChordsOf, denialFor } from "../../page/ask-card.tsx";
import { type AnswerBy, admitsAnswer } from "../../page/ask-card-guard.ts";
import { readWhyKeys } from "../../page/ask-card-why.ts";
import {
  type AskStore,
  answerHeldAsk,
  askingRun,
  type HeldAsk,
  reachAsk,
} from "../../shell/answer-ask.ts";
import type { ShellSeams } from "../registry.ts";
import { type ProjectStore, projectStoreOf } from "../stead/home-scope.ts";
import { projectNotOpenLine } from "./copy.ts";
import { projectOf, waitsOnKeeper } from "./ledger.ts";
import type { LedgerDesk } from "./ledger-desk.ts";

export interface LedgerAsks {
  keys(): AskChords;
  runOf(entry: CreatureLedgerEntry): ToolRun | undefined;
  notHere(entry: CreatureLedgerEntry): string | undefined;
  wording(entry: CreatureLedgerEntry): boolean;
  answer(index: number, pick: AskPick, by: AnswerBy): void;
  giveReason(index: number, reason: DenyReason, by: AnswerBy): void;
  sendWords(note: string): void;
}

export interface LedgerAskSeams {
  readonly shell: Pick<ShellSeams, "store" | "keys" | "steadHome">;
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

export function answeredFrom(
  shell: Pick<ShellSeams, "store" | "steadHome">,
  entry: CreatureLedgerEntry,
): ProjectStore | undefined {
  const project = entry.project ?? undefined;
  return project === undefined ? shell.store : projectStoreOf(shell.steadHome, project);
}

export function createLedgerAsks(seams: LedgerAskSeams): LedgerAsks {
  const { shell, ledger } = seams;
  const [worded, setWorded] = createSignal<string>();
  const cursorEntry = (): CreatureLedgerEntry | undefined => ledger.rows()[ledger.cursor()];
  const underTheCursor = (): HeldAsk | undefined =>
    seams.focused() ? askHeldBy(cursorEntry()) : undefined;
  const storeAt = (entry: CreatureLedgerEntry | undefined): AskStore =>
    (entry === undefined ? undefined : answeredFrom(shell, entry)) ?? shell.store;
  const storeUnderTheCursor: AskStore = {
    projection: (sessionId) => storeAt(cursorEntry()).projection(sessionId),
    answerAsk: (...answer) => storeAt(cursorEntry()).answerAsk(...answer),
  };
  const runOf = (entry: CreatureLedgerEntry): ToolRun | undefined => {
    const held = askHeldBy(entry);
    const store = answeredFrom(shell, entry);
    return held === undefined || store === undefined
      ? undefined
      : askingRun(store.projection(held.sessionId), held.callId);
  };
  const notHere = (entry: CreatureLedgerEntry): string | undefined =>
    askHeldBy(entry) !== undefined && answeredFrom(shell, entry) === undefined
      ? projectNotOpenLine(projectOf(entry.directory))
      : undefined;

  const answer = (
    index: number,
    pick: AskPick,
    by: AnswerBy,
    reason?: DenyReason,
    note?: string,
  ): void => {
    const entry = ledger.hold(index);
    const held = askHeldBy(entry);
    if (entry === undefined || held === undefined) return;
    const store = answeredFrom(shell, entry);
    if (store === undefined) {
      seams.say(notHere(entry));
      return;
    }
    const answering = { store, approveKey: askChordsOf(shell.keys).approve };
    void answerHeldAsk(answering, held, pick, by, reason, note).then(seams.say);
  };
  const giveReason = (index: number, reason: DenyReason, by: AnswerBy): void => {
    if (reason !== "other") answer(index, "deny", by, reason);
    else if (admitsAnswer(by)) setWorded(askHeldBy(ledger.hold(index))?.callId);
  };

  createEffect(() => {
    for (const entry of ledger.rows()) {
      const held = askHeldBy(entry);
      if (held?.sessionId !== undefined) void answeredFrom(shell, entry)?.open(held.sessionId);
    }
  });
  onCleanup(reachAsk({ store: storeUnderTheCursor, root: seams.root, held: underTheCursor }));
  readWhyKeys(
    seams.root,
    () => (worded() === undefined ? underTheCursor()?.callId : undefined),
    (reason) => giveReason(ledger.cursor(), reason, "key"),
  );

  return {
    keys: () => askChordsOf(shell.keys),
    runOf,
    notHere,
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
