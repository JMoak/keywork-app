import { createEffect, createMemo, createSignal, on } from "solid-js";
import type { CommandRegistry } from "../palette/commands.ts";
import {
  completionOf,
  resolveSlash,
  type SlashContext,
  type Suggestion,
  slashSuggestions,
} from "../palette/slash.ts";

export interface SlashInputSeams {
  draft(): string;
  expanded(): string;
  setDraft(text: string): void;
  commands(): CommandRegistry | undefined;
  scope(): string | undefined;
}

export interface SlashInput {
  active(): boolean;
  suggestions(): readonly Suggestion[];
  selected(): number;
  select(row: number): void;
  choose(row: number): void;
  handle(event: KeyboardEvent): boolean;
}

export function slashTextOf(draft: string): string | undefined {
  return draft.startsWith("/") && !draft.includes("\n") ? draft.slice(1) : undefined;
}

export function createSlashInput(seams: SlashInputSeams): SlashInput {
  const context = (): SlashContext | undefined => {
    const registry = seams.commands();
    return registry === undefined ? undefined : { registry, scope: seams.scope() };
  };
  const typed = createMemo(() => slashTextOf(seams.draft()));
  const active = (): boolean => typed() !== undefined && context() !== undefined;
  const suggestions = createMemo((): readonly Suggestion[] => {
    const text = typed();
    const known = context();
    return text === undefined || known === undefined ? [] : slashSuggestions(known, text);
  });
  const [cursor, setCursor] = createSignal(0);
  createEffect(on(typed, () => setCursor(0)));
  const selected = (): number => Math.min(cursor(), Math.max(0, suggestions().length - 1));

  const step = (delta: number): void => {
    const count = suggestions().length;
    if (count > 0) setCursor((selected() + delta + count) % count);
  };
  const complete = (): void => {
    const chosen = suggestions()[selected()];
    if (chosen !== undefined) seams.setDraft(`/${completionOf(chosen)}`);
  };
  const resolveAt = (row: number): boolean => {
    const known = context();
    const text = slashTextOf(seams.expanded());
    if (known === undefined || text === undefined) return false;
    const resolution = resolveSlash(known, text, suggestions()[row]);
    if (resolution.kind === "unknown") return false;
    if (resolution.kind === "complete") {
      seams.setDraft(`/${resolution.text}`);
      return true;
    }
    seams.setDraft("");
    resolution.command.run(resolution.argument);
    return true;
  };

  return {
    active,
    suggestions,
    selected,
    select: setCursor,
    choose: (row) => void resolveAt(row),
    handle: (event) => {
      if (!active() || event.isComposing) return false;
      switch (event.key) {
        case "Escape":
          seams.setDraft("");
          return true;
        case "ArrowDown":
          step(1);
          return suggestions().length > 0;
        case "ArrowUp":
          step(-1);
          return suggestions().length > 0;
        case "Tab":
          if (event.shiftKey) step(-1);
          else complete();
          return true;
        case "Enter":
          if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
          return resolveAt(selected());
        default:
          return false;
      }
    },
  };
}
