import { type EffortLevel, effortLevels, isEffortLevel } from "@keywork-app/protocol";
import type { ArgumentChoice } from "../../palette/commands.ts";
import { nextEffort } from "./controls.ts";

export type EffortWord = EffortLevel | "default";

export const effortWords: readonly EffortWord[] = [...effortLevels, "default"];

export const thinkingUsage = "/thinking on|off";

export const effortUsage = `/effort ${effortWords.join("|")}`;

export type EffortChoice =
  | { kind: "level"; level: EffortLevel | null }
  | { kind: "unknown"; word: string };

export interface ModelsKnown {
  readonly models: readonly string[];
  readonly current: string | undefined;
  readonly elsewhere: (model: string) => number;
}

export function modelChoices(known: ModelsKnown): ArgumentChoice[] {
  const others = known.models.filter((model) => model !== known.current);
  const current = known.current === undefined ? [] : [known.current];
  const alone = others.length === 0;
  return [
    ...current.map((model) => ({ value: model, description: currentModelLine(alone) })),
    ...others.map((model) => ({
      value: model,
      description: otherModelLine(known.elsewhere(model)),
    })),
  ];
}

export function thinkingChoices(showing: boolean): ArgumentChoice[] {
  return [
    { value: "on", description: markedNow("show the model's reasoning as it works", showing) },
    { value: "off", description: markedNow("hide it, progress notes still show", !showing) },
  ];
}

export function effortChoices(current: EffortLevel | undefined): ArgumentChoice[] {
  return effortWords.map((word) => ({
    value: word,
    description: markedNow(effortMeanings[word], word === (current ?? "default")),
  }));
}

export function thinkingFrom(argument: string | undefined, showing: boolean): boolean | undefined {
  const word = argument?.trim().toLowerCase();
  if (word === undefined || word === "") return !showing;
  if (word === "on") return true;
  return word === "off" ? false : undefined;
}

export function effortFrom(
  argument: string | undefined,
  current: EffortLevel | undefined,
): EffortChoice {
  const word = argument?.trim().toLowerCase();
  if (word === undefined || word === "") return { kind: "level", level: nextEffort(current) };
  if (word === "default") return { kind: "level", level: null };
  return isEffortLevel(word) ? { kind: "level", level: word } : { kind: "unknown", word };
}

const effortMeanings: Readonly<Record<EffortWord, string>> = {
  low: "quick replies, the least reasoning",
  medium: "a fair amount of reasoning",
  high: "more reasoning for harder work",
  xhigh: "more again, slower and pricier",
  max: "all the reasoning the model offers",
  default: "whatever the provider picks",
};

function markedNow(meaning: string, now: boolean): string {
  return now ? `${meaning} · now` : meaning;
}

function currentModelLine(alone: boolean): string {
  return alone ? "this session's model · type provider/model for another" : "this session's model";
}

function otherModelLine(sessions: number): string {
  if (sessions === 0) return "keywork knows it";
  return sessions === 1 ? "another session runs it" : `${sessions} other sessions run it`;
}
