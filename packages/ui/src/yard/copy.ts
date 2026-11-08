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

export const decisionsHead = "the yard's last decisions · enter closes";

export const noDecisions = "no decisions yet";

export function budgetLine(
  card: { readonly used: number; readonly limit: number; readonly nextFreeAt: number },
  clock: (ms: number) => string,
): string {
  const next =
    card.used < card.limit ? "the next is free" : `next free at ${clock(card.nextFreeAt)}`;
  return `${card.used} of ${card.limit} unfolds · ${next}`;
}

export function decisionLine(
  decision: { readonly at: number; readonly rung: string; readonly reason: string },
  what: string,
  clock: (ms: number) => string,
): string {
  return `${clock(decision.at)} · ${what} · ${decision.rung} · ${decision.reason}`;
}

export function groupLine(owner: string, count: number, creatureLess: boolean): string {
  return creatureLess ? `${count} things from ${owner}` : `${owner} set out ${count} things`;
}

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

export const withdrawnLine = "withdrawn · it folds when you leave it";

export const withdrawnMark = "withdrawn";

export function unansweredLine(detail: string): string {
  return `not answered · ${detail}`;
}
