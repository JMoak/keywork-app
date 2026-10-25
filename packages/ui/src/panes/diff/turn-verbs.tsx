import { type PathTurn, pathReading } from "@keywork-app/client";
import type { Redone, RestorePreviewReading, Undone } from "@keywork-app/protocol";
import { createEffect, createSignal, on, Show } from "solid-js";
import { counted } from "../../page/ledger.tsx";
import {
  isSettled,
  leftUnchanged,
  redoneNotice,
  refusalNotice,
  undoneNotice,
} from "../conversation/controls.ts";
import { othersClause, promptExcerpt, restorePreview } from "../conversation/turn-ledger.ts";
import { ConfirmLine } from "../overview/rows.tsx";
import type { KeyHints, ShellSeams } from "../registry.ts";

export interface TurnVerbs {
  undoable(): boolean | undefined;
  redoable(): boolean | undefined;
  notice(): string | undefined;
  asking(): string | undefined;
  undo(): Promise<void>;
  redo(): Promise<void>;
  answer(confirmed: boolean): void;
}

export function undoQuestion(
  redoKey: string,
  last?: PathTurn,
  preview?: RestorePreviewReading,
): string {
  if (last === undefined) {
    return `undo the last turn and put back the files it changed? ${redoKey} redoes it`;
  }
  const known = preview === undefined || typeof preview === "string" ? undefined : preview;
  const theirs =
    known === undefined || known.others.length === 0 ? "" : ` · ${othersClause(known.others)}`;
  return `undo turn ${last.turn}, "${promptExcerpt(last.text)}"? ${filesGoingBack(known?.files.length)}${theirs} · ${redoKey} redoes it`;
}

function filesGoingBack(files: number | undefined): string {
  if (files === undefined) return "the files it changed go back";
  return files === 0 ? "no file changes" : `${counted(files, "file")} go back`;
}

export function createTurnVerbs(
  shell: ShellSeams,
  sessionId: () => string,
  keys: KeyHints,
): TurnVerbs {
  const [notice, setNotice] = createSignal<string>();
  const [asking, setAsking] = createSignal<string>();
  const [answered, setAnswered] = createSignal<Reach>();
  const controls = () => shell.store.controlsOf(sessionId());
  const standing = () => shell.store.projection(sessionId()).standing;
  createEffect(on(standing, () => setAnswered(undefined), { defer: true }));
  const reach = (): Reach => answered() ?? controls();

  const afterwards = (reading: Undone | Redone): void => {
    setAnswered({ undoable: reading.undoable, redoable: reading.redoable });
    void shell.store.openChanges(sessionId(), { force: true });
  };

  const undoNow = async (): Promise<void> => {
    const reading = await shell.store.controls.undo(sessionId());
    if (isSettled(reading)) afterwards(reading);
    setNotice(isSettled(reading) ? undoneNotice(reading) : refusalNotice(reading));
  };

  return {
    undoable: () => reach().undoable,
    redoable: () => reach().redoable,
    notice,
    asking,
    undo: async () => {
      const nothing = reach().undoable === false;
      setNotice(nothing ? "nothing to undo" : undefined);
      if (!nothing) setAsking(await undoQuestionFor(shell, sessionId(), keys.chord("diff.redo")));
    },
    redo: async () => {
      if (reach().redoable === false) {
        setNotice("nothing to redo");
        return;
      }
      const reading = await shell.store.controls.redo(sessionId());
      if (isSettled(reading)) afterwards(reading);
      setNotice(isSettled(reading) ? redoneNotice : refusalNotice(reading));
    },
    answer: (confirmed) => {
      setAsking(undefined);
      if (confirmed) void undoNow();
      else setNotice(leftUnchanged);
    },
  };
}

export function TurnVerbRow(props: { verbs: TurnVerbs; keys: KeyHints }) {
  return (
    <div class="kw-diff-verbs">
      <span class="kw-diff-verb" data-enabled={enabledWord(props.verbs.undoable())}>
        {props.keys.chord("diff.undo")} undo
      </span>
      <span class="kw-diff-verb" data-enabled={enabledWord(props.verbs.redoable())}>
        {props.keys.chord("diff.redo")} redo
      </span>
      <Show
        when={props.verbs.asking()}
        fallback={
          <Show when={props.verbs.notice()}>
            {(text) => <output class="kw-diff-verb-notice">{text()}</output>}
          </Show>
        }
      >
        {(question) => (
          <ConfirmLine
            question={question()}
            onConfirm={() => props.verbs.answer(true)}
            onCancel={() => props.verbs.answer(false)}
          />
        )}
      </Show>
    </div>
  );
}

async function undoQuestionFor(shell: ShellSeams, id: string, redoKey: string): Promise<string> {
  await shell.store.openTree(id).catch(() => undefined);
  const snapshot = shell.store.tree(id).snapshot;
  const last = snapshot === undefined ? undefined : pathReading(snapshot).turns.at(-1);
  if (last === undefined) return undoQuestion(redoKey);
  const preview = await restorePreview(shell, id, last.turn);
  return undoQuestion(redoKey, last, preview);
}

interface Reach {
  readonly undoable: boolean | undefined;
  readonly redoable: boolean | undefined;
}

function enabledWord(enabled: boolean | undefined): "yes" | "no" | "unknown" {
  if (enabled === undefined) return "unknown";
  return enabled ? "yes" : "no";
}
