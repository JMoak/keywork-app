import type { AppAction } from "../keys/actions.ts";

export const yardRailActionId = "yard.rail";
export const yardToggleActionId = "yard.toggle";
export const yardTrailActionId = "yard.trail";
export const yardRootwardActionId = "yard.rootward";
export const yardLeafwardActionId = "yard.leafward";

export type TrailStep = "rootward" | "leafward";

export const yardRailAction: AppAction = {
  chords: "leader y",
  help: "the yard's rail: j k move, enter opens, x dismisses, p pins, t trail, esc returns",
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

export const yardTrailAction: AppAction = {
  chords: "none",
  help: "the rail by depth or as the trail (toggle; t on the rail)",
  command: {
    name: "trail",
    label: "the rail now or as the trail",
    description: "order the yard's rail by depth, or by the trail each panel grew from",
  },
  invoke: (target) => target.toggleYardTrail(),
};

export const yardRootwardAction: AppAction = {
  chords: "leader [",
  help: "walk the trail toward its root",
  inEveryPane: true,
  command: {
    name: "trail-back",
    description: "go to the panel or conversation the focused panel grew from",
  },
  invoke: (target) => target.walkYardTrail("rootward"),
};

export const yardLeafwardAction: AppAction = {
  chords: "leader ]",
  help: "walk the trail toward its newest branch",
  inEveryPane: true,
  command: {
    name: "trail-on",
    description: "go to the newest panel grown from the focused one",
  },
  invoke: (target) => target.walkYardTrail("leafward"),
};
