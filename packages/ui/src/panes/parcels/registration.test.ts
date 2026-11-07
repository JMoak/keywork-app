import { describe, expect, it } from "vitest";
import { actionScopes, appActions, coreActions } from "../../keys/actions.ts";
import { Keymap } from "../../keys/keymap.ts";
import { CommandRegistry, type CommandSpec } from "../../palette/commands.ts";
import { ratchetValue } from "../../shell/frame-tick-ratchets.ts";
import type { ActionCommand } from "../registry.ts";
import { checkPaneDefinition } from "../testing.ts";
import { parcelsPane } from "./index.tsx";

const ownBindings = Object.fromEntries([
  ...(parcelsPane.summon === undefined
    ? []
    : [[parcelsPane.summon.action, parcelsPane.summon.chords] as const]),
  ...Object.entries(parcelsPane.localActions ?? {}).map(
    ([name, action]) => [name, action.chords] as const,
  ),
]);

const keymap = new Keymap({
  bindings: {
    ...Object.fromEntries(
      Object.entries(appActions).map(([name, action]) => [name, action.chords]),
    ),
    ...ownBindings,
  },
  scopes: {
    ...actionScopes,
    ...Object.fromEntries(
      Object.keys(parcelsPane.localActions ?? {}).map((name) => [name, "parcels"]),
    ),
  },
});

const markedKeys = { chord: (action: string) => `⟦${action}⟧`, leader: () => "⟦leader⟧" };

describe("the parcels pane as the integrator registers it", () => {
  it("binds its keys beside every app action without a collision", () => {
    for (const name of Object.keys(parcelsPane.localActions ?? {})) {
      expect(keymap.describe(name), name).toBeDefined();
      expect(appActions[name]?.scope, name).toBe("parcels");
    }
    expect(parcelsPane.summon?.action).toBe("parcels.summon");
    expect(coreActions["parcels.summon"]).toBeUndefined();
    expect(appActions["parcels.summon"]?.chords).toEqual(parcelsPane.summon?.chords);
  });

  it("T7: teaches in two parts, the one chord in the action, bound and narrow enough", () => {
    const [state = "", action = "", ...extra] = parcelsPane.emptyState(markedKeys).split(" · ");
    expect(extra).toEqual([]);
    expect(state).not.toMatch(/⟦/);
    const chords = [...action.matchAll(/⟦([^⟧]+)⟧/g)].map((match) => match[1] ?? "");
    expect(chords).toEqual(["parcels.refresh"]);
    expect(keymap.describe("parcels.refresh")).toBe("r");
    const line = parcelsPane.emptyState({
      chord: (name) => keymap.describe(name) ?? "",
      leader: () => "",
    });
    const longestRun = Math.max(...line.split(/\s+/).map((run) => [...run].length));
    const minWidthPx = 2 * 20 + Math.ceil(longestRun * 0.6 * 16);
    expect(minWidthPx).toBeLessThanOrEqual(320);
    expect(minWidthPx).toBeLessThanOrEqual(ratchetValue("T7.emptyStateMinWidthPx"));
  });

  it("lists its open command and every key in the palette without shadowing another", () => {
    const palette = new CommandRegistry();
    expect(() => {
      for (const action of Object.values(appActions)) {
        if (action.command !== undefined)
          palette.register(paletteEntry(action.command, action.scope));
      }
    }).not.toThrow();
    const summon = parcelsPane.summon;
    if (summon === undefined) throw new Error("the parcels pane has no summon");
    expect(appActions[summon.action]?.command).toBe(summon.command);
    for (const [name, action] of Object.entries(parcelsPane.localActions ?? {})) {
      expect(appActions[name]?.command, name).toBe(action.command);
    }
    expect(palette.run("parcels")).toBe(true);
    expect(palette.run("machines")).toBe(true);
  });

  it("parses its own spec and nothing else", () => {
    expect(parcelsPane.spec.safeParse({ kind: "parcels" }).success).toBe(true);
    expect(parcelsPane.spec.safeParse({ kind: "machines" }).success).toBe(false);
    expect(parcelsPane.home).toBe("main");
    expect(parcelsPane.attire).toBe("house");
    expect(parcelsPane.title({ kind: "parcels" }, {} as never)).toBe("parcels");
  });
});

function paletteEntry(command: ActionCommand, scope: string | undefined): CommandSpec {
  return {
    name: command.name,
    description: command.description,
    aliases: command.aliases,
    scope,
    run: () => undefined,
  };
}

describe("the parcels pane against the registry's rules", () => {
  it("meets T7 and claims no key or command another action holds", () => {
    checkPaneDefinition(parcelsPane);
  });
});
