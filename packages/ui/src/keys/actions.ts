import type { Direction } from "../layout/geometry.ts";
import type { DockSide } from "../layout/index.ts";
import type { BindingSpec } from "./keymap.ts";

export type FocusContext = "pane" | "composer" | "overlay";

export interface ActionTarget {
  splitPane(): void;
  closePane(): void;
  zoomPane(): void;
  rotatePane(): void;
  focusToward(direction: Direction): void;
  focusOrdinal(ordinal: number): void;
  movePane(direction: Direction): void;
  cyclePane(): void;
  dockPane(side: DockSide): void;
  resizeDock(delta: number): void;
  resizePane(delta: number): void;
  summonSessions(): void;
  cycleMode(): void;
  approveAsk(): void;
  denyAsk(): void;
  toggleHelp(): void;
  openPalette(initialQuery?: string): void;
}

export interface AppAction {
  readonly chords: BindingSpec;
  readonly help: string;
  readonly hotPath?: true;
  readonly command?: ActionCommand;
  readonly invoke: (target: ActionTarget) => void;
}

export interface ActionCommand {
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[];
}

export const appActions: Record<string, AppAction> = {
  "pane.split": {
    chords: "leader s",
    help: "new session pane",
    invoke: (target) => target.splitPane(),
    command: { name: "split", description: "open a new session pane beside this one" },
  },
  "pane.close": {
    chords: "leader x",
    help: "close focused pane",
    invoke: (target) => target.closePane(),
    command: { name: "exit", description: "close this pane", aliases: ["close"] },
  },
  "pane.zoom": {
    chords: ["leader z", "alt+z"],
    help: "zoom pane (toggle)",
    hotPath: true,
    invoke: (target) => target.zoomPane(),
    command: { name: "zoom", description: "zoom the focused pane" },
  },
  "pane.rotate": {
    chords: "leader r",
    help: "rotate the split around this pane",
    invoke: (target) => target.rotatePane(),
    command: { name: "rotate", description: "rotate the split around the focused pane" },
  },
  "focus.left": {
    chords: ["leader h", "leader left"],
    help: "focus left",
    invoke: (target) => target.focusToward("left"),
    command: { name: "move-left", description: "focus the pane to the left" },
  },
  "focus.down": {
    chords: ["leader j", "leader down"],
    help: "focus down",
    invoke: (target) => target.focusToward("down"),
    command: { name: "move-down", description: "focus the pane below" },
  },
  "focus.up": {
    chords: ["leader k", "leader up"],
    help: "focus up",
    invoke: (target) => target.focusToward("up"),
    command: { name: "move-up", description: "focus the pane above" },
  },
  "focus.right": {
    chords: ["leader l", "leader right"],
    help: "focus right",
    invoke: (target) => target.focusToward("right"),
    command: { name: "move-right", description: "focus the pane to the right" },
  },
  ...ordinalActions(),
  "move.left": {
    chords: "leader shift+h",
    help: "move pane left",
    invoke: (target) => target.movePane("left"),
    command: { name: "push-left", description: "move this pane left" },
  },
  "move.down": {
    chords: "leader shift+j",
    help: "move pane down",
    invoke: (target) => target.movePane("down"),
    command: { name: "push-down", description: "move this pane down" },
  },
  "move.up": {
    chords: "leader shift+k",
    help: "move pane up",
    invoke: (target) => target.movePane("up"),
    command: { name: "push-up", description: "move this pane up" },
  },
  "move.right": {
    chords: "leader shift+l",
    help: "move pane right",
    invoke: (target) => target.movePane("right"),
    command: { name: "push-right", description: "move this pane right" },
  },
  "dock.cycle": {
    chords: "leader c",
    help: "cycle pane main → left → right",
    invoke: (target) => target.cyclePane(),
    command: {
      name: "dock-cycle",
      description: "move this pane to its next home",
      aliases: ["cycle"],
    },
  },
  "dock.left": {
    chords: "leader d",
    help: "dock pane left",
    invoke: (target) => target.dockPane("left"),
    command: { name: "dock-left", description: "dock this pane to the left edge" },
  },
  "dock.right": {
    chords: "leader shift+d",
    help: "dock pane right",
    invoke: (target) => target.dockPane("right"),
    command: { name: "dock-right", description: "dock this pane to the right edge" },
  },
  "dock.grow": {
    chords: "leader .",
    help: "widen this pane's dock",
    invoke: (target) => target.resizeDock(0.05),
    command: { name: "dock-wider", description: "widen this pane's dock" },
  },
  "dock.shrink": {
    chords: "leader ,",
    help: "narrow this pane's dock",
    invoke: (target) => target.resizeDock(-0.05),
    command: { name: "dock-narrower", description: "narrow this pane's dock" },
  },
  "pane.grow": {
    chords: "leader shift+.",
    help: "grow the focused pane",
    invoke: (target) => target.resizePane(0.05),
    command: { name: "grow", description: "grow the focused pane" },
  },
  "pane.shrink": {
    chords: "leader shift+,",
    help: "shrink the focused pane",
    invoke: (target) => target.resizePane(-0.05),
    command: { name: "shrink", description: "shrink the focused pane" },
  },
  "sessions.summon": {
    chords: "leader t",
    help: "sessions pane",
    invoke: (target) => target.summonSessions(),
    command: { name: "sessions", description: "open the sessions pane", aliases: ["tree"] },
  },
  "mode.cycle": {
    chords: "shift+tab",
    help: "cycle the pane's mode",
    hotPath: true,
    invoke: (target) => target.cycleMode(),
    command: { name: "mode", description: "cycle this pane's mode" },
  },
  "ask.approve": {
    chords: "ctrl+y",
    help: "approve the pending ask",
    hotPath: true,
    invoke: (target) => target.approveAsk(),
    command: { name: "approve", description: "approve the pending tool call" },
  },
  "ask.deny": {
    chords: "ctrl+n",
    help: "deny the pending ask",
    hotPath: true,
    invoke: (target) => target.denyAsk(),
    command: { name: "deny", description: "deny the pending tool call" },
  },
  "help.toggle": {
    chords: ["leader /", "f1"],
    help: "this overlay",
    hotPath: true,
    invoke: (target) => target.toggleHelp(),
    command: { name: "keys", description: "show the hotkeys overlay", aliases: ["help"] },
  },
  "palette.go": {
    chords: "ctrl+p",
    help: "quick open (/ commands)",
    hotPath: true,
    invoke: (target) => target.openPalette(),
    command: { name: "go", description: "jump to a pane (type / for commands)" },
  },
  "palette.commands": {
    chords: ["leader i", "ctrl+shift+p"],
    help: "command palette",
    hotPath: true,
    invoke: (target) => target.openPalette("/"),
    command: { name: "palette", description: "open the command palette", aliases: ["commands"] },
  },
};

export const composerHotPath = ["enter", "alt+enter", "escape"] as const;

export const appBindings: Record<string, BindingSpec> = Object.fromEntries(
  Object.entries(appActions).map(([name, action]) => [name, action.chords]),
);

export const bindingHelp: Record<string, string> = Object.fromEntries(
  Object.entries(appActions).map(([name, action]) => [name, action.help]),
);

export const hotPathActions: readonly string[] = Object.entries(appActions)
  .filter(([, action]) => action.hotPath)
  .map(([name]) => name);

function ordinalActions(): Record<string, AppAction> {
  return Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((ordinal) => [
      `focus.pane${ordinal}`,
      {
        chords: `alt+${ordinal}`,
        help: `focus pane ${ordinal}`,
        ...(ordinal === 1 && { hotPath: true as const }),
        invoke: (target: ActionTarget) => target.focusOrdinal(ordinal),
      },
    ]),
  );
}
