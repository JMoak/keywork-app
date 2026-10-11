import { createSignal, Show } from "solid-js";
import { isSettled, redoneNotice, refusalNotice, undoneNotice } from "../conversation/controls.ts";
import type { KeyHints, ShellSeams } from "../registry.ts";

export interface TurnVerbs {
  undoable(): boolean | undefined;
  redoable(): boolean | undefined;
  notice(): string | undefined;
  undo(): Promise<void>;
  redo(): Promise<void>;
}

export function createTurnVerbs(shell: ShellSeams, sessionId: () => string): TurnVerbs {
  const [notice, setNotice] = createSignal<string>();
  const controls = () => shell.store.controlsOf(sessionId());
  const afterwards = (): void => {
    void shell.store.openChanges(sessionId(), { force: true });
  };
  return {
    undoable: () => controls().undoable,
    redoable: () => controls().redoable,
    notice,
    undo: async () => {
      if (controls().undoable === false) {
        setNotice("nothing to undo");
        return;
      }
      const reading = await shell.store.controls.undo(sessionId());
      setNotice(isSettled(reading) ? undoneNotice(reading) : refusalNotice(reading));
      if (isSettled(reading)) afterwards();
    },
    redo: async () => {
      if (controls().redoable === false) {
        setNotice("nothing to redo");
        return;
      }
      const reading = await shell.store.controls.redo(sessionId());
      setNotice(isSettled(reading) ? redoneNotice : refusalNotice(reading));
      if (isSettled(reading)) afterwards();
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
      <Show when={props.verbs.notice()}>
        {(text) => <output class="kw-diff-verb-notice">{text()}</output>}
      </Show>
    </div>
  );
}

function enabledWord(enabled: boolean | undefined): "yes" | "no" | "unknown" {
  if (enabled === undefined) return "unknown";
  return enabled ? "yes" : "no";
}
