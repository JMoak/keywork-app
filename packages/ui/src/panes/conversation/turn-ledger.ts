import {
  countsOf,
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
import type {
  EntryRefusal,
  OtherSessionFiles,
  RestoreCandidate,
  RestorePreview,
  RestorePreviewReading,
  RestoreScope,
  TurnRestored,
  TurnRestoreReading,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal } from "solid-js";
import { counted, type LedgerVerbs, ribbonText } from "../../page/ledger.tsx";
import type { ShellSeams } from "../registry.ts";
import { type ConfirmItem, type ControlAsk, widenedAnswer } from "./control-row.tsx";
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
  seed: (text: string) => void,
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

  const restoreUnder = (id: string, turn: number, scope: RestoreScope) =>
    scope === "session"
      ? store.controls.restoreTurn(id, turn)
      : whenRestored(shell.client.restoreTurn(id, turn, scope), async (restored) => {
          seed(restored.prompt.text);
          await store.reload(id);
        });

  const restore = async (id: string, turn: TurnLedger): Promise<void> => {
    const place = await placeNow(id, turn);
    const reading = path();
    if (place === undefined || reading === undefined) return say(unplacedNotice);
    const preview = settledPreview(await restorePreview(shell, id, place.turn));
    const staying = preview?.files.filter((file) => !file.goesBack) ?? [];
    const everything =
      staying.length === 0
        ? undefined
        : settledPreview(await restorePreview(shell, id, place.turn, "everything"));
    const reach = previewReach(preview) ?? restoreReach(reading, store.changes(id), place.turn);
    confirm({
      ask: restoreAsk(place, reach, preview, everything),
      answer: async (reply) => {
        const scope = scopeOfReply(reply);
        if (scope === undefined) return say(leftUnchanged);
        const restored = await restoreUnder(id, place.turn, scope);
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

export function restoreAsk(
  place: PathTurn,
  reach: RestoreReach,
  preview: RestorePreview | undefined,
  everything?: RestorePreview | undefined,
): ControlAsk {
  const files = preview?.files ?? [];
  const going = files.filter((file) => file.goesBack);
  const staying = files.filter((file) => !file.goesBack);
  const others = preview?.others ?? [];
  const widerOthers = everything?.others ?? others;
  return {
    kind: "confirm",
    question: restoreQuestion(place, reach, others, staying.length),
    items: [...going.map((file) => goingBackItem(file, others)), ...staying.map(stayingItem)],
    widen:
      staying.length === 0
        ? undefined
        : {
            key: widenKey,
            question: everythingQuestion(place, reach, staying.length, widerOthers),
            items: [
              ...staying.map(alsoGoingItem),
              ...going.map((file) => goingBackItem(file, widerOthers)),
            ],
          },
  };
}

export function restoreQuestion(
  place: PathTurn,
  reach: RestoreReach,
  others: readonly OtherSessionFiles[] = [],
  staying = 0,
): string {
  const theirs = others.length === 0 ? "" : ` · ${othersClause(others)}`;
  const kept = staying === 0 ? "" : ` · ${stayingClause(staying)}`;
  const widen = staying === 0 ? "" : ` · ${widenKey} for everything`;
  return `restore to before turn ${place.turn}, "${promptExcerpt(place.text)}"? ${reachClause(reach)}${theirs}${kept} · redo brings them back · y/n${widen}`;
}

export function everythingQuestion(
  place: PathTurn,
  reach: RestoreReach,
  staying: number,
  others: readonly OtherSessionFiles[] = [],
): string {
  const files = counted((reach.files ?? 0) + staying, "file");
  const theirs = others.length === 0 ? "" : ` · ${othersClause(others)}`;
  return `restore everything to before turn ${place.turn}? ${counted(reach.turns, "turn")} and ${files} go back, ${staying} of them never changed by this session${theirs} · redo brings them back · y restores everything · n steps back`;
}

export const widenKey = "e";

export function scopeOfReply(reply: string | boolean): RestoreScope | undefined {
  if (reply === true) return "session";
  return reply === widenedAnswer ? "everything" : undefined;
}

export function goingBackCount(preview: RestorePreviewReading | undefined): number | undefined {
  return settledPreview(preview)?.files.filter((file) => file.goesBack).length;
}

export function restorePreview(
  shell: Pick<ShellSeams, "client">,
  id: string,
  turn: number,
  scope?: RestoreScope,
): Promise<RestorePreviewReading | undefined> {
  return Promise.resolve()
    .then(() => shell.client.previewRestore(id, turn, scope))
    .catch(() => undefined);
}

export function othersClause(others: readonly OtherSessionFiles[]): string {
  const [only] = others;
  if (others.length === 1 && only !== undefined) {
    return `it also undoes ${counted(only.paths.length, "file")} "${promptExcerpt(only.title)}" changed`;
  }
  return `it also undoes files ${others.length} other sessions changed`;
}

export function restoredNotice(restored: TurnRestored): string {
  const restoredWhat = restored.scope === "everything" ? "restored everything" : "restored";
  return [
    `${restoredWhat} to before turn ${restored.turn}`,
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

function goingBackItem(file: RestoreCandidate, others: readonly OtherSessionFiles[]): ConfirmItem {
  const other = others.find((session) => session.paths.includes(file.path));
  const shared = other === undefined ? "" : ` · "${promptExcerpt(other.title)}" changed it too`;
  return { text: file.path, note: `${countsOf(file)} · goes back${shared}` };
}

function stayingItem(file: RestoreCandidate): ConfirmItem {
  return {
    text: file.path,
    note: `${countsOf(file)} · stays · this session never changed it`,
    staying: true,
  };
}

function alsoGoingItem(file: RestoreCandidate): ConfirmItem {
  return {
    text: file.path,
    note: `${countsOf(file)} · also goes back · this session never changed it`,
    flagged: true,
  };
}

function stayingClause(staying: number): string {
  return staying === 1
    ? "1 file this session never changed stays as it is"
    : `${staying} files this session never changed stay as they are`;
}

function settledPreview(preview: RestorePreviewReading | undefined): RestorePreview | undefined {
  return preview === undefined || typeof preview === "string" ? undefined : preview;
}

async function whenRestored(
  pending: Promise<TurnRestoreReading>,
  after: (restored: TurnRestored) => Promise<void>,
): Promise<TurnRestoreReading> {
  const reading = await pending;
  if (isSettled(reading)) await after(reading);
  return reading;
}

function previewReach(preview: RestorePreview | undefined): RestoreReach | undefined {
  if (preview === undefined) return undefined;
  return {
    turns: preview.undoneTurns,
    files: preview.files.filter((file) => file.goesBack).length,
  };
}

function chosenTurn(ledger: TranscriptLedger, chosen: number | undefined): TurnLedger | undefined {
  const placed = ledger.turns.filter((turn) => turn.place !== undefined);
  return placed.find((turn) => turn.head === chosen) ?? placed.at(-1);
}

function pathOf(tree: TreeState): PathReading | undefined {
  return tree.snapshot === undefined ? undefined : pathReading(tree.snapshot);
}

function reachClause(reach: RestoreReach): string {
  const turns = counted(reach.turns, "turn");
  if (reach.files === undefined || reach.files === 0) {
    return `${turns} ${reach.turns === 1 ? "goes" : "go"} back`;
  }
  return `${turns} and ${counted(reach.files, "file")} go back`;
}

export function promptExcerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > excerptLimit ? `${flat.slice(0, excerptLimit - 1)}…` : flat;
}

const excerptLimit = 40;
