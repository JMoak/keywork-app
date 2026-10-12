import { z } from "zod";
import type { PaneId } from "../../layout/index.ts";
import type { Attire, AttireTarget } from "../../theme/attire.ts";
import type { ShellSeams } from "../registry.ts";

export const attireTargetSpec = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("window") }),
  z.object({ kind: z.literal("arc"), slug: z.string() }),
  z.object({ kind: z.literal("pane"), id: z.string() }),
  z.object({ kind: z.literal("panes"), ids: z.array(z.string()) }),
]);

export const windowTarget: AttireTarget = { kind: "window" };

export const summonNotices = {
  noPane: "this pane wears the house theme · the window is dressed instead",
  noArc: "this pane is in no arc · the arcs pane binds one",
  noMarks: "no panes are marked · the window is dressed instead",
  windowOnly: "only the window can be dressed now · focus a work pane or mark some, then summon",
} as const;

export interface SummonedTarget {
  readonly target: AttireTarget;
  readonly notice?: string;
}

export function summonedTarget(
  shell: ShellSeams,
  from: PaneId | undefined,
  variant: string | undefined,
): SummonedTarget {
  switch (variant) {
    case "pane":
      return orWindow(paneOf(shell.attire, from), summonNotices.noPane);
    case "arc":
      return orWindow(arcOf(shell.attire, from), summonNotices.noArc);
    case "marked":
      return orWindow(markedOf(shell.marks?.all() ?? []), summonNotices.noMarks);
    default:
      return { target: windowTarget };
  }
}

export function reachableTargets(
  attire: Attire | undefined,
  from: PaneId | undefined,
  marked: readonly PaneId[],
): AttireTarget[] {
  if (attire === undefined) return [windowTarget];
  return [windowTarget, paneOf(attire, from), arcOf(attire, from), markedOf(marked)].filter(
    (target): target is AttireTarget => target !== undefined,
  );
}

export function nextTarget(
  current: AttireTarget,
  reachable: readonly AttireTarget[],
): AttireTarget {
  const at = reachable.findIndex((target) => target.kind === current.kind);
  return reachable[(at + 1) % reachable.length] ?? windowTarget;
}

export function inheritedTheme(
  attire: Attire,
  target: AttireTarget,
  windowTheme: string,
): string | undefined {
  switch (target.kind) {
    case "window":
      return undefined;
    case "arc":
      return windowTheme;
    case "pane":
      return paneInherits(attire, target.id, windowTheme);
    case "panes":
      return choicesOf(attire, target.ids).kind === "mixed"
        ? undefined
        : sharedName(target.ids.map((id) => paneInherits(attire, id, windowTheme)));
  }
}

export type MarkedChoices =
  | { readonly kind: "shared"; readonly name: string }
  | { readonly kind: "mixed" }
  | { readonly kind: "bare" };

export function markedChoices(choices: readonly (string | undefined)[]): MarkedChoices {
  const distinct = new Set(choices);
  if (distinct.size > 1) return { kind: "mixed" };
  const [only] = distinct;
  return only === undefined ? { kind: "bare" } : { kind: "shared", name: only };
}

export function echoedThemes(
  attire: Attire,
  target: AttireTarget,
  windowTheme: string,
): readonly string[] {
  if (target.kind === "panes" && choicesOf(attire, target.ids).kind === "mixed")
    return [...new Set(target.ids.map((id) => paneWears(attire, id, windowTheme)))];
  const inherited = inheritedTheme(attire, target, windowTheme);
  return inherited === undefined ? [] : [inherited];
}

export function targetHead(attire: Attire, target: AttireTarget, windowTheme: string): string {
  const named = attire.describe(target);
  if (target.kind === "panes" && target.ids.length > 1)
    return `${named} ${pluralHead(choicesOf(attire, target.ids))}`;
  const own = attire.worn(target);
  if (own !== undefined) return `${named} wears ${own}`;
  const inherited = inheritedTheme(attire, target, windowTheme);
  return `${named} wears nothing of its own · inherits${inherited === undefined ? "" : ` ${inherited}`}`;
}

function pluralHead(choices: MarkedChoices): string {
  switch (choices.kind) {
    case "shared":
      return `wear ${choices.name}`;
    case "mixed":
      return "wear different themes";
    case "bare":
      return "wear nothing of their own · inherit";
  }
}

function choicesOf(attire: Attire, ids: readonly PaneId[]): MarkedChoices {
  return markedChoices(ids.map((id) => attire.worn({ kind: "pane", id })));
}

function paneWears(attire: Attire, id: PaneId, windowTheme: string): string {
  return attire.worn({ kind: "pane", id }) ?? paneInherits(attire, id, windowTheme);
}

function paneOf(attire: Attire | undefined, from: PaneId | undefined): AttireTarget | undefined {
  if (from === undefined || attire?.dressable(from) !== true) return undefined;
  return { kind: "pane", id: from };
}

function arcOf(attire: Attire | undefined, from: PaneId | undefined): AttireTarget | undefined {
  const slug = from === undefined ? undefined : attire?.arcOf(from);
  return slug === undefined ? undefined : { kind: "arc", slug };
}

function markedOf(marked: readonly PaneId[]): AttireTarget | undefined {
  return marked.length === 0 ? undefined : { kind: "panes", ids: [...marked] };
}

function orWindow(target: AttireTarget | undefined, notice: string): SummonedTarget {
  return target === undefined ? { target: windowTarget, notice } : { target };
}

function paneInherits(attire: Attire, id: PaneId, windowTheme: string): string {
  const slug = attire.arcOf(id);
  return (slug === undefined ? undefined : attire.worn({ kind: "arc", slug })) ?? windowTheme;
}

function sharedName(names: readonly string[]): string | undefined {
  const distinct = new Set(names);
  return distinct.size === 1 ? names[0] : undefined;
}
