export interface Chord {
  readonly name: string;
  readonly ctrl: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

export type KeyEvent = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "isComposing"
>;

export type PhysicalKeyEvent = KeyEvent & Partial<Pick<KeyboardEvent, "code">>;

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
  const canonical = canonicalName(name);
  const unshifted = usShiftedPunctuation[canonical];
  return {
    name: unshifted ?? canonical,
    ctrl: modifiers.has("ctrl"),
    shift: unshifted !== undefined || modifiers.has("shift"),
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

export function chordLabel(spec: string): string {
  const chord = parseChord(spec);
  const typed = spec.split("+").at(-1) ?? "";
  return usShiftedPunctuation[typed] === undefined
    ? formatChord(chord)
    : formatChord({ ...chord, name: typed, shift: false });
}

export function chordsEqual(left: Chord, right: Chord): boolean {
  return (
    left.name === right.name &&
    left.ctrl === right.ctrl &&
    left.shift === right.shift &&
    left.alt === right.alt
  );
}

export function chordOfKey(event: KeyEvent): Chord | undefined {
  if (event.isComposing) return undefined;
  const name = keyName(event.key);
  if (name === undefined) return undefined;
  const ctrl = event.ctrlKey || event.metaKey;
  const unshifted = event.shiftKey ? usShiftedPunctuation[name] : undefined;
  if (unshifted !== undefined) return { name: unshifted, ctrl, shift: true, alt: event.altKey };
  return {
    name,
    ctrl,
    shift:
      event.shiftKey && (ctrl || event.altKey || !isPrintable(event.key) || isLetter(event.key)),
    alt: event.altKey,
  };
}

export function chordsOfKey(event: PhysicalKeyEvent): readonly Chord[] {
  const typed = chordOfKey(event);
  if (typed === undefined) return [];
  const physical = physicalChordOf(event);
  return physical === undefined || chordsEqual(physical, typed) ? [typed] : [typed, physical];
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

const usShiftedPunctuation: Readonly<Record<string, string>> = {
  "~": "`",
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  _: "-",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
};

const punctuationCodes: Readonly<Record<string, string>> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

const modifierKeys = new Set(["control", "shift", "alt", "meta", "capslock", "numlock", "os"]);

function keyName(key: string): string | undefined {
  const lower = key.toLowerCase();
  if (modifierKeys.has(lower) || lower === "dead" || lower === "unidentified") return undefined;
  return canonicalName(keyNames[lower] ?? lower);
}

function physicalChordOf(event: PhysicalKeyEvent): Chord | undefined {
  const name = event.code === undefined ? undefined : nameOfCode(event.code);
  if (name === undefined) return undefined;
  return { name, ctrl: event.ctrlKey || event.metaKey, shift: event.shiftKey, alt: event.altKey };
}

function nameOfCode(code: string): string | undefined {
  const [, letter, digit] = code.match(/^(?:Key([A-Z])|Digit([0-9]))$/) ?? [];
  return letter?.toLowerCase() ?? digit ?? punctuationCodes[code];
}

function canonicalName(name: string): string {
  return keyNames[name] ?? name;
}

function isPrintable(key: string): boolean {
  return [...key].length === 1;
}

function isLetter(key: string): boolean {
  return key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}
