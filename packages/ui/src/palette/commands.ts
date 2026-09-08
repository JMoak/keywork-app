export interface CommandSpec {
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[];
  readonly shortcut?: string | undefined;
  readonly jump?: true;
  readonly label?: string;
  readonly run: () => void;
}

export type Registration =
  | { kind: "registered" }
  | { kind: "collision"; name: string; claimedBy: string };

export class CommandRegistry {
  private readonly commands: CommandSpec[] = [];
  private readonly sources: Array<() => CommandSpec[]> = [];

  register(command: CommandSpec): Registration {
    for (const name of namesOf(command)) {
      const owner = findByName(this.commands, name);
      if (owner !== undefined) return { kind: "collision", name, claimedBy: owner.name };
    }
    this.commands.push(command);
    return { kind: "registered" };
  }

  addSource(source: () => CommandSpec[]): void {
    this.sources.push(source);
  }

  all(): CommandSpec[] {
    return [...this.commands, ...this.sources.flatMap((source) => source())];
  }

  search(query: string): CommandSpec[] {
    const trimmed = query.trim().toLowerCase();
    const commands = this.all();
    if (trimmed === "") return commands;
    return commands
      .map((command) => ({ command, score: bestScore(command, trimmed) }))
      .filter(
        (match): match is { command: CommandSpec; score: number } => match.score !== undefined,
      )
      .sort((left, right) => right.score - left.score)
      .map((match) => match.command);
  }

  run(name: string): boolean {
    const found = findByName(this.all(), name.trim());
    if (found === undefined) return false;
    found.run();
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

function namesOf(command: CommandSpec): string[] {
  return [command.name, ...(command.aliases ?? [])];
}

function findByName(commands: readonly CommandSpec[], raw: string): CommandSpec | undefined {
  const name = raw.toLowerCase();
  if (name === "") return undefined;
  return commands.find((command) =>
    namesOf(command).some((candidate) => candidate.toLowerCase() === name),
  );
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
