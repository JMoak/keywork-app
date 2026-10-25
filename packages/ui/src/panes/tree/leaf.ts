import type { TreeRow } from "@keywork-app/client";
import type { LeafOutcome } from "@keywork-app/protocol";

export const alreadyTheLeafNotice = "the next prompt already continues from here";

export function entriesFirstNotice(diveKey: string, leafKey: string): string {
  return `${diveKey} opens this session's tree · ${leafKey} there continues from an entry`;
}

export function leafNotice(
  outcome: LeafOutcome,
  target: Pick<TreeRow, "hasChildren">,
  refreshKey: string,
): string {
  if (typeof outcome !== "string") {
    return target.hasChildren
      ? "the next prompt starts a new branch from here"
      : "the next prompt continues from here";
  }
  switch (outcome) {
    case "busy":
      return "a turn is running · let it finish or stop it, then continue from here";
    case "unknown-entry":
      return `that entry is gone · ${refreshKey} rereads the tree`;
    case "missing":
      return "this session is gone";
  }
}
