export type CompanionMenuAction =
  | "open"
  | "hide"
  | "still"
  | "quiet"
  | "size"
  | "switch-creature"
  | "settings";

export type CompanionMenuItem =
  | { kind: "separator" }
  | { kind: "action"; label: string; action: CompanionMenuAction; payload?: string }
  | { kind: "toggle"; label: string; action: CompanionMenuAction; checked: boolean }
  | { kind: "choice"; label: string; action: CompanionMenuAction; payload: string; chosen: boolean }
  | { kind: "submenu"; label: string; items: readonly CompanionMenuItem[] };

export interface CompanionMenuState {
  still: boolean;
  quiet: boolean;
  size: number;
  creatures: readonly { slug: string; name: string }[];
  current: string | undefined;
}

export const sizeStops: readonly number[] = [50, 75, 100, 125, 150, 200];
export const defaultSize = 100;

export function companionMenu(state: CompanionMenuState): CompanionMenuItem[] {
  return [
    { kind: "action", label: "Open the console", action: "open" },
    { kind: "separator" },
    { kind: "action", label: "Hide", action: "hide" },
    { kind: "toggle", label: "Still", action: "still", checked: state.still },
    { kind: "toggle", label: "Quiet", action: "quiet", checked: state.quiet },
    { kind: "submenu", label: "Size", items: sizeItems(state.size) },
    ...switchCreature(state),
    { kind: "separator" },
    { kind: "action", label: "Settings…", action: "settings" },
  ];
}

function sizeItems(size: number): CompanionMenuItem[] {
  return [
    ...sizeStops.map(
      (stop): CompanionMenuItem => ({
        kind: "choice",
        label: `${stop}%`,
        action: "size",
        payload: String(stop),
        chosen: stop === size,
      }),
    ),
    { kind: "separator" },
    { kind: "action", label: "Reset", action: "size", payload: String(defaultSize) },
  ];
}

function switchCreature(state: CompanionMenuState): CompanionMenuItem[] {
  if (state.creatures.length < 2) return [];
  return [
    {
      kind: "submenu",
      label: "Switch creature",
      items: state.creatures.map(({ slug, name }) => ({
        kind: "choice",
        label: name,
        action: "switch-creature",
        payload: slug,
        chosen: slug === state.current,
      })),
    },
  ];
}
