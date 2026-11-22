import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteLine, noteKeys, notePrompt } from "./note-line.tsx";

afterEach(cleanup);

function noteInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector(`input[aria-label="${notePrompt}"]`) as HTMLInputElement;
}

describe("NoteLine", () => {
  it("sends the typed words on enter", () => {
    const onSend = vi.fn();
    const { container } = render(() => <NoteLine onSend={onSend} />);
    fireEvent.input(noteInput(container), { target: { value: "too broad" } });
    fireEvent.keyDown(noteInput(container), { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("too broad");
  });

  it("sends without words on esc when it stands alone", () => {
    const onSend = vi.fn();
    const { container } = render(() => <NoteLine onSend={onSend} />);
    expect(container.textContent).toContain(noteKeys);
    fireEvent.keyDown(noteInput(container), { key: "Escape" });
    expect(onSend).toHaveBeenCalledWith("");
  });
});
