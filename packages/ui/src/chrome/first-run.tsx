import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import { For } from "solid-js";
import { useProductProfile } from "./product.ts";
import "./first-run.css";

export interface KeyChords {
  chord(action: string): string;
}

export interface Lesson {
  readonly chord: string;
  readonly does: string;
}

export const firstRunActions = ["pane.split", "tree.summon", "palette.go", "help.toggle"] as const;

export function firstRunLessons(
  keys: KeyChords,
  profile: ProductProfile = keyworkProfile,
): Lesson[] {
  return [
    ...firstLessonOf(keys, profile),
    { chord: keys.chord("palette.go"), does: "goes anywhere" },
    { chord: keys.chord("help.toggle"), does: "shows every key" },
  ];
}

export function FirstRun(props: { keys: KeyChords }) {
  const profile = useProductProfile();
  return (
    <dl class="kw-first-run" aria-label="five keys to start">
      <For each={firstRunLessons(props.keys, profile)}>
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

function firstLessonOf(keys: KeyChords, profile: ProductProfile): Lesson[] {
  if (profile.startup === "creature") {
    return [
      { chord: keys.chord("stead.summon"), does: "opens the stead, where your creatures work" },
      { chord: keys.chord("onboarding.start"), does: "makes a creature" },
      { chord: keys.chord("pane.split"), does: "opens a conversation beside it" },
    ];
  }
  return [
    { chord: "enter", does: "sends what you type" },
    { chord: keys.chord("pane.split"), does: "opens a session beside this one" },
    { chord: keys.chord("tree.summon"), does: "lists your sessions and their trees" },
  ];
}
