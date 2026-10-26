import type { ActionTarget, AppAction } from "../keys/actions.ts";
import type { LiveKeys } from "../keys/live.ts";
import type { ShellSeams } from "../panes/registry.ts";
import type { CommandArgument, CommandSpec } from "./commands.ts";

export interface ActionCommandSeams {
  readonly shell: ShellSeams;
  readonly target: ActionTarget;
  readonly keys: Pick<LiveKeys, "describe">;
}

export function actionCommand(
  name: string,
  action: AppAction,
  seams: ActionCommandSeams,
): CommandSpec | undefined {
  const command = action.command;
  if (command === undefined) return undefined;
  return {
    name: command.name,
    description: command.description,
    aliases: command.aliases,
    claimant: name,
    scope: action.scope,
    argument: commandArgumentOf(action, seams.shell),
    get shortcut() {
      return seams.keys.describe(name);
    },
    run: (argument) => action.invoke(seams.target, argument),
  };
}

function commandArgumentOf(action: AppAction, shell: ShellSeams): CommandArgument | undefined {
  const argument = action.command?.argument;
  if (argument === undefined) return undefined;
  const choices = argument.choices;
  return {
    hint: argument.hint,
    required: argument.required,
    choices: choices === undefined ? undefined : () => choices(shell),
  };
}
