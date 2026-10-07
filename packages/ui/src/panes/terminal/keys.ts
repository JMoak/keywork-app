import { type Chord, chordOfKey, chordsEqual, parseChord } from "../../keys/chord.ts";

export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "isComposing" | "type"
>;

export function terminalKeeps(event: KeyEventLike, leader: string): boolean {
  const chord = chordOfKey(event);
  if (chord === undefined) return true;
  return !chordsEqual(chord, leaderChord(leader));
}

export function leaderChord(leader: string): Chord {
  return parseChord(leader);
}
