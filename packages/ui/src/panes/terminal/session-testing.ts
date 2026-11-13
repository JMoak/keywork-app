import type { TerminalSize, TerminalSurface } from "./session.ts";

export interface FakeSurface extends TerminalSurface {
  text(): string;
  resets: number;
  clears: number;
  selected: string;
  focused: boolean | undefined;
  type(data: string): void;
  grow(size: TerminalSize): void;
}

export function fakeSurface(size: TerminalSize = { cols: 80, rows: 24 }): FakeSurface {
  const decoder = new TextDecoder();
  const inputs = new Set<(data: string) => void>();
  const resizes = new Set<(size: TerminalSize) => void>();
  let written = "";
  let current = size;
  const surface: FakeSurface = {
    resets: 0,
    clears: 0,
    selected: "selected text",
    focused: undefined,
    text: () => written,
    write: (data) => {
      written += typeof data === "string" ? data : decoder.decode(data);
    },
    clear: () => {
      surface.clears += 1;
    },
    reset: () => {
      surface.resets += 1;
      written = "";
    },
    size: () => current,
    selection: () => surface.selected,
    focus: () => {
      surface.focused = true;
    },
    blur: () => {
      surface.focused = false;
    },
    onInput: (listener) => {
      inputs.add(listener);
      return () => inputs.delete(listener);
    },
    onResize: (listener) => {
      resizes.add(listener);
      return () => resizes.delete(listener);
    },
    dispose: () => {},
    type: (data) => {
      for (const listener of inputs) listener(data);
    },
    grow: (next) => {
      current = next;
      for (const listener of resizes) listener(next);
    },
  };
  return surface;
}
