import type { ArgumentChoice, CommandRegistry, CommandSpec } from "./commands.ts";

export interface SlashContext {
  readonly registry: CommandRegistry;
  readonly scope?: string | undefined;
}

export interface Invocation {
  readonly verb: string;
  readonly rest: string | undefined;
}

export type Suggestion =
  | { readonly kind: "command"; readonly command: CommandSpec }
  | {
      readonly kind: "value";
      readonly command: CommandSpec;
      readonly value: string;
      readonly description: string | undefined;
    };

export type Resolution =
  | { readonly kind: "run"; readonly command: CommandSpec; readonly argument: string | undefined }
  | { readonly kind: "complete"; readonly text: string }
  | { readonly kind: "unknown"; readonly verb: string };

export const suggestionLimit = 10;

export function invocationOf(text: string): Invocation {
  const trimmed = text.trimStart();
  const space = trimmed.search(/\s/);
  return space === -1
    ? { verb: trimmed, rest: undefined }
    : { verb: trimmed.slice(0, space), rest: trimmed.slice(space + 1) };
}

export function argumentOf(invocation: Invocation): string | undefined {
  const argument = invocation.rest?.trim() ?? "";
  return argument === "" ? undefined : argument;
}

export function slashSuggestions(context: SlashContext, text: string): Suggestion[] {
  const invocation = invocationOf(text);
  const named = typedCommand(context, invocation);
  if (named !== undefined) return argumentSuggestions(named, argumentOf(invocation));
  if (invocation.rest !== undefined) return [];
  const found = context.registry
    .search(invocation.verb, context.scope)
    .filter((command) => command.jump !== true);
  const ranked = invocation.verb === "" ? ownScopeFirst(found, context.scope) : found;
  return ranked.slice(0, suggestionLimit).map((command) => ({ kind: "command", command }));
}

export function resolveSlash(
  context: SlashContext,
  text: string,
  chosen: Suggestion | undefined,
): Resolution {
  const invocation = invocationOf(text);
  if (chosen?.kind === "value") return runWith(chosen.command, chosen.value);
  const argument = argumentOf(invocation);
  const named = typedCommand(context, invocation);
  if (named !== undefined) return runWith(named, argument);
  const pickedWhileTypingVerb = invocation.rest === undefined ? chosen?.command : undefined;
  return pickedWhileTypingVerb === undefined
    ? { kind: "unknown", verb: invocation.verb }
    : runWith(pickedWhileTypingVerb, argument);
}

export function completionOf(suggestion: Suggestion): string {
  const { command } = suggestion;
  if (suggestion.kind === "value") return `${command.name} ${suggestion.value}`;
  return command.argument === undefined ? command.name : `${command.name} `;
}

export function descriptionOf(suggestion: Suggestion): string {
  return suggestion.kind === "value"
    ? (suggestion.description ?? suggestion.command.description)
    : suggestion.command.description;
}

export function hintOf(command: CommandSpec): string | undefined {
  return command.argument?.hint;
}

function ownScopeFirst(commands: readonly CommandSpec[], scope: string | undefined): CommandSpec[] {
  const own = commands.filter((command) => scope !== undefined && command.scope === scope);
  return [...own, ...commands.filter((command) => !own.includes(command))];
}

function typedCommand(context: SlashContext, invocation: Invocation): CommandSpec | undefined {
  if (invocation.rest === undefined) return undefined;
  const command = context.registry.find(invocation.verb, context.scope);
  return command?.jump === true ? undefined : command;
}

function argumentSuggestions(command: CommandSpec, typed: string | undefined): Suggestion[] {
  const wanted = (typed ?? "").toLowerCase();
  const exactFirst = (choice: ArgumentChoice): number =>
    choice.value.toLowerCase() === wanted ? 0 : 1;
  const choices = (command.argument?.choices?.() ?? [])
    .filter((choice) => choice.value.toLowerCase().startsWith(wanted))
    .sort((left, right) => exactFirst(left) - exactFirst(right))
    .slice(0, suggestionLimit);
  return choices.length === 0
    ? [{ kind: "command", command }]
    : choices.map((choice) => ({
        kind: "value",
        command,
        value: choice.value,
        description: choice.description,
      }));
}

function runWith(command: CommandSpec, argument: string | undefined): Resolution {
  if (argument === undefined && command.argument?.required === true) {
    return { kind: "complete", text: `${command.name} ` };
  }
  return { kind: "run", command, argument };
}
