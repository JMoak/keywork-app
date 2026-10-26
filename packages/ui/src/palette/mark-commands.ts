import type { PaneId } from "../layout/index.ts";
import type { ArgumentChoice, CommandSpec } from "./commands.ts";

export interface MarkablePane {
  readonly id: PaneId;
  readonly title: string;
}

export interface MarkSeams {
  panes(): readonly MarkablePane[];
  marked(paneId: PaneId): boolean;
  toggle(paneId: PaneId): void;
  toggleFocused(): void;
  shortcut(): string | undefined;
  say(line: string): void;
}

export const markDescriptions = {
  command: "mark or unmark this pane, or the pane you name, for theme-marked",
  mark: "marks it for theme-marked",
  unmark: "marked · this unmarks it",
} as const;

export function markCommand(seams: MarkSeams): CommandSpec {
  return {
    name: "mark",
    description: markDescriptions.command,
    argument: { hint: "[pane]", choices: () => markChoices(seams) },
    get shortcut() {
      return seams.shortcut();
    },
    run: (named) => {
      if (named === undefined) return seams.toggleFocused();
      const pane = paneNamed(seams.panes(), named);
      if (pane === undefined) seams.say(`no pane named ${named} · /mark lists them`);
      else seams.toggle(pane.id);
    },
  };
}

export function markChoices(seams: Pick<MarkSeams, "panes" | "marked">): ArgumentChoice[] {
  return namedPanes(seams.panes()).map(({ name, pane }) => ({
    value: name,
    description: seams.marked(pane.id) ? markDescriptions.unmark : markDescriptions.mark,
  }));
}

export function commandSlug(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? fallback : slug;
}

interface NamedPane {
  readonly name: string;
  readonly pane: MarkablePane;
}

function paneNamed(panes: readonly MarkablePane[], name: string): MarkablePane | undefined {
  const wanted = name.trim().toLowerCase();
  return namedPanes(panes).find((named) => named.name === wanted)?.pane;
}

function namedPanes(panes: readonly MarkablePane[]): NamedPane[] {
  const names = uniqueNames(panes.map((pane) => commandSlug(pane.title, pane.id)));
  return panes.map((pane, at) => ({ name: names[at] ?? pane.id, pane }));
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
