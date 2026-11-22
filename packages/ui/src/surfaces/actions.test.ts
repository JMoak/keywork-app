import { describe, expect, it, vi } from "vitest";
import {
  type ActionTarget,
  type AppAction,
  actionScopes,
  appActions,
  appBindings,
} from "../keys/actions.ts";
import { chordsOfKey, parseChord } from "../keys/chord.ts";
import { Keymap } from "../keys/keymap.ts";
import { paneDefinitions } from "../panes/index.ts";
import {
  type OutsideHandlers,
  outsideActions,
  paneBehindActionId,
  paneOutsideActionId,
  panesDealActionId,
  panesHintsActionId,
  panesInsideActionId,
  panesSpreadActionId,
} from "./actions.ts";

const outsideIds = [
  paneOutsideActionId,
  panesInsideActionId,
  panesSpreadActionId,
  panesHintsActionId,
  paneBehindActionId,
  panesDealActionId,
];

function listening(): OutsideHandlers {
  return {
    togglePaneOutside: vi.fn(),
    bringPanesInside: vi.fn(),
    toggleOutsideSpread: vi.fn(),
    toggleOutsideHints: vi.fn(),
    sendPaneBehind: vi.fn(),
    dealPanesOutside: vi.fn(),
  };
}

function declared(handlers: OutsideHandlers = listening()): Record<string, AppAction> {
  return outsideActions(() => handlers);
}

function keymapWithOutside(): Keymap {
  const chords = Object.entries(declared()).map(([id, action]) => [id, action.chords]);
  return new Keymap({
    bindings: { ...appBindings, ...Object.fromEntries(chords) },
    scopes: actionScopes,
  });
}

function typed(key: string, code: string): ReturnType<typeof chordsOfKey> {
  return chordsOfKey({
    key,
    code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
  });
}

function shifted(key: string, code: string): ReturnType<typeof chordsOfKey> {
  return chordsOfKey({
    key,
    code,
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    isComposing: false,
  });
}

function namesOf(action: AppAction): string[] {
  return action.command === undefined
    ? []
    : [action.command.name, ...(action.command.aliases ?? [])];
}

describe("the keeper's actions for panes outside the window", () => {
  it("claims chords no other action holds, pane-local chords included", () => {
    expect(keymapWithOutside).not.toThrow();
    const taken = new Set(
      Object.entries(appBindings)
        .filter(([id]) => !outsideIds.includes(id))
        .flatMap(([, chords]) => [chords].flat()),
    );
    for (const [id, action] of Object.entries(declared())) {
      for (const chord of [action.chords].flat()) expect(taken.has(chord), id).toBe(false);
    }
  });

  it("fires from every kind of pane, a pane that owns the keyboard included", () => {
    const keymap = keymapWithOutside();
    const pressed = [
      [typed("Enter", "Enter"), paneOutsideActionId],
      [typed("Backspace", "Backspace"), panesInsideActionId],
      [typed(";", "Semicolon"), panesSpreadActionId],
      [typed("ö", "Semicolon"), panesSpreadActionId],
    ] as const;
    for (const scope of [undefined, ...paneDefinitions.map((pane) => pane.kind)]) {
      for (const [chords, action] of pressed) {
        keymap.press(parseChord("ctrl+k"), 0, scope);
        expect(keymap.press(chords, 1, scope), `${action} in ${scope}`).toEqual({
          type: "action",
          action,
        });
      }
    }
  });

  it("puts the letters on the spread's own key shifted, and the send behind on the backslash", () => {
    const keymap = keymapWithOutside();
    expect(keymap.describe(panesHintsActionId)).toBe("ctrl+k :");
    expect(keymap.describe(paneBehindActionId)).toBe("ctrl+k \\");
    const pressed = [
      [shifted(":", "Semicolon"), panesHintsActionId],
      [shifted("Ö", "Semicolon"), panesHintsActionId],
      [typed("\\", "Backslash"), paneBehindActionId],
      [typed("#", "Backslash"), paneBehindActionId],
      [typed(";", "Semicolon"), panesSpreadActionId],
    ] as const;
    for (const scope of [undefined, ...paneDefinitions.map((pane) => pane.kind)]) {
      for (const [chords, action] of pressed) {
        keymap.press(parseChord("ctrl+k"), 0, scope);
        expect(keymap.press(chords, 1, scope), `${action} in ${scope}`).toEqual({
          type: "action",
          action,
        });
      }
    }
  });

  it("stays behind the leader, so enter, backspace and ; still type", () => {
    const keymap = keymapWithOutside();
    for (const id of outsideIds) expect(keymap.isLeaderless(id), id).toBe(false);
    expect(keymap.press(typed("Enter", "Enter"), 0, "conversation", true)).toEqual({
      type: "pass",
    });
    expect(keymap.press(typed("Backspace", "Backspace"), 0, "conversation", true)).toEqual({
      type: "pass",
    });
    expect(keymap.press(typed(";", "Semicolon"), 0, "conversation", true)).toEqual({
      type: "pass",
    });
  });

  it("runs the handler the view supplies for each action, reached through the target", () => {
    const handlers = listening();
    const target = {} as ActionTarget;
    const reached = vi.fn(() => handlers);
    const actions = outsideActions(reached);
    actions[paneOutsideActionId]?.invoke(target);
    expect(handlers.togglePaneOutside).toHaveBeenCalledTimes(1);
    actions[panesInsideActionId]?.invoke(target);
    expect(handlers.bringPanesInside).toHaveBeenCalledTimes(1);
    actions[panesSpreadActionId]?.invoke(target);
    expect(handlers.toggleOutsideSpread).toHaveBeenCalledTimes(1);
    expect(reached).toHaveBeenCalledTimes(3);
    expect(reached).toHaveBeenCalledWith(target);
  });

  it("puts the deal on the outside key shifted: enter sends one pane out, shift+enter deals them all", () => {
    const keymap = keymapWithOutside();
    expect(keymap.describe(panesDealActionId)).toBe("ctrl+k shift+enter");
    expect(keymap.describe(paneOutsideActionId)).toBe("ctrl+k enter");
    expect(keymap.isLeaderless(panesDealActionId)).toBe(false);
    for (const scope of [undefined, ...paneDefinitions.map((pane) => pane.kind)]) {
      keymap.press(parseChord("ctrl+k"), 0, scope);
      expect(keymap.press(shifted("Enter", "Enter"), 1, scope), `in ${scope}`).toEqual({
        type: "action",
        action: panesDealActionId,
      });
      keymap.press(parseChord("ctrl+k"), 2, scope);
      expect(keymap.press(typed("Enter", "Enter"), 3, scope), `in ${scope}`).toEqual({
        type: "action",
        action: paneOutsideActionId,
      });
    }
    expect(keymap.press(shifted("Enter", "Enter"), 0, "conversation", true)).toEqual({
      type: "pass",
    });
  });

  it("answers in the palette to names no other action answers to", () => {
    const held = new Set(
      Object.entries(appActions)
        .filter(([id]) => !outsideIds.includes(id))
        .flatMap(([, action]) => namesOf(action)),
    );
    const claimed = Object.values(declared()).flatMap(namesOf);
    expect(new Set(claimed).size).toBe(claimed.length);
    for (const name of claimed) expect(held.has(name), name).toBe(false);
  });
});
