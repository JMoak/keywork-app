import { For } from "solid-js";
import "./first-run.css";

export interface KeyChords {
  chord(action: string): string;
}

export interface Lesson {
  readonly chord: string;
  readonly does: string;
}

export const firstRunActions = ["pane.split", "tree.summon", "palette.go", "help.toggle"] as const;

export function firstRunLessons(keys: KeyChords): Lesson[] {
  return [
    { chord: "enter", does: "sends what you type" },
    { chord: keys.chord("pane.split"), does: "opens a session beside this one" },
    { chord: keys.chord("tree.summon"), does: "lists your sessions and their trees" },
    { chord: keys.chord("palette.go"), does: "goes anywhere" },
    { chord: keys.chord("help.toggle"), does: "shows every key" },
  ];
}

export function FirstRun(props: { keys: KeyChords }) {
  return (
    <dl class="kw-first-run" aria-label="five keys to start">
      <For each={firstRunLessons(props.keys)}>
        {(lesson) => (
          <div class="kw-first-run-row">
            <dt class="kw-first-run-chord">{lesson.chord}</dt>
            <dd class="kw-first-run-does">{lesson.does}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}
