import { fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { shareDelegatedEvents } from "../surfaces/runtime/delegation.ts";
import { openChild } from "../surfaces/runtime/testing.ts";
import { Composer } from "./composer.tsx";
import { redoLastUndo } from "./undoable.ts";

interface EditCommand {
  readonly command: string;
  readonly value: string | undefined;
  readonly selected: string;
}

afterEach(() => {
  Reflect.deleteProperty(document, "execCommand");
});

describe("composer edits the undo stack can take back", () => {
  it("sends a cluster erase through the editing command, selecting just that cluster", () => {
    const { input, commands } = mounted();
    typeInto(input, "hello 👍🏾");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(commands).toEqual([{ command: "delete", value: "", selected: "👍🏾" }]);
    expect(input.value).toBe("hello ");
    input.setSelectionRange(0, 0);
    fireEvent.keyDown(input, { key: "Delete" });
    expect(commands.at(-1)).toEqual({ command: "delete", value: "", selected: "h" });
    expect(input.value).toBe("ello ");
  });

  it("inserts a paste, held or inline, through the editing command", () => {
    const { input, commands } = mounted();
    typeInto(input, "look: ");
    fireEvent.paste(input, { clipboardData: { getData: () => "short\r\npaste" } });
    expect(commands).toEqual([{ command: "insertText", value: "short\npaste", selected: "" }]);
    const flood = Array.from({ length: 9 }, (_, line) => `line ${line}`).join("\n");
    fireEvent.paste(input, { clipboardData: { getData: () => flood } });
    expect(commands.at(-1)?.value).toBe("[pasted #1, 9 lines, 62 B]");
    expect(input.value).toBe("look: short\npaste[pasted #1, 9 lines, 62 B]");
  });

  it("clears a sent draft and recalls a prompt through the editing command, keeping one history", () => {
    const { input, commands } = mounted();
    typeInto(input, "say ok");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(commands).toEqual([{ command: "delete", value: "", selected: "say ok" }]);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(commands.at(-1)).toEqual({ command: "insertText", value: "say ok", selected: "" });
    expect(input.value).toBe("say ok");
  });

  it("falls back to a plain edit where no editing command runs", () => {
    const { input, commands } = mounted();
    typeInto(input, "hello");
    input.blur();
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(commands).toEqual([]);
    expect(input.value).toBe("hell");
  });

  it("redoes only what the focused field can redo", () => {
    const { commands } = mounted();
    expect(redoLastUndo()).toBe(true);
    expect(commands.at(-1)?.command).toBe("redo");
  });

  it("edits through the page the field stands in when its pane is outside the window", () => {
    const { input, commands } = mounted();
    const child = openChild();
    const outside: string[] = [];
    Object.defineProperty(child.document, "execCommand", {
      configurable: true,
      value: (command: string): boolean => {
        outside.push(command);
        return true;
      },
    });
    const stopSharing = shareDelegatedEvents(child.document);
    child.document.body.append(input);
    input.focus();
    typeInto(input, "hello");
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(redoLastUndo(child.document)).toBe(true);
    stopSharing();
    child.close();
    expect(outside).toEqual(["delete", "redo"]);
    expect(commands).toEqual([]);
  });
});

function mounted() {
  const commands: EditCommand[] = [];
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: (command: string, _ui: boolean, value?: string): boolean => {
      const field = document.activeElement;
      if (!(field instanceof HTMLTextAreaElement)) return false;
      const { selectionStart: start, selectionEnd: end } = field;
      commands.push({ command, value, selected: field.value.slice(start, end) });
      if (command === "redo") return true;
      field.setRangeText(value ?? "", start, end, "end");
      field.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
  });
  const { container } = render(() => (
    <Composer queue={[]} onSteer={() => {}} onQueue={() => {}} onInterrupt={() => {}} />
  ));
  const input = container.querySelector("textarea") as HTMLTextAreaElement;
  input.focus();
  return { input, commands };
}

function typeInto(input: HTMLTextAreaElement, text: string): void {
  input.value = text;
  input.setSelectionRange(text.length, text.length);
  fireEvent.input(input);
}
