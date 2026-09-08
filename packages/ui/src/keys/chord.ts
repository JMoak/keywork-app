export interface Chord {
  readonly name: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

export class ChordError extends Error {
  override readonly name = "ChordError";
}

export function parseChord(spec: string): Chord {
  const parts = spec.toLowerCase().split("+");
  const name = parts.at(-1);
  if (name === undefined || name === "") throw new ChordError(`invalid chord "${spec}"`);
  const modifiers = new Set(parts.slice(0, -1));
  for (const modifier of modifiers) {
    if (!knownModifiers.has(modifier)) {
      throw new ChordError(`unknown modifier "${modifier}" in chord "${spec}"`);
    }
  }
  return {
    name: canonicalName(name),
    ctrl: modifiers.has("ctrl"),
    shift: modifiers.has("shift"),
    alt: modifiers.has("alt") || modifiers.has("meta"),
  };
}

export function formatChord(chord: Chord): string {
  return [
    ...(chord.ctrl ? ["ctrl"] : []),
    ...(chord.shift ? ["shift"] : []),
    ...(chord.alt ? ["alt"] : []),
    chord.name,
  ].join("+");
}

export function chordsEqual(left: Chord, right: Chord): boolean {
  return (
    left.name === right.name &&
    left.ctrl === right.ctrl &&
    left.shift === right.shift &&
    left.alt === right.alt
  );
}

export function chordOfKey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "isComposing">,
): Chord | undefined {
  if (event.isComposing) return undefined;
  const name = keyName(event.key);
  if (name === undefined) return undefined;
  const chorded = event.ctrlKey || event.metaKey || event.altKey;
  return {
    name,
    ctrl: event.ctrlKey || event.metaKey,
    shift: event.shiftKey && (chorded || !isPrintable(event.key)),
    alt: event.altKey,
  };
}

export function isPlainText(chord: Chord): boolean {
  return !chord.ctrl && !chord.alt && chord.name.length === 1;
}

const knownModifiers = new Set(["ctrl", "shift", "alt", "meta"]);

const keyNames: Record<string, string> = {
  " ": "space",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  esc: "escape",
  return: "enter",
  del: "delete",
};

const modifierKeys = new Set(["control", "shift", "alt", "meta", "capslock", "numlock", "os"]);

function keyName(key: string): string | undefined {
  const lower = key.toLowerCase();
  if (modifierKeys.has(lower) || lower === "dead" || lower === "unidentified") return undefined;
  return canonicalName(keyNames[lower] ?? lower);
}

function canonicalName(name: string): string {
  return keyNames[name] ?? name;
}

function isPrintable(key: string): boolean {
  return [...key].length === 1;
}
