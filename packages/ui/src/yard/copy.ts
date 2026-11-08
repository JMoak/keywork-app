import type { KeeperShowOutcome, Setting, SettingKind } from "@keywork-app/protocol";

export const railLabel = "the yard's rail";

export const emptyRail = "nothing set out";

export const railHint = "j k move · enter opens · x dismisses · p pins · esc returns";

export const kindWords: Readonly<Record<SettingKind, string>> = {
  file: "a file",
  diff: "a change",
  report: "a report",
  thread: "a thread",
  chore: "a chore",
  url: "a link",
  note: "a note",
};

export const answeredLines: Readonly<Record<KeeperShowOutcome, string>> = {
  seen: "seen · it folds",
  pinned: "pinned · it stays out",
  unpinned: "unpinned · it folds once settled",
  dismissed: "dismissed · it folds",
};

export function heldBackLine(count: number): string {
  return `while you were away · ${count} held back as ${count === 1 ? "a card" : "cards"}`;
}

export function foldedLine(count: number): string {
  return `${count} more folded`;
}

export function setOutLine(setting: Pick<Setting, "creature" | "what">, owner: string): string {
  const what = kindWords[setting.what.kind];
  return setting.creature === null ? `${what} from ${owner}` : `${owner} set out ${what}`;
}

export function yardShownLine(tilesChord: string): string {
  return `the yard · ${tilesChord} lays out tiles`;
}

export function tilesShownLine(yardChord: string): string {
  return `tiles · ${yardChord} returns to the yard`;
}

export function unansweredLine(detail: string): string {
  return `not answered · ${detail}`;
}
