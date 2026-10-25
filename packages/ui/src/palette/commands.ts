export interface CommandSpec {
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[] | undefined;
  readonly shortcut?: string | undefined;
  readonly scope?: string | undefined;
  readonly argument?: CommandArgument | undefined;
  readonly claimant?: string | undefined;
  readonly jump?: true;
  readonly label?: string;
  readonly run: (argument?: string) => void;
}

export interface CommandArgument {
  readonly hint: string;
  readonly required?: boolean | undefined;
  readonly choices?: (() => readonly ArgumentChoice[]) | undefined;
}

export interface ArgumentChoice {
  readonly value: string;
  readonly description?: string | undefined;
}

export class CommandCollision extends Error {
  override readonly name = "CommandCollision";
}

export class CommandRegistry {
  private readonly commands: CommandSpec[] = [];
  private readonly sources: Array<() => CommandSpec[]> = [];

  register(command: CommandSpec): void {
    for (const name of namesOf(command)) {
      const rival = this.commands.find((held) => contends(held, command) && answersTo(held, name));
      if (rival !== undefined) throw new CommandCollision(collisionLine(name, rival, command));
    }
    this.commands.push(command);
  }

  addSource(source: () => CommandSpec[]): void {
    this.sources.push(source);
  }

  all(scope?: string): CommandSpec[] {
    const fixed = this.commands.filter((command) => visibleIn(command, scope));
    const shadowed = (drawn: CommandSpec): boolean =>
      fixed.some((held) => held.jump === drawn.jump && sharesAName(held, drawn));
    const drawn = this.sources
      .flatMap((source) => source())
      .filter((command) => visibleIn(command, scope) && !shadowed(command));
    return [...fixed, ...drawn];
  }

  ownedBy(scope: string): CommandSpec[] {
    return this.commands.filter((command) => command.scope === scope);
  }

  search(query: string, scope?: string): CommandSpec[] {
    const trimmed = query.trim().toLowerCase();
    const commands = this.all(scope);
    if (trimmed === "") return commands;
    return commands
      .map((command) => ({ command, score: bestScore(command, trimmed) }))
      .filter(
        (match): match is { command: CommandSpec; score: number } => match.score !== undefined,
      )
      .sort((left, right) => right.score - left.score)
      .map((match) => match.command);
  }

  find(name: string, scope?: string): CommandSpec | undefined {
    const wanted = name.trim();
    if (wanted === "") return undefined;
    return this.all(scope).find((command) => answersTo(command, wanted));
  }

  run(input: string, scope?: string): boolean {
    const trimmed = input.trim();
    const whole = this.find(trimmed, scope);
    if (whole !== undefined) {
      whole.run();
      return true;
    }
    const space = trimmed.search(/\s/);
    const named = space === -1 ? undefined : this.find(trimmed.slice(0, space), scope);
    if (named === undefined) return false;
    named.run(trimmed.slice(space).trim());
    return true;
  }
}

export function fuzzyScore(query: string, candidate: string): number | undefined {
  if (query === candidate) return 1000;
  if (candidate.startsWith(query)) return 500 + query.length - candidate.length / 100;
  let score = 0;
  let at = 0;
  let previousHit = -2;
  for (const character of query) {
    const found = candidate.indexOf(character, at);
    if (found === -1) return undefined;
    score += found === previousHit + 1 ? 10 : 1;
    if (found === 0 || candidate[found - 1] === "-") score += 5;
    previousHit = found;
    at = found + 1;
  }
  return score - candidate.length / 100;
}

export function fuzzyMatches(query: string, candidate: string): number[] | undefined {
  const wanted = query.trim().toLowerCase();
  const text = candidate.toLowerCase();
  if (text.startsWith(wanted)) return Array.from(wanted, (_, index) => index);
  const hits: number[] = [];
  for (const character of wanted) {
    const found = text.indexOf(character, (hits.at(-1) ?? -1) + 1);
    if (found === -1) return undefined;
    hits.push(found);
  }
  return hits;
}

function namesOf(command: CommandSpec): string[] {
  return [command.name, ...(command.aliases ?? [])];
}

function answersTo(command: CommandSpec, name: string): boolean {
  const wanted = name.toLowerCase();
  return namesOf(command).some((candidate) => candidate.toLowerCase() === wanted);
}

function sharesAName(left: CommandSpec, right: CommandSpec): boolean {
  return namesOf(right).some((name) => answersTo(left, name));
}

function visibleIn(command: CommandSpec, scope: string | undefined): boolean {
  return command.scope === undefined || command.scope === scope;
}

function contends(held: CommandSpec, claimant: CommandSpec): boolean {
  return held.scope === undefined || claimant.scope === undefined || held.scope === claimant.scope;
}

function collisionLine(name: string, held: CommandSpec, claimant: CommandSpec): string {
  return `palette name "${name}" is claimed by both ${claimantOf(held)} and ${claimantOf(claimant)}`;
}

function claimantOf(command: CommandSpec): string {
  const owner = command.claimant ?? command.name;
  return command.scope === undefined ? owner : `${owner} in the ${command.scope} pane`;
}

function bestScore(command: CommandSpec, query: string): number | undefined {
  const candidates = [
    command.name,
    ...(command.label === undefined ? [] : [command.label.toLowerCase()]),
    ...(command.aliases ?? []),
  ];
  const scores = candidates
    .map((candidate) => fuzzyScore(query, candidate))
    .filter((score): score is number => score !== undefined);
  return scores.length === 0 ? undefined : Math.max(...scores);
}
