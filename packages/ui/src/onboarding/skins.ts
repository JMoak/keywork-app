import { hashSeed, mulberry32, pick } from "@keywork-app/habitat";
import { defaultSkinId, skinIds } from "../panes/stead/habitat-render.ts";

export const surpriseMe = "surprise";
export const placeholderSkinId = "placeholder";

export function offeredSkins(ids: readonly string[] = skinIds()): string[] {
  const offered = ids.filter((id) => id !== placeholderSkinId);
  return offered.length > 0 ? offered : [defaultSkinId];
}

export function skinChoices(offered: readonly string[]): string[] {
  return [...offered, surpriseMe];
}

export function surprise(seed: string, offered: readonly string[]): string {
  return pick(mulberry32(hashSeed(seed, "skin")), offered) ?? defaultSkinId;
}

export function chosenSkin(choice: string, seed: string, offered: readonly string[]): string {
  return choice === surpriseMe ? surprise(seed, offered) : choice;
}
