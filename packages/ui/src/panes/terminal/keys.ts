import { type Chord, chordsEqual, chordsOfKey, parseChord } from "../../keys/chord.ts";

export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "isComposing" | "type"
> &
  Partial<Pick<KeyboardEvent, "code">>;

export function terminalKeeps(event: KeyEventLike, leader: string): boolean {
  const leaderKey = leaderChord(leader);
  return !chordsOfKey(event).some((chord) => chordsEqual(chord, leaderKey));
}

export function leaderChord(leader: string): Chord {
  return parseChord(leader);
}
