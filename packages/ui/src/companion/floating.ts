import { createSignal } from "solid-js";
import type { AppAction } from "../keys/actions.ts";
import type { CompanionCreature } from "./port.ts";
import type { CompanionSwitch } from "./switch.tsx";

export const companionSwitchActionId = "companion.switch";

export const companionSwitchAction: AppAction = {
  chords: "leader shift+v",
  help: "switch which creature floats as the companion",
  command: {
    name: "switch-creature",
    label: "switch creature",
    aliases: ["switch", "float"],
    description:
      "choose the creature that floats on the desktop; the others stay on the stead, and the profile and chores follow it",
    argument: {
      hint: "creature",
      choices: (shell) =>
        (shell.companion?.residents() ?? []).map((resident) => ({
          value: resident.slug ?? resident.name,
          label: resident.name,
        })),
    },
  },
  invoke: (target, argument) => target.switchCompanion(argument),
};

export function createCompanionController() {
  const [wanted, setWanted] = createSignal<string>();
  const [floating, noteFloating] = createSignal<string>();
  const [residents, noteResidents] = createSignal<readonly CompanionCreature[]>([]);
  const [toggle, setToggle] = createSignal<CompanionSwitch>();
  return {
    wanted,
    switchTo: (slug: string | undefined): void => {
      setWanted(slug?.trim() || undefined);
    },
    floating,
    noteFloating,
    residents,
    noteResidents,
    toggle,
    bindToggle: (controller: CompanionSwitch): (() => void) => {
      setToggle(controller);
      return () => setToggle((current) => (current === controller ? undefined : current));
    },
  };
}

export type CompanionController = ReturnType<typeof createCompanionController>;
