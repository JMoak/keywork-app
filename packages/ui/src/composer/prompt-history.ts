import { emptyDraft, type KeptDraft } from "./kept-draft.ts";

export type HistoryStep = -1 | 1;

export interface PromptHistory {
  remember(prompt: KeptDraft): void;
  step(step: HistoryStep, draft: string): KeptDraft | undefined;
}

export function createPromptHistory(): PromptHistory {
  const sent: KeptDraft[] = [];
  let browsing: number | undefined;
  let shown: string | undefined;

  const show = (index: number | undefined): KeptDraft => {
    browsing = index;
    const prompt = index === undefined ? emptyDraft : (sent[index] ?? emptyDraft);
    shown = prompt.text;
    return prompt;
  };
  const begin = (step: HistoryStep, draft: string): KeptDraft | undefined =>
    step === -1 && draft === "" && sent.length > 0 ? show(sent.length - 1) : undefined;
  const move = (step: HistoryStep, from: number): KeptDraft => {
    const to = from + step;
    if (to >= sent.length) return show(undefined);
    return show(Math.max(0, to));
  };

  return {
    remember: (prompt) => {
      browsing = undefined;
      if (sent.at(-1)?.text === prompt.text) return;
      sent.push(prompt);
      if (sent.length > historyLimit) sent.shift();
    },
    step: (step, draft) => {
      if (browsing !== undefined && draft !== shown) browsing = undefined;
      return browsing === undefined ? begin(step, draft) : move(step, browsing);
    },
  };
}

export function historyStepOf(
  event: Pick<KeyboardEvent, "key" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey" | "isComposing">,
  input: Pick<HTMLTextAreaElement, "value" | "selectionStart" | "selectionEnd">,
): HistoryStep | undefined {
  if (event.isComposing || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
    return undefined;
  }
  const caret = input.selectionStart;
  if (caret !== input.selectionEnd) return undefined;
  if (event.key === "ArrowUp" && !input.value.slice(0, caret).includes("\n")) return -1;
  if (event.key === "ArrowDown" && !input.value.slice(caret).includes("\n")) return 1;
  return undefined;
}

const historyLimit = 50;
