import { defaultSkinId, skinIds } from "../panes/stead/habitat-render.ts";

export const placeholderSkinId = "placeholder";

export function offeredSkins(ids: readonly string[] = skinIds()): string[] {
  const offered = ids.filter((id) => id !== placeholderSkinId);
  return offered.length > 0 ? offered : [defaultSkinId];
}

export function hatchlingAmong(
  offered: readonly string[],
  worn: readonly string[],
  random: () => number = Math.random,
): string {
  const unworn = offered.filter((id) => !worn.includes(id));
  const nest = unworn.length > 0 ? unworn : offered;
  return nest[Math.min(nest.length - 1, Math.floor(random() * nest.length))] ?? defaultSkinId;
}

export function lookBeside(current: string, offered: readonly string[], step: number): string {
  if (offered.length === 0) return current;
  const at = Math.max(0, offered.indexOf(current));
  return offered[(at + step + offered.length) % offered.length] ?? current;
}
