import {
  countsOf,
  latestLedger,
  type PathReading,
  type PathTurn,
  pathReading,
  type RestoreReach,
  restoreReach,
  type SessionProjection,
  type TranscriptLedger,
  type TreeState,
  type TurnLedger,
  transcriptLedger,
} from "@keywork-app/client";
import type {
  ChangedPath,
  EntryRefusal,
  OtherSessionFiles,
  RestorePreviewReading,
  TurnRestored,
} from "@keywork-app/protocol";
import { createEffect, createMemo, createSignal } from "solid-js";
import { counted, type LedgerVerbs, ribbonText } from "../../page/ledger.tsx";
import type { ShellSeams } from "../registry.ts";
import type { ConfirmItem, ControlAsk } from "./control-row.tsx";
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
    const preview = await restorePreview(shell, id, place.turn);
    const reach = previewReach(preview) ?? restoreReach(reading, store.changes(id), place.turn);
    const work = toolWorkFrom(store.projection(id), ledger(), place.turn);
    const going = goingBack(preview, work);
    const unwritten = { count: going.filter(isFlagged).length, commanded: work.commanded };
    confirm({
      ask: {
        kind: "confirm",
        question: restoreQuestion(place, reach, othersIn(preview), unwritten),
        items: going,
      },
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

export function restoreQuestion(
  place: PathTurn,
  reach: RestoreReach,
  others: readonly OtherSessionFiles[] = [],
  unwritten?: UnwrittenFiles,
): string {
  const theirs = others.length === 0 ? "" : ` · ${othersClause(others)}`;
  const yours =
    unwritten === undefined || unwritten.count === 0 ? "" : ` · ${unwrittenClause(unwritten)}`;
  return `restore to before turn ${place.turn}, "${promptExcerpt(place.text)}"? ${reachClause(reach)}${theirs}${yours} · redo brings them back · y/n`;
}

export interface ToolWork {
  readonly written: ReadonlySet<string>;
  readonly commanded: boolean;
}

export interface UnwrittenFiles {
  readonly count: number;
  readonly commanded: boolean;
}

export function toolWorkFrom(
  projection: SessionProjection,
  ledger: TranscriptLedger,
  turn: number,
): ToolWork {
  const runs = ledger.turns
    .filter((settled) => (settled.place?.turn ?? 0) >= turn)
    .flatMap((settled) => projection.entries.slice(settled.head, settled.end + 1))
    .flatMap((entry) => (entry.kind === "tool" && entry.run.phase === "done" ? [entry.run] : []));
  return {
    written: new Set(
      runs.filter((run) => fileWriters.has(run.name)).map((run) => workspacePath(run.subject)),
    ),
    commanded: runs.some((run) => commandRunners.has(run.name)),
  };
}

export function goingBack(
  preview: RestorePreviewReading | undefined,
  work: ToolWork,
): ConfirmItem[] {
  if (preview === undefined || typeof preview === "string") return [];
  return preview.files
    .map((file) => goingBackItem(file, preview.others, work))
    .sort((a, b) => Number(isFlagged(b)) - Number(isFlagged(a)));
}

export function restorePreview(
  shell: Pick<ShellSeams, "client">,
  id: string,
  turn: number,
): Promise<RestorePreviewReading | undefined> {
  return Promise.resolve()
    .then(() => shell.client.previewRestore(id, turn))
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

function goingBackItem(
  file: ChangedPath,
  others: readonly OtherSessionFiles[],
  work: ToolWork,
): ConfirmItem {
  const counts = countsOf(file);
  if (writtenBy(work, file.path)) {
    return { text: file.path, note: `${counts} · this session wrote it` };
  }
  const other = others.find((session) => session.paths.includes(file.path));
  if (other !== undefined) {
    return { text: file.path, note: `${counts} · "${promptExcerpt(other.title)}" changed it` };
  }
  const whose = work.commanded
    ? "no write or edit touched it · a command or your own change"
    : "this session never wrote it · your own change?";
  return { text: file.path, note: `${counts} · ${whose}`, flagged: true };
}

function isFlagged(item: ConfirmItem): boolean {
  return item.flagged === true;
}

function writtenBy(work: ToolWork, path: string): boolean {
  const wanted = workspacePath(path);
  return [...work.written].some(
    (written) =>
      written === wanted || clippedPrefix(written, wanted) || wanted.endsWith(`/${written}`),
  );
}

function clippedPrefix(subject: string, path: string): boolean {
  return subject.endsWith("…") && path.startsWith(subject.slice(0, -1));
}

function workspacePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function unwrittenClause(unwritten: UnwrittenFiles): string {
  const never = unwritten.commanded ? "no write or edit touched" : "this session never wrote";
  return `${unwritten.count} of them ${never}`;
}

const fileWriters: ReadonlySet<string> = new Set(["write", "edit"]);
const commandRunners: ReadonlySet<string> = new Set(["bash"]);

function previewReach(preview: RestorePreviewReading | undefined): RestoreReach | undefined {
  if (preview === undefined || typeof preview === "string") return undefined;
  return { turns: preview.undoneTurns, files: preview.files.length };
}

function othersIn(preview: RestorePreviewReading | undefined): readonly OtherSessionFiles[] {
  return preview === undefined || typeof preview === "string" ? [] : preview.others;
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
