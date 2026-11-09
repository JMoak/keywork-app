import { byDepth } from "./depth.ts";
import { ownerKeyOf, ownerOf, type YardOwner, type YardSetting } from "./types.ts";

export const floodSize = 4;

export interface YardGroup {
  readonly key: string;
  readonly owner: YardOwner;
  readonly head: YardSetting;
  readonly members: readonly YardSetting[];
}

export function groupsOf(settings: readonly YardSetting[]): readonly YardGroup[] {
  return [...liveCardsByOwner(settings).entries()]
    .flatMap(([key, cards]) => {
      const members = cards.toSorted(byDepth);
      const [head] = members;
      return head === undefined || members.length < floodSize
        ? []
        : [{ key, owner: ownerOf(head), head, members }];
    })
    .sort((a, b) => byDepth(a.head, b.head));
}

export function grouped(
  settings: readonly YardSetting[],
  open: readonly string[] = [],
): readonly YardSetting[] {
  const tucked = new Set(
    groupsOf(settings)
      .filter((group) => !open.includes(group.key))
      .flatMap((group) => group.members.slice(1).map((member) => member.id)),
  );
  return settings.filter((setting) => !tucked.has(setting.id));
}

function liveCardsByOwner(settings: readonly YardSetting[]): Map<string, YardSetting[]> {
  const byOwner = new Map<string, YardSetting[]>();
  for (const setting of settings.filter(liveCard)) {
    const key = ownerKeyOf(ownerOf(setting));
    byOwner.set(key, [...(byOwner.get(key) ?? []), setting]);
  }
  return byOwner;
}

function liveCard(setting: YardSetting): boolean {
  return setting.state === "live" && setting.shown === "card" && setting.folded === undefined;
}
