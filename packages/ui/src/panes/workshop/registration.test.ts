import { describe, expect, it } from "vitest";
import { actionScopes, appActions } from "../../keys/actions.ts";
import type { BindingSpec } from "../../keys/keymap.ts";
import { Keymap } from "../../keys/keymap.ts";
import { CommandRegistry } from "../../palette/commands.ts";
import type { ActionCommand } from "../registry.ts";
import { checkPaneDefinition } from "../testing.ts";
import { workshopPane } from "./index.tsx";

const summon = workshopPane.summon;
if (summon === undefined) throw new Error("the workshop pane has no summon");

const ownActions: Record<string, { chords: BindingSpec; scope: string | undefined }> = {
  [summon.action]: { chords: summon.chords, scope: undefined },
  ...Object.fromEntries(
    Object.entries(workshopPane.localActions ?? {}).map(([name, action]) => [
      name,
      { chords: action.chords, scope: workshopPane.kind },
    ]),
  ),
};

function keymapWithWorkshop(): Keymap {
  const bindings: Record<string, BindingSpec> = Object.fromEntries([
    ...Object.entries(appActions).map(([name, action]) => [name, action.chords] as const),
    ...Object.entries(ownActions).map(([name, action]) => [name, action.chords] as const),
  ]);
  const scopes: Record<string, string> = Object.fromEntries([
    ...Object.entries(actionScopes),
    ...Object.entries(ownActions).flatMap(([name, action]) =>
      action.scope === undefined ? [] : [[name, action.scope] as const],
    ),
  ]);
  return new Keymap({ bindings, scopes });
}

describe("registering the workshop pane", () => {
  it("adds no chord that collides with a registered action", () => {
    expect(keymapWithWorkshop).not.toThrow();
    const keymap = keymapWithWorkshop();
    expect(keymap.describe(summon.action)).toBeDefined();
    for (const name of Object.keys(workshopPane.localActions ?? {})) {
      expect(keymap.describe(name), name).toBeDefined();
    }
  });

  it("T7: teaches exactly one next action carrying exactly one bound chord, narrow enough", () => {
    const keymap = keymapWithWorkshop();
    const marked = { chord: (action: string) => `⟦${action}⟧`, leader: () => "⟦leader⟧" };
    const [state, action, ...extra] = workshopPane.emptyState(marked).split(" · ");
    expect(extra).toEqual([]);
    expect(state).not.toMatch(/⟦/);
    const chords = [...(action ?? "").matchAll(/⟦([^⟧]+)⟧/g)].map((match) => match[1] ?? "");
    expect(chords).toHaveLength(1);
    for (const chord of chords) expect(keymap.describe(chord), chord).toBeDefined();
    const real = {
      chord: (name: string) => keymap.describe(name) ?? "an unbound key",
      leader: () => keymap.leader,
    };
    const line = workshopPane.emptyState(real);
    expect(line).not.toContain("an unbound key");
    const longestRun = Math.max(...line.split(/\s+/).map((run) => [...run].length));
    expect(40 + Math.ceil(longestRun * 0.6 * 16)).toBeLessThanOrEqual(320);
  });

  it("adds palette commands that no registered pane already claims", () => {
    const registry = new CommandRegistry();
    const register = (
      name: string,
      action: {
        command?: ActionCommand | undefined;
        scope?: string | undefined;
      },
    ) => {
      if (action.command === undefined) return;
      registry.register({
        name: action.command.name,
        description: action.command.description,
        aliases: action.command.aliases,
        scope: action.scope,
        run: () => undefined,
        claimant: name,
      });
    };
    expect(() => {
      for (const [name, action] of Object.entries(appActions)) register(name, action);
    }).not.toThrow();
    expect(appActions[summon.action]?.command).toBe(summon.command);
    for (const [name, action] of Object.entries(workshopPane.localActions ?? {})) {
      expect(appActions[name]?.command, name).toBe(action.command);
      expect(appActions[name]?.scope, name).toBe(workshopPane.kind);
    }
    expect(registry.run("workshop wren")).toBe(true);
    expect(registry.run("workshop-start", workshopPane.kind)).toBe(true);
  });
});

describe("the workshop pane against the registry's rules", () => {
  it("meets T7 and claims no key or command another action holds", () => {
    checkPaneDefinition(workshopPane);
  });
});
