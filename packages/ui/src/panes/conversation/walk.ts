export interface WalkSeams {
  page(): HTMLElement | undefined;
  composer(): HTMLElement | undefined;
}

export const walkAttribute = "data-walk";

export function walkTranscript(root: HTMLElement, seams: WalkSeams): () => void {
  const onKeyDown = transcriptWalk(seams);
  root.addEventListener("keydown", onKeyDown);
  return () => root.removeEventListener("keydown", onKeyDown);
}

export function transcriptWalk(seams: WalkSeams): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const rows = walkRowsIn(seams.page());
    const at = rows.indexOf(event.target as HTMLElement);
    const step = stepOf(event, at !== -1, event.target === seams.composer());
    if (step === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (step === "home") seams.composer()?.focus();
    else land(step === "enter" ? rows.at(-1) : rows[clamp(at + step, rows.length)]);
  };
}

type Step = -1 | 1 | "enter" | "home";

function stepOf(event: KeyboardEvent, onRow: boolean, inComposer: boolean): Step | undefined {
  if (event.key === "Tab" && !event.shiftKey && (onRow || inComposer)) {
    return onRow ? "home" : "enter";
  }
  if (!onRow) return undefined;
  switch (event.key) {
    case "ArrowUp":
    case "k":
      return -1;
    case "ArrowDown":
    case "j":
      return 1;
    case "Escape":
      return "home";
    default:
      return undefined;
  }
}

function walkRowsIn(page: HTMLElement | undefined): HTMLElement[] {
  return page === undefined ? [] : [...page.querySelectorAll<HTMLElement>(`[${walkAttribute}]`)];
}

function land(row: HTMLElement | undefined): void {
  row?.focus({ preventScroll: true });
  row?.scrollIntoView({ block: "nearest" });
}

function clamp(index: number, count: number): number {
  return Math.min(Math.max(index, 0), count - 1);
}
