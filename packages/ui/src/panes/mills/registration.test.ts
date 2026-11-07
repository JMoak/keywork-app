import { describe, expect, it } from "vitest";
import { type AppAction, actionScopes, appActions } from "../../keys/actions.ts";
import { Keymap } from "../../keys/keymap.ts";
import { CommandRegistry, type CommandSpec } from "../../palette/commands.ts";
import type { PaneLocalAction } from "../registry.ts";
import { checkPaneDefinition } from "../testing.ts";
import { millsPane } from "./index.tsx";

const millsLocal: ReadonlyArray<[string, PaneLocalAction]> = Object.entries(
  millsPane.localActions ?? {},
);
const millsNames = new Set([...millsLocal.map(([name]) => name), millsPane.summon?.action]);
const others: ReadonlyArray<[string, AppAction]> = Object.entries(appActions).filter(
  ([name]) => !millsNames.has(name),
);

describe("the mills pane registration", () => {
  it("binds its keys in its own scope beside every other action without a collision", () => {
    const bindings = Object.fromEntries([
      ...others.map(([name, action]) => [name, action.chords] as const),
      ...millsLocal.map(([name, action]) => [name, action.chords] as const),
    ]);
    const scopes = {
      ...Object.fromEntries(Object.entries(actionScopes).filter(([name]) => !millsNames.has(name))),
      ...Object.fromEntries(millsLocal.map(([name]) => [name, millsPane.kind])),
    } as typeof actionScopes;
    expect(() => new Keymap({ bindings, scopes })).not.toThrow();
  });

  it("adds palette commands no other command or alias claims", () => {
    const palette = new CommandRegistry();
    for (const [, action] of others) {
      if (action.command !== undefined) palette.register(commandOf(action.command, action.scope));
    }
    const summon = millsPane.summon?.command;
    const commands = [
      ...(summon === undefined ? [] : [commandOf(summon, undefined)]),
      ...millsLocal.flatMap(([, action]) =>
        action.command === undefined ? [] : [commandOf(action.command, millsPane.kind)],
      ),
    ];
    expect(commands).toHaveLength(9);
    for (const command of commands) {
      expect(() => palette.register(command), command.name).not.toThrow();
    }
  });
});

function commandOf(
  command: { name: string; description: string; aliases?: readonly string[] | undefined },
  scope: string | undefined,
): CommandSpec {
  return {
    name: command.name,
    description: command.description,
    aliases: command.aliases,
    scope,
    run: () => undefined,
  };
}

describe("the mills pane against the registry's rules", () => {
  it("meets T7 and claims no key or command another action holds", () => {
    checkPaneDefinition(millsPane);
  });
});
