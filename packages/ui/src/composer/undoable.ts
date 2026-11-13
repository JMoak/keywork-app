import type { TextSpan } from "./graphemes.ts";

export function editUndoably(input: HTMLTextAreaElement, span: TextSpan, text: string): void {
  if (span.start === span.end && text === "") return;
  input.setSelectionRange(span.start, span.end);
  const recorded = holdsFocus(input) && runEditCommand(text === "" ? "delete" : "insertText", text);
  if (!recorded) input.setRangeText(text, span.start, span.end, "end");
}

export function redoLastUndo(): boolean {
  return runEditCommand("redo");
}

function holdsFocus(input: HTMLTextAreaElement): boolean {
  return input.ownerDocument.activeElement === input;
}

// Chromium puts an edit on a text field's undo stack only when it arrives as an editing command.
function runEditCommand(command: "insertText" | "delete" | "redo", value?: string): boolean {
  return typeof document.execCommand === "function" && document.execCommand(command, false, value);
}
