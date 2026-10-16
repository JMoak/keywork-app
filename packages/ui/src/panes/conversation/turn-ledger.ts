import {
  latestLedger,
  type PathReading,
  type PathTurn,
  pathReading,
  type RestoreReach,
  restoreReach,
  type TranscriptLedger,
  type TreeState,
  type TurnLedger,
  transcriptLedger,
} from "@keywork-app/client";
import type { EntryRefusal, TurnRestored } from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal } from "solid-js";
import { counted, type LedgerVerbs, ribbonText } from "../../page/ledger.tsx";
import type { ShellSeams } from "../registry.ts";
import type { ControlAsk } from "./control-row.tsx";
import { isSettled, leftUnchanged, refusalNotice } from "./controls.ts";

export interface TurnLedgerPane {
  ledger(): TranscriptLedger;
  readonly verbs: LedgerVerbs;
  readonly actions: Readonly<Record<string, () => void>>;
}

export interface LedgerConfirm {
  readonly ask: ControlAsk;
  readonly answer: (reply: string | boolean) => Promise<void>;
}

export function createTurnLedger(
  shell: ShellSeams,
  sessionId: () => string | undefined,
  say: (...lines: string[]) => void,
  confirm: (pending: LedgerConfirm) => void,
): TurnLedgerPane {
  const store = shell.store;
  const path = (): PathReading | undefined => pathOf(store.tree(sessionId()));
  const ledger = createMemo(() =>
    transcriptLedger(store.projection(sessionId()), path(), store.changes(sessionId())),
  );
  const [chosen, setChosen] = createSignal<number>();

  createEffect(() => {
    const id = sessionId();
    if (id === undefined) return;
    void store.openTree(id);
    void store.openChanges(id);
  });

  const placeNow = async (id: string, turn: TurnLedger): Promise<PathTurn | undefined> => {
    await store.openTree(id, { force: true });
    return ledger().turns.find((fresh) => fresh.head === turn.head)?.place;
  };

  const restore = async (id: string, turn: TurnLedger): Promise<void> => {
    const place = await placeNow(id, turn);
    const reading = path();
    if (place === undefined || reading === undefined) return say(unplacedNotice);
    const reach = restoreReach(reading, store.changes(id), place.turn);
    confirm({
      ask: { kind: "confirm", question: restoreQuestion(place, reach) },
      answer: async (agreed) => {
        if (agreed !== true) return say(leftUnchanged);
        const restored = await store.controls.restoreTurn(id, place.turn);
        say(isSettled(restored) ? restoredNotice(restored) : refusalNotice(restored));
      },
    });
  };

  const fork = async (id: string, turn: TurnLedger): Promise<void> => {
    const place = await placeNow(id, turn);
    if (place === undefined) return say(unplacedNotice);
    const forked = await store.fork(id, place.leafId);
    if (typeof forked === "string") return say(forkRefusedNotice(forked));
    say(forkedNotice(place.turn));
    shell.sessions.openSession(forked.sessionId);
  };

  const run =
    (verb: (id: string, turn: TurnLedger) => Promise<void>) =>
    (turn: TurnLedger): void => {
      const id = sessionId();
      setChosen(undefined);
      if (id !== undefined) void verb(id, turn);
    };
  const onChosenTurn = (verb: (turn: TurnLedger) => void) => (): void => {
    const turn = chosenTurn(ledger(), chosen());
    if (turn !== undefined) verb(turn);
    else say(ledger().turns.length === 0 ? noSettledTurnNotice : unplacedNotice);
  };

  const verbs: LedgerVerbs = {
    restore: run(restore),
    fork: run(fork),
    choose: (turn) => setChosen(turn.head),
  };
  return {
    ledger,
    verbs,
    actions: {
      "conversation.restore-turn": onChosenTurn(verbs.restore),
      "conversation.fork-turn": onChosenTurn(verbs.fork),
    },
  };
}

export function turnRibbon(shell: ShellSeams, sessionId: string | undefined): string | undefined {
  const store = shell.store;
  return ribbonText(
    latestLedger(
      store.projection(sessionId),
      pathOf(store.tree(sessionId)),
      store.changes(sessionId),
    ),
  );
}

export function restoreQuestion(place: PathTurn, reach: RestoreReach): string {
  return `restore to before turn ${place.turn}, "${excerpt(place.text)}"? ${goingBack(reach)} · redo brings them back · y/n`;
}

export function restoredNotice(restored: TurnRestored): string {
  return [
    `restored to before turn ${restored.turn}`,
    `${counted(restored.undoneTurns, "turn")} went back`,
    restored.files.length === 0
      ? restored.filesNote
      : `${counted(restored.files.length, "file")} put back`,
    "the prompt is back in the composer",
  ].join(" · ");
}

export function forkedNotice(turn: number): string {
  return `forked after turn ${turn} · the fork opens as its own session`;
}

export function forkRefusedNotice(refusal: EntryRefusal): string {
  return refusal === "missing"
    ? "this session is gone"
    : "the server no longer knows that turn's entry · nothing was forked";
}

export const unplacedNotice =
  "that turn has no place on the server's path · it was folded or taken back";

export const noSettledTurnNotice = "no turn has settled here yet";

function chosenTurn(ledger: TranscriptLedger, chosen: number | undefined): TurnLedger | undefined {
  const placed = ledger.turns.filter((turn) => turn.place !== undefined);
  return placed.find((turn) => turn.head === chosen) ?? placed.at(-1);
}

function pathOf(tree: TreeState): PathReading | undefined {
  return tree.snapshot === undefined ? undefined : pathReading(tree.snapshot);
}

function goingBack(reach: RestoreReach): string {
  const turns = counted(reach.turns, "turn");
  if (reach.files === undefined || reach.files === 0) {
    return `${turns} ${reach.turns === 1 ? "goes" : "go"} back`;
  }
  return `${turns} and ${counted(reach.files, "file")} go back`;
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > excerptLimit ? `${flat.slice(0, excerptLimit - 1)}…` : flat;
}

const excerptLimit = 40;
