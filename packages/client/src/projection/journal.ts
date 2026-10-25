import type {
  Message,
  PermissionDecision,
  SessionDetail,
  SessionEntries,
  SessionEntry,
} from "@keywork-app/protocol";

export interface JournalReading {
  readonly decisions: ReadonlyMap<string, PermissionDecision>;
  readonly prompts: readonly PathPrompt[];
}

export interface PathPrompt {
  readonly entryId: string;
  readonly text: string;
  readonly forgotten: boolean;
  readonly rewritten: boolean;
}

export function readJournal(snapshot: SessionEntries): JournalReading {
  const path = activePathOf(snapshot);
  const edits = latestEditsOn(path);
  return { decisions: decisionsOn(path), prompts: promptsOn(path, edits) };
}

export function forgottenPromptIds(snapshot: SessionEntries | undefined): ReadonlySet<string> {
  if (snapshot === undefined) return new Set();
  const forgotten = readJournal(snapshot).prompts.filter((prompt) => prompt.forgotten);
  return new Set(forgotten.map((prompt) => prompt.entryId));
}

export function promptIds(
  detail: SessionDetail,
  prompts: readonly PathPrompt[],
): ReadonlyMap<number, string> {
  const marks = [...(detail.summaries ?? []), ...(detail.flushes ?? [])];
  const unspoken = new Set(marks.map((mark) => mark.index));
  const flushIds = new Set((detail.flushes ?? []).map((mark) => mark.entryId));
  const spoken = detail.messages.flatMap((message, index) =>
    message.role === "user" && !unspoken.has(index) ? [index] : [],
  );
  const kept = prompts.filter((prompt) => !prompt.forgotten && !flushIds.has(prompt.entryId));
  const lost = kept.length - spoken.length;
  if (lost < 0) return new Map();
  const placed = kept.slice(lost).map((prompt, at) => ({ prompt, index: spoken[at] ?? -1 }));
  const agrees = placed.every(
    ({ prompt, index }) => prompt.rewritten || textOf(detail.messages[index]) === prompt.text,
  );
  return agrees ? new Map(placed.map(({ prompt, index }) => [index, prompt.entryId])) : new Map();
}

function activePathOf(snapshot: SessionEntries): SessionEntry[] {
  const byId = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
  return snapshot.activePath.flatMap((id) => byId.get(id) ?? []);
}

type Edits = ReadonlyMap<string, "forgotten" | "rewritten">;

function latestEditsOn(path: readonly SessionEntry[]): Edits {
  const edits = new Map<string, "forgotten" | "rewritten">();
  for (const entry of path) {
    if (entry.type === "context_edit") {
      edits.set(entry.targetId, entry.replacement === null ? "forgotten" : "rewritten");
    }
  }
  return edits;
}

function decisionsOn(path: readonly SessionEntry[]): Map<string, PermissionDecision> {
  const decisions = new Map<string, PermissionDecision>();
  for (const entry of path) {
    const decision =
      entry.type === "custom" ? journaledDecision(entry.customType, entry.data) : undefined;
    if (decision !== undefined) decisions.set(decision.callId, decision);
  }
  return decisions;
}

function journaledDecision(customType: string, data: unknown): PermissionDecision | undefined {
  if (customType !== "permission_decision") return undefined;
  const decision = (data as { decision?: unknown } | null)?.decision;
  return isDecision(decision) ? decision : undefined;
}

function isDecision(value: unknown): value is PermissionDecision {
  const candidate = value as Partial<PermissionDecision> | null;
  return (
    typeof candidate?.callId === "string" &&
    (candidate.verdict === "granted" || candidate.verdict === "denied") &&
    typeof candidate.gate === "string"
  );
}

function promptsOn(path: readonly SessionEntry[], edits: Edits): PathPrompt[] {
  return path.flatMap((entry) => {
    const text = spokenText(entry);
    if (text === undefined) return [];
    const edit = edits.get(entry.id);
    return [
      {
        entryId: entry.id,
        text,
        forgotten: edit === "forgotten",
        rewritten: edit === "rewritten",
      },
    ];
  });
}

function spokenText(entry: SessionEntry): string | undefined {
  if (entry.type === "custom_message") return entry.content;
  return entry.type === "message" && entry.message.role === "user"
    ? textOf(entry.message)
    : undefined;
}

function textOf(message: Message | undefined): string {
  return (message?.parts ?? [])
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
}
