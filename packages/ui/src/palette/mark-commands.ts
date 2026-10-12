import type { PaneId } from "../layout/index.ts";
import type { CommandSpec } from "./commands.ts";

export interface MarkablePane {
  readonly id: PaneId;
  readonly title: string;
}

export interface MarkSeams {
  marked(paneId: PaneId): boolean;
  toggle(paneId: PaneId): void;
}

export const markDescriptions = {
  mark: "mark this pane for theme-marked",
  unmark: "unmark this pane",
} as const;

export function markCommands(panes: readonly MarkablePane[], seams: MarkSeams): CommandSpec[] {
  const names = uniqueNames(panes.map((pane) => `mark-${commandSlug(pane.title, pane.id)}`));
  return panes.map((pane, at) => ({
    name: names[at] ?? `mark-${pane.id}`,
    label: `mark ${pane.title}`,
    description: seams.marked(pane.id) ? markDescriptions.unmark : markDescriptions.mark,
    run: () => seams.toggle(pane.id),
  }));
}

export function commandSlug(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? fallback : slug;
}

function uniqueNames(names: readonly string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    for (let count = 2; taken.has(candidate); count += 1) candidate = `${name}-${count}`;
    taken.add(candidate);
    return candidate;
  });
}
