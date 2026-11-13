import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { actionScopes, appActions, coreActions } from "../keys/actions.ts";
import { keymapFromConfig } from "../keys/config.ts";
import { Keymap } from "../keys/keymap.ts";
import { CommandRegistry } from "../palette/commands.ts";
import { ratchetValue } from "../shell/frame-tick-ratchets.ts";
import { paneActions, paneDefinitions, paneRegistry, parsePaneSpec } from "./index.ts";
import { createCloseGate } from "./registry.ts";
import {
  checkPaneDefinition,
  chordsIn,
  emptyStateMinWidthPx,
  markedKeys,
  narrowPanePx,
} from "./testing.ts";

const keymap = keymapFromConfig();
const keys = {
  chord: (action: string) => keymap.describe(action) ?? "an unbound key",
  leader: () => keymap.leader,
};

function paletteOf(): CommandRegistry {
  const registry = new CommandRegistry();
  for (const [name, action] of Object.entries(appActions)) {
    if (action.command === undefined) continue;
    const { name: commandName, description, aliases } = action.command;
    registry.register({
      name: commandName,
      description,
      aliases,
      scope: action.scope,
      shortcut: keymap.describe(name),
      run: () => undefined,
    });
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

  it("gives every pane a home and a one-line empty state", () => {
    for (const definition of paneRegistry.values()) {
      const line = definition.emptyState(keys);
      expect(line, definition.kind).not.toBe("");
      expect(line, definition.kind).not.toContain("\n");
      expect(line, definition.kind).not.toContain("an unbound key");
      expect(line, definition.kind).not.toMatch(/alt\+enter|steer/);
      expect(["main", "left", "right"]).toContain(definition.home);
    }
  });

  it("T7: names exactly one next action carrying exactly one bound chord", () => {
    for (const definition of paneRegistry.values()) {
      const [state, action, ...extra] = definition.emptyState(markedKeys).split(" · ");
      expect(extra, definition.kind).toEqual([]);
      expect(chordsIn(state ?? ""), definition.kind).toEqual([]);
      const chords = chordsIn(action ?? "");
      expect(chords, definition.kind).toHaveLength(1);
      for (const chord of chords) expect(keymap.describe(chord), chord).toBeDefined();
    }
  });

  it("T7: fits every empty state into a 320 px pane without overflow", () => {
    const narrowest = Math.max(
      ...[...paneRegistry.values()].map((definition) =>
        emptyStateMinWidthPx(definition.emptyState(keys)),
      ),
    );
    expect(narrowest).toBeLessThanOrEqual(narrowPanePx);
    expect(narrowest).toBeLessThanOrEqual(ratchetValue("T7.emptyStateMinWidthPx"));
    expect(emptyStateCss).not.toMatch(/white-space:\s*(nowrap|pre)\b/);
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

  it("passes checkPaneDefinition for every registered pane, as each pane's own test does", () => {
    for (const definition of paneRegistry.values()) checkPaneDefinition(definition);
  });

  it("binds every pane-local action to its own kind and keeps the table collision-free", () => {
    for (const [name, action] of Object.entries(paneActions)) {
      if (action.scope === undefined) continue;
      expect(paneRegistry.get(action.scope)?.localActions?.[name]).toBeDefined();
    }
    expect(() => new Keymap({ bindings: keymapBindings(), scopes: actionScopes })).not.toThrow();
  });
});

const emptyStateCss = readFileSync(
  join(process.cwd(), "packages/ui/src/panes/empty-state.css"),
  "utf8",
);

function keymapBindings(): Record<string, string | readonly string[]> {
  return Object.fromEntries(
    Object.entries(appActions).map(([name, action]) => [name, action.chords]),
  );
}

describe("closing a pane that guards itself", () => {
  it("holds the first close back with the pane's reason and lets the same close through on a second ask", async () => {
    let now = 0;
    const gate = createCloseGate(() => now);
    gate.guard("terminal-1", async () => "ping is running");
    expect(await gate.holdBack("terminal-1", () => 5000)).toBe("ping is running");
    now = 4000;
    expect(await gate.holdBack("terminal-1", () => 5000)).toBeUndefined();
  });

  it("lets a second ask through at once, without waiting on the pane again", async () => {
    let now = 0;
    let asked = 0;
    const gate = createCloseGate(() => now);
    gate.guard("terminal-1", async () => {
      asked += 1;
      now += 1500;
      return "ping is running";
    });
    expect(await gate.holdBack("terminal-1", () => 2000)).toBe("ping is running");
    now = 3400;
    expect(await gate.holdBack("terminal-1", () => 2000)).toBeUndefined();
    expect(asked).toBe(1);
  });

  it("asks again once the warning has lapsed or another pane was asked about", async () => {
    let now = 0;
    const gate = createCloseGate(() => now);
    gate.guard("terminal-1", async () => "ping is running");
    gate.guard("terminal-2", async () => "vim is running");
    await gate.holdBack("terminal-1", () => 1000);
    now = 2000;
    expect(await gate.holdBack("terminal-1", () => 1000)).toBe("ping is running");
    expect(await gate.holdBack("terminal-2", () => 1000)).toBe("vim is running");
    expect(await gate.holdBack("terminal-1", () => 1000)).toBe("ping is running");
  });

  it("lets an idle pane or one with no guard close at once, and forgets a guard when its pane goes", async () => {
    const gate = createCloseGate(() => 0);
    const release = gate.guard("terminal-1", async () => "ping is running");
    expect(gate.guards("terminal-1")).toBe(true);
    expect(gate.guards("conversation-1")).toBe(false);
    gate.guard("terminal-2", async () => undefined);
    expect(await gate.holdBack("terminal-2", () => 1000)).toBeUndefined();
    expect(await gate.holdBack("conversation-1", () => 1000)).toBeUndefined();
    release();
    expect(gate.guards("terminal-1")).toBe(false);
    expect(await gate.holdBack("terminal-1", () => 1000)).toBeUndefined();
  });
});
