import type { StagedItem, StagedWrite } from "@keywork-app/protocol";
import { type InboxWaiting, inboxNeedsYouAt, waitingKey } from "../../shell/needs-you.ts";

export const stagingKey = "staging";

export function stagedWrites(inbox: readonly StagedItem[]): StagedWrite[] {
  return inbox.filter(isStagedWrite);
}

export function stagingNeedsYou(
  workspace: string,
  inbox: readonly StagedItem[],
  threshold = inboxNeedsYouAt,
): InboxWaiting[] {
  const staged = stagedWrites(inbox);
  const oldest = staged.map((item) => item.created).sort()[0];
  if (staged.length < threshold || oldest === undefined) return [];
  const first = staged.find((item) => item.created === oldest) ?? staged[0];
  return [
    {
      kind: "inbox",
      key: waitingKey(workspace, "inbox", stagingKey),
      workspace,
      since: oldest,
      itemId: first?.id ?? "",
      title: stagingTitle(staged),
    },
  ];
}

export function stagingTitle(staged: readonly StagedWrite[]): string {
  const sources = [...new Set(staged.map((item) => item.source ?? "an untrusted write"))];
  const named = sources.length <= 2 ? sources.join(" and ") : `${sources.length} sources`;
  return `${staged.length} staged from ${named} wait for admit or drop`;
}

function isStagedWrite(item: StagedItem): item is StagedWrite {
  return item.kind === "note" || item.kind === "daily" || item.kind === "moc";
}
