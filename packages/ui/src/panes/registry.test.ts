import { describe, expect, it } from "vitest";
import { actionScopes, appActions, coreActions } from "../keys/actions.ts";
import { keymapFromConfig } from "../keys/config.ts";
import { Keymap } from "../keys/keymap.ts";
import { CommandRegistry } from "../palette/commands.ts";
import { paneActions, paneDefinitions, paneRegistry, parsePaneSpec } from "./index.ts";

const keymap = keymapFromConfig();
const keys = {
  chord: (action: string) => keymap.describe(action) ?? "an unbound key",
  leader: () => keymap.leader,
};

function paletteOf(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const [name, action] of Object.entries(appActions)) {
    if (action.command === undefined) continue;
    registry.register({ ...action.command, shortcut: keymap.describe(name), run: () => undefined });
  }
  return registry;
}

describe("the pane inventory", () => {
  it("registers every definition once under its own kind", () => {
    expect(paneRegistry.size).toBe(paneDefinitions.length);
    for (const definition of paneDefinitions) {
      expect(paneRegistry.get(definition.kind)).toBe(definition);
    }
  });

  it("gives every pane a title, a home, and a one-line empty state that names a key", () => {
    for (const definition of paneRegistry.values()) {
      const line = definition.emptyState(keys);
      expect(line, definition.kind).not.toBe("");
      expect(line, definition.kind).not.toContain("\n");
      expect(line, definition.kind).toMatch(/ctrl\+k \w|type a prompt/);
      expect(line.match(/ctrl\+k \S+/g), definition.kind).toHaveLength(1);
      expect(line, definition.kind).not.toContain("an unbound key");
      expect(line, definition.kind).not.toMatch(/alt\+enter|steer/);
      expect(["main", "left", "right"]).toContain(definition.home);
    }
  });

  it("parses each pane's own spec and refuses a foreign kind", () => {
    expect(parsePaneSpec({ kind: "conversation", sessionId: "s1" })).toEqual({
      kind: "conversation",
      sessionId: "s1",
    });
    expect(parsePaneSpec({ kind: "tree" })).toEqual({ kind: "tree" });
    expect(parsePaneSpec({ kind: "sessions" })).toEqual({ kind: "tree" });
    expect(parsePaneSpec({ kind: "diff", sessionId: "s1", path: "a.ts" })).toEqual({
      kind: "diff",
      sessionId: "s1",
      path: "a.ts",
    });
    expect(parsePaneSpec({ kind: "browser" })).toEqual({ kind: "browser" });
    expect(parsePaneSpec({ kind: "file", path: "src/a.ts", from: 3, to: 9 })).toEqual({
      kind: "file",
      path: "src/a.ts",
      from: 3,
      to: 9,
    });
    expect(parsePaneSpec({ kind: "file" })).toBeUndefined();
    expect(parsePaneSpec({ kind: "nope" })).toBeUndefined();
  });

  it("gives every summon a unique action id that no core action claims", () => {
    const summons = [...paneRegistry.values()].flatMap((definition) =>
      definition.summon === undefined ? [] : [definition.summon.action],
    );
    expect(new Set(summons).size).toBe(summons.length);
    for (const action of summons) {
      expect(coreActions[action], action).toBeUndefined();
      expect(appActions[action], action).toBeDefined();
    }
  });

  it("lists an open command in the palette for every pane", () => {
    const palette = paletteOf();
    for (const definition of paneRegistry.values()) {
      const name = definition.summon?.command.name;
      expect(name, definition.kind).toBeDefined();
      expect(palette.run(name as string), definition.kind).toBe(true);
    }
  });

  it("binds every pane-local action to its own kind and keeps the table collision-free", () => {
    for (const [name, action] of Object.entries(paneActions)) {
      if (action.scope === undefined) continue;
      expect(paneRegistry.get(action.scope)?.localActions?.[name]).toBeDefined();
    }
    expect(() => new Keymap({ bindings: keymapBindings(), scopes: actionScopes })).not.toThrow();
  });
});

function keymapBindings(): Record<string, string | readonly string[]> {
  return Object.fromEntries(
    Object.entries(appActions).map(([name, action]) => [name, action.chords]),
  );
}
