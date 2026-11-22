import type { ActionTarget, AppAction } from "../keys/actions.ts";

export const paneOutsideActionId = "pane.outside";
export const panesInsideActionId = "pane.inside-all";
export const panesSpreadActionId = "pane.outside-spread";
export const panesHintsActionId = "pane.outside-hints";
export const paneBehindActionId = "pane.outside-behind";
export const panesDealActionId = "pane.outside-deal";
export const consoleRoomActionId = "pane.outside-room";

export const consoleRoomAction: AppAction = {
  chords: "leader shift+backspace",
  help: "let the console make room for panes outside the window, or stay as it is (toggle)",
  command: {
    name: "make-room",
    description:
      "let the console stand at the side of its display as a column for the conversation while panes are outside the window, and return when they come inside; again keeps it as it is",
    aliases: ["hub"],
  },
  invoke: (target) => target.toggleConsoleRoom(),
};

export interface OutsideHandlers {
  togglePaneOutside(): void;
  bringPanesInside(): void;
  toggleOutsideSpread(): void;
  toggleOutsideHints(): void;
  sendPaneBehind(): void;
  dealPanesOutside(): void;
}

export function outsideActions(
  handlersOf: (target: ActionTarget) => OutsideHandlers,
): Record<string, AppAction> {
  return Object.fromEntries(
    Object.entries(declared).map(([id, { run, ...action }]) => [
      id,
      { ...action, invoke: (target: ActionTarget) => run(handlersOf(target)) },
    ]),
  );
}

type Declared = Omit<AppAction, "invoke"> & {
  readonly run: (handlers: OutsideHandlers) => void;
};

const declared: Record<string, Declared> = {
  [paneOutsideActionId]: {
    chords: "leader enter",
    help: "send this pane outside the window, or bring it back inside (toggle)",
    command: {
      name: "outside",
      description:
        "send this pane outside the window to stand on the desktop; again brings it back inside where it sat",
      aliases: ["pop-out", "inside"],
    },
    run: (handlers) => handlers.togglePaneOutside(),
  },
  [panesInsideActionId]: {
    chords: "leader backspace",
    help: "bring every pane back inside the window",
    command: {
      name: "inside-all",
      description: "bring every pane outside the window back inside, in the order they left",
      aliases: ["bring-inside"],
    },
    run: (handlers) => handlers.bringPanesInside(),
  },
  [panesSpreadActionId]: {
    chords: "leader ;",
    help: "spread the panes outside the window so none overlap, each under a letter (toggle)",
    command: {
      name: "spread",
      description:
        "spread the panes outside the window so none overlaps another, each under a letter that jumps to it; again returns each to where it stood",
      aliases: ["fan-out"],
    },
    run: (handlers) => handlers.toggleOutsideSpread(),
  },
  [panesHintsActionId]: {
    chords: "leader :",
    help: "letter the panes outside the window where they stand; a letter jumps to its pane",
    command: {
      name: "jump-outside",
      description:
        "put a letter on each pane outside the window where it stands; pressing a letter focuses that pane and raises it, escape leaves them be",
      aliases: ["letters"],
    },
    run: (handlers) => handlers.toggleOutsideHints(),
  },
  [paneBehindActionId]: {
    chords: "leader \\",
    help: "send this pane outside the window behind the others",
    command: {
      name: "send-behind",
      description:
        "send this pane outside the window behind the other panes outside, and focus the one now on top",
      aliases: ["lower"],
    },
    run: (handlers) => handlers.sendPaneBehind(),
  },
  [panesDealActionId]: {
    chords: "leader shift+enter",
    help: "deal the panes outside the window into their next arrangement",
    command: {
      name: "deal",
      description:
        "deal the panes outside the window into the next arrangement for as many as there are, the weightiest in the largest seat; again deals the one after, and round to the first",
      aliases: ["redeal", "arrange-outside"],
    },
    run: (handlers) => handlers.dealPanesOutside(),
  },
};
