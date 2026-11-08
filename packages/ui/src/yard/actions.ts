import type { AppAction } from "../keys/actions.ts";

export const yardRailActionId = "yard.rail";
export const yardToggleActionId = "yard.toggle";

export const yardRailAction: AppAction = {
  chords: "leader y",
  help: "the yard's rail: j k move, enter opens, x dismisses, p pins, esc returns",
  inEveryPane: true,
  command: {
    name: "yard-rail",
    label: "the yard's rail",
    description: "select what the creature set out for you, in depth order",
    aliases: ["rail"],
  },
  invoke: (target) => target.focusYardRail(),
};

export const yardToggleAction: AppAction = {
  chords: "leader shift+y",
  help: "the yard or tiles (toggle)",
  command: {
    name: "yard",
    label: "the yard or tiles",
    description: "lay the workspace out as the yard around the creature, or as tiles",
    aliases: ["tiles"],
  },
  invoke: (target) => target.toggleYard(),
};
