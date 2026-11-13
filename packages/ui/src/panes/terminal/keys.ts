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

export function typedBy(chord: Chord): string | undefined {
  const key = chord.name === "space" ? " " : chord.name;
  if ([...key].length !== 1) return undefined;
  const typed = chord.ctrl ? controlCharacterOf(key) : chord.shift ? key.toUpperCase() : key;
  if (typed === undefined) return undefined;
  return chord.alt ? `${metaPrefix}${typed}` : typed;
}

const metaPrefix = "\x1b";

function controlCharacterOf(key: string): string | undefined {
  if (key === " ") return "\x00";
  const code = key.toUpperCase().charCodeAt(0);
  return code >= 0x40 && code <= 0x5f ? String.fromCharCode(code - 0x40) : undefined;
}
