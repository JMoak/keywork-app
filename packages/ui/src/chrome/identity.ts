import type { BotSummary, SessionSummary } from "@keywork-app/protocol";

export function botTitle(
  summary: SessionSummary | undefined,
  bots: readonly Pick<BotSummary, "name" | "sigil">[],
): string | undefined {
  const name = summary?.bot;
  if (name === undefined) return undefined;
  const bot = bots.find((candidate) => candidate.name === name);
  return bot === undefined ? name : `${bot.sigil} ${bot.name}`;
}

export function arcHueRank(
  summary: SessionSummary | undefined,
  ordinals: Readonly<Record<string, number>>,
): number | undefined {
  const slug = summary?.arc;
  return slug === undefined ? undefined : ordinals[slug];
}
