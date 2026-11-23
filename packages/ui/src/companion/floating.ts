import type { SteadPlace } from "@keywork-app/protocol";
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

export const companionSteadActionId = "companion.stead";

export const companionSteadAction: AppAction = {
  chords: "leader shift+home",
  help: "show the stead beside the companion, or put it away",
  command: {
    name: "companion-stead",
    label: "the stead beside the companion",
    aliases: ["reveal-stead"],
    description:
      "set the stead out beside the floating companion with its creature's plot under the cursor; again, or space or escape in the stead, puts it away",
  },
  invoke: (target) => target.toggleCompanionStead(),
};

export function createCompanionController() {
  const [wanted, setWanted] = createSignal<string>();
  let askForStead: (() => void) | undefined;
  const [floating, noteFloating] = createSignal<string>();
  const [residents, noteResidents] = createSignal<readonly CompanionCreature[]>([]);
  const [toggle, setToggle] = createSignal<CompanionSwitch>();
  return {
    wanted,
    switchTo: (slug: string | undefined): void => {
      setWanted(slug?.trim() || undefined);
    },
    choosePlace: (place: SteadPlace): void => {
      if (place.kind === "workshop" || place.kind === "project") setWanted(place.creature);
    },
    toggleStead: (): void => askForStead?.(),
    bindStead: (ask: () => void): (() => void) => {
      askForStead = ask;
      return () => {
        if (askForStead === ask) askForStead = undefined;
      };
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
