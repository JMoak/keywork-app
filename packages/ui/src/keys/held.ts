import { type Chord, type ModifierKeys, modifiersHeld, parseChord } from "./chord.ts";

export function holdsModifiersOf(event: ModifierKeys, labels: readonly string[]): boolean {
  const held = modifiersHeld(event);
  return labels
    .flatMap(modifiedChord)
    .some(
      (chord) => chord.ctrl === held.ctrl && chord.alt === held.alt && chord.shift === held.shift,
    );
}

function modifiedChord(label: string): Chord[] {
  if (label.includes(" ")) return [];
  const chord = parseChord(label);
  return chord.ctrl || chord.alt ? [chord] : [];
}
