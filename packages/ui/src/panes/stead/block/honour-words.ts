import type { Honour, SteadHonourKind } from "@keywork-app/protocol";

export type NameOf = (slug: string) => string;

export const greenName = "the green";
export const greenLine = "The green keeps what the stead has earned.";
export const steadEarnedHeading = "What the stead has earned";

export function honourTitle(honour: Honour, nameOf: NameOf): string {
  const partner = nameOf(honour.with ?? "");
  const folder = lastPart(honour.with ?? "");
  switch (honour.kind) {
    case "conversations":
      return `${upFirst(counted(conversationCounts, honour.tier))} conversations`;
    case "night":
      return "A night worked through";
    case "partners":
      return `${upFirst(counted(handoffCounts, honour.tier))} hand-offs with ${partner}`;
    case "tower":
      return `${honour.tier >= 2 ? "A skyscraper" : "A tower"}: ${folder}`;
    case "standing":
      return `${upFirst(years(honour.tier))} standing`;
    case "range":
      return `${upFirst(tool(honour.tier))} tool`;
    case "run":
      return `A ribbon: ${counted(runCounts, honour.tier)} days in a row`;
    case "paved-road":
      return `${steadTitles[honour.kind]}${between(pairOf(honour.with).map(nameOf))}`;
    case "first-tower":
      return `${steadTitles[honour.kind]}${honour.with === null ? "" : `: ${folder}`}`;
    default:
      return steadTitles[honour.kind];
  }
}

export function earnedLine(honour: Honour, nameOf: NameOf): string {
  const name = honour.holder === null ? "The stead" : nameOf(honour.holder);
  const partner = nameOf(honour.with ?? "");
  const folder = lastPart(honour.with ?? "");
  switch (honour.kind) {
    case "conversations":
      return `${name} reached ${counted(conversationCounts, honour.tier)} conversations.`;
    case "night":
      return `${name} worked its first night through.`;
    case "partners":
      return `${name} and ${partner} reached ${counted(handoffCounts, honour.tier)} hand-offs.`;
    case "tower":
      return `${name}'s ${folder} became a ${honour.tier >= 2 ? "skyscraper" : "tower"}.`;
    case "standing":
      return `${name} has stood ${years(honour.tier)}.`;
    case "range":
      return `${name} earned ${tool(honour.tier)} tool.`;
    case "run":
      return `${name} earned a ribbon: ${counted(runCounts, honour.tier)} days in a row.`;
    case "first-creature":
      return `${name} has its first creature.`;
    case "hamlet":
      return `${name} is a hamlet now.`;
    case "town":
      return `${name} is a town now.`;
    case "paved-road":
      return `${name} has its first paved road.`;
    case "first-tower":
      return `${name} has its first tower.`;
  }
}

export function earnedLines(honours: readonly Honour[], nameOf: NameOf): string {
  return honours.map((honour) => earnedLine(honour, nameOf)).join(" ");
}

const steadTitles: Readonly<Record<SteadHonourKind, string>> = {
  "first-creature": "The first creature",
  hamlet: "A hamlet",
  town: "A town",
  "paved-road": "The first paved road",
  "first-tower": "The first tower",
};

const conversationCounts = ["ten", "a hundred", "a thousand"] as const;
const handoffCounts = ["ten", "a hundred"] as const;
const runCounts = ["seven", "thirty", "a hundred"] as const;
const tools = ["an iron", "a gold", "a star-metal"] as const;
const numerals = ["a", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function counted(words: readonly string[], tier: number): string {
  return words[tier - 1] ?? words.at(-1) ?? "";
}

function tool(tier: number): string {
  return counted(tools, tier);
}

function years(tier: number): string {
  return tier === 1 ? "a year" : `${numerals[tier - 1] ?? String(tier)} years`;
}

function pairOf(pair: string | null): string[] {
  return pair === null ? [] : pair.split("+").filter((slug) => slug !== "");
}

function between(names: readonly string[]): string {
  return names.length === 0 ? "" : `: ${names.join(" and ")}`;
}

function upFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lastPart(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) ?? path
  );
}
