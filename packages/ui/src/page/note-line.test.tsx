import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteLine, noteKeys, noteKeysWithBack, notePrompt } from "./note-line.tsx";

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

  it("steps back on esc when there is a step to go back to, and says so", () => {
    const onSend = vi.fn();
    const onBack = vi.fn();
    const { container } = render(() => <NoteLine onSend={onSend} onBack={onBack} />);
    expect(container.textContent).toContain(noteKeysWithBack);
    fireEvent.keyDown(noteInput(container), { key: "Escape" });
    expect(onBack).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends without words on esc when it stands alone", () => {
    const onSend = vi.fn();
    const { container } = render(() => <NoteLine onSend={onSend} />);
    expect(container.textContent).toContain(noteKeys);
    fireEvent.keyDown(noteInput(container), { key: "Escape" });
    expect(onSend).toHaveBeenCalledWith("");
  });
});
