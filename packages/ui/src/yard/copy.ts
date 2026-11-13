import type { KeeperShowOutcome, Rung, Setting, SettingKind } from "@keywork-app/protocol";

export const railLabel = "the yard's rail";

export const emptyRail = "nothing to show yet";

export const railHint =
  "j k move · enter opens · x dismisses · p pins · t trail · [ ] walk · esc returns";

export const trailHint = "j k move · [ ] walk the chain · enter opens · t now · esc returns";

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
  seen: "marked seen · it leaves the yard",
  pinned: "pinned · it stays open",
  unpinned: "unpinned · it closes once settled",
  dismissed: "dismissed · it closes",
};

export const decisionsHead = "the yard's last decisions · enter closes";

export const noDecisions = "no decisions yet";

export function budgetLine(
  card: {
    readonly used: number;
    readonly limit: number;
    readonly windowMs: number;
    readonly nextFreeAt: number;
  },
  clock: (ms: number) => string,
): string {
  if (card.used >= card.limit)
    return `${card.used} of ${card.limit} opened · next at ${clock(card.nextFreeAt)}`;
  const minutes = Math.round(card.windowMs / 60_000);
  return `${card.used} of ${card.limit} panels opened in ${minutes} min`;
}

export function attendedLine(title: string, size: string, reason: string): string {
  return `attended · ${title} · ${size} · ${reason}`;
}

export const rungWords: Readonly<Record<Rung, string>> = {
  glyph: "waiting",
  lantern: "marked on its pane",
  card: "kept as a card",
  unfold: "opened beside",
  stage: "given the whole view",
};

export function decisionLine(
  decision: { readonly at: number; readonly rung: Rung; readonly reason: string },
  what: string,
  clock: (ms: number) => string,
): string {
  return `${clock(decision.at)} · ${what} · ${rungWords[decision.rung]} · ${decision.reason}`;
}

export function groupLine(owner: string, count: number, creatureLess: boolean): string {
  return creatureLess ? `${count} things from ${owner}` : `${owner} showed ${count} things`;
}

export function awayLine(heldBack: number, folded: readonly string[]): string {
  const parts = [
    ...(heldBack > 0 ? [`${heldBack} held back as ${heldBack === 1 ? "a card" : "cards"}`] : []),
    ...(folded.length > 0 ? [`${folded.join(" and ")} closed`] : []),
  ];
  return `while you were away · ${parts.join(" · ")}`;
}

export function foldedLine(below: number, above = 0): string {
  if (above === 0) return `${below} more below · j reaches them`;
  if (below === 0) return `${above} more above · k reaches them`;
  return `${above} above · ${below} below · j k reach them`;
}

export function setOutLine(setting: Pick<Setting, "creature" | "what">, owner: string): string {
  const what = kindWords[setting.what.kind];
  return setting.creature === null ? `${what} from ${owner}` : `${owner} showed ${what}`;
}

export function arrivedLine(lines: readonly string[], railChord: string): string {
  const [only] = lines;
  if (lines.length === 1 && only !== undefined) return `${only} · ${railChord} reaches it`;
  return `${lines.length} new things to see · ${railChord} reaches them`;
}

export function openedByYouLine(parentTitle: string | undefined): string {
  return parentTitle === undefined ? "you opened it" : `you opened it from ${parentTitle}`;
}

export function yardShownLine(tilesChord: string): string {
  return `the yard · what the model shows opens beside the conversation · ${tilesChord} lays out tiles`;
}

export function tilesShownLine(yardChord: string): string {
  return `tiles · what the model shows waits as cards · ${yardChord} returns to the yard`;
}

export const withdrawnLine = "the model took it back · it closes when you leave it";

export const withdrawnMark = "taken back";

export function unansweredLine(detail: string): string {
  return `not answered · ${detail}`;
}

export function openedBesideLine(title: string, parentTitle: string): string {
  return `${title} opens beside ${parentTitle}`;
}

export function openedAsCardLine(title: string, railChord: string): string {
  return `${title} waits as a card · no room to open it beside · ${railChord} reaches it`;
}

export function unopenedLine(detail: string): string {
  return `not opened · ${detail}`;
}

export function readingHead(title: string): string {
  return `${title} · enter or esc closes`;
}

export const trailLabel = "the trail to the focused panel";

export const trailShownLine = "the trail · newest branch first";

export const nowShownLine = "now · most relevant first";

export const chainEndLine = "the end of this chain";

export const chainRootLine = "the root of this chain";

export function walkedLine(chain: string, title: string): string {
  return `${chain} · at ${title}`;
}

export function plotLine(members: number): string {
  return members === 1 ? "1 closed panel" : `${members} closed panels`;
}

export function plotHint(members: number): string {
  return members === 1
    ? "enter reopens it · x dismisses it"
    : "enter reopens · x dismisses them all";
}

export function restoredLine(chain: string): string {
  return `${chain} · reopened`;
}
