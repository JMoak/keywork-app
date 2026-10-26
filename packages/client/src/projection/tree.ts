import type {
  BusEnvelope,
  MessagePart,
  SessionEntries,
  SessionEntry,
  TreeChange,
} from "@keywork-app/protocol";

export interface TreeState {
  readonly snapshot: SessionEntries | undefined;
  readonly stale: boolean;
  readonly leafId: string | null | undefined;
  readonly lastChange: TreeChange | undefined;
}

export interface TreeNode {
  readonly entry: SessionEntry;
  readonly label: string | undefined;
  readonly onActivePath: boolean;
  readonly children: readonly TreeNode[];
}

export interface TreeRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly depth: number;
  readonly text: string;
  readonly label: string | undefined;
  readonly onActivePath: boolean;
  readonly isLeaf: boolean;
  readonly hasChildren: boolean;
  readonly branchPoint: boolean;
  readonly folded: boolean;
}

export const emptyTreeState: TreeState = {
  snapshot: undefined,
  stale: true,
  leafId: undefined,
  lastChange: undefined,
};

export function treeState(state: TreeState, envelope: BusEnvelope): TreeState {
  if (envelope.payload.replay === true) return state;
  if (envelope.type === "session.tree") return changedTree(state, envelope.payload);
  if (envelope.type === "session.state") return movedLeaf(state, envelope.payload.leafId);
  return state;
}

export function treeSnapshot(state: TreeState, snapshot: SessionEntries): TreeState {
  return { ...state, snapshot, stale: false, leafId: snapshot.leafId };
}

export function treeNodes(snapshot: SessionEntries): TreeNode[] {
  const onPath = new Set(snapshot.activePath);
  const shownParent = shownParentOf(snapshot);
  const journal = new Set(snapshot.journal ?? []);
  const childrenOf = new Map<string | null, SessionEntry[]>();
  for (const entry of snapshot.entries) {
    if (journal.has(entry.id)) continue;
    const parentId = shownParent(entry.parentId);
    const siblings = childrenOf.get(parentId);
    if (siblings === undefined) childrenOf.set(parentId, [entry]);
    else siblings.push(entry);
  }
  const build = (parentId: string | null): TreeNode[] =>
    (childrenOf.get(parentId) ?? []).map((entry) => ({
      entry,
      label: snapshot.labels[entry.id],
      onActivePath: onPath.has(entry.id),
      children: build(entry.id),
    }));
  return build(null);
}

export function treeRows(
  snapshot: SessionEntries,
  folded: ReadonlySet<string> = new Set(),
): TreeRow[] {
  const rows: TreeRow[] = [];
  const leafId = shownParentOf(snapshot)(snapshot.leafId);
  const collect = (nodes: readonly TreeNode[], depth: number): void => {
    for (const node of nodes) {
      const hasChildren = node.children.length > 0;
      const isFolded = hasChildren && folded.has(node.entry.id);
      rows.push({
        id: node.entry.id,
        parentId: node.entry.parentId,
        depth,
        text: entryText(node.entry),
        label: node.label,
        onActivePath: node.onActivePath,
        isLeaf: node.entry.id === leafId,
        hasChildren,
        branchPoint: node.children.length > 1,
        folded: isFolded,
      });
      if (!isFolded) collect(node.children, depth + (node.children.length > 1 ? 1 : 0));
    }
  };
  collect(treeNodes(snapshot), 0);
  return rows;
}

export function entryText(entry: SessionEntry): string {
  switch (entry.type) {
    case "message":
      return `${entry.message.role}: ${excerpt(messageText(entry.message.parts)) || partsSummary(entry.message.parts)}`;
    case "compaction":
      return `compacted · ${entry.tokensBefore} tokens summarized`;
    case "branch_summary":
      return `branch summary: ${excerpt(entry.summary)}`;
    case "label":
      return entry.label === undefined ? "label cleared" : `label ${entry.label}`;
    case "session_info":
      return `named "${entry.name ?? ""}"`;
    case "custom_message":
      return excerpt(entry.content);
    case "thinking_level_change":
      return `thinking → ${entry.thinkingLevel}`;
    case "effort_change":
      return `effort → ${entry.effort}`;
    case "model_change":
      return `model → ${entry.provider}/${entry.modelId}`;
    case "binding":
      return bindingText(entry.arc, entry.bot);
    case "context_edit":
      return entry.replacement === null ? "context entry removed" : "context entry replaced";
    case "custom":
      return entry.customType;
  }
}

const excerptLimit = 48;

function excerpt(text: string): string {
  const flat = text.replaceAll("\n", " ").trim();
  return flat.length > excerptLimit ? `${flat.slice(0, excerptLimit)}…` : flat;
}

function messageText(parts: readonly { type: string; text?: string }[]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function partsSummary(parts: readonly MessagePart[]): string {
  const calls = parts.flatMap((part) => (part.type === "tool-call" ? [part.name] : []));
  if (calls.length > 0) return `calls ${calls.join(", ")}`;
  const results = parts.filter((part) => part.type === "tool-result").length;
  if (results > 0) return results === 1 ? "1 tool result" : `${results} tool results`;
  return parts.some((part) => part.type.endsWith("thinking")) ? "thinking" : "";
}

function shownParentOf(snapshot: SessionEntries): (id: string | null) => string | null {
  const journal = new Set(snapshot.journal ?? []);
  const parentOf = new Map(snapshot.entries.map((entry) => [entry.id, entry.parentId]));
  return (id) => {
    let current = id;
    while (current !== null && journal.has(current)) current = parentOf.get(current) ?? null;
    return current;
  };
}

function bindingText(arc: string | null | undefined, bot: string | null | undefined): string {
  const bound = [arc === undefined ? [] : [`arc ${arc ?? "cleared"}`]]
    .concat(bot === undefined ? [] : [[`bot ${bot ?? "cleared"}`]])
    .flat();
  return bound.length === 0 ? "binding unchanged" : bound.join(" · ");
}

function changedTree(state: TreeState, change: TreeChange): TreeState {
  const leafId = change.reason === "leaf" ? change.entryId : state.leafId;
  return { ...state, stale: true, leafId, lastChange: change };
}

function movedLeaf(state: TreeState, leafId: string | null): TreeState {
  return leafId === state.leafId ? state : { ...state, stale: true, leafId };
}
