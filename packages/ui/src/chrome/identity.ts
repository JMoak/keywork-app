import type { BotSummary, SessionSummary } from "@keywork-app/protocol";

export type BotIdentity = Pick<BotSummary, "name" | "sigil">;

export interface TitleBot {
  readonly sigil?: string | undefined;
  readonly name: string;
}

export function titleBot(
  summary: SessionSummary | undefined,
  bots: readonly BotIdentity[],
): TitleBot | undefined {
  const name = summary?.bot;
  return name === undefined ? undefined : botIdentified(name, bots);
}

export function botNamed(name: string, bots: readonly BotIdentity[]): string {
  const bot = botIdentified(name, bots);
  return bot.sigil === undefined ? bot.name : `${bot.sigil} ${bot.name}`;
}

export function arcHueRank(
  summary: SessionSummary | undefined,
  ordinals: Readonly<Record<string, number>>,
): number | undefined {
  const slug = summary?.arc;
  return slug === undefined ? undefined : ordinals[slug];
}

function botIdentified(name: string, bots: readonly BotIdentity[]): TitleBot {
  const bot = bots.find((candidate) => candidate.name === name);
  return bot === undefined ? { name } : { sigil: bot.sigil, name: bot.name };
}
