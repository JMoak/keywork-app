import { toolSubject } from "@keywork-app/client";
import type { Message, SessionEntries, SessionEntry } from "@keywork-app/protocol";

export interface ForgetOption {
  readonly key: string;
  readonly text: string;
  readonly note: string | undefined;
}

export type ForgottenWhat = "prompt" | "tool";

export function forgetPickerHint(replacing: boolean): string {
  return replacing
    ? "rewrite · ↑ older · ↓ newer · enter puts your line in its place · esc cancel"
    : "forget · ↑ older · ↓ newer · enter forgets it · esc cancel";
}

export function replacementOf(argument: string | undefined): string | undefined {
  const line = argument?.trim();
  return line === undefined || line === "" ? undefined : line;
}

export const nothingToForgetNotice =
  "nothing to forget yet · prompts and tool results show up here once saved";

export const turnRunningNotice = "turn still running · esc to interrupt";

export function forgetOptions(snapshot: SessionEntries): ForgetOption[] {
  const byId = new Map(snapshot.entries.map((entry) => [entry.id, entry]));
  const path = snapshot.activePath.flatMap((id) => byId.get(id) ?? []);
  const calls = callNamesOn(path);
  const edits = latestEditsOn(path);
  return path.flatMap((entry) => {
    const text = forgettableText(entry, calls);
    return text === undefined ? [] : [{ key: entry.id, text, note: edits.get(entry.id) }];
  });
}

export function forgottenWhat(snapshot: SessionEntries, entryId: string): ForgottenWhat {
  const entry = snapshot.entries.find((candidate) => candidate.id === entryId);
  return entry?.type === "message" && entry.message.role === "tool" ? "tool" : "prompt";
}

export function forgetNotice(what: ForgottenWhat, replacement: string | undefined): string {
  const subject = what === "prompt" ? "that prompt" : "that tool call and its result";
  return replacement === undefined
    ? `forgot ${subject} · out of the model's context · the transcript keeps the original`
    : `rewrote ${subject} · the model sees your line instead · the transcript keeps the original`;
}

const excerptLimit = 72;

function forgettableText(
  entry: SessionEntry,
  calls: ReadonlyMap<string, string>,
): string | undefined {
  if (entry.type !== "message") return undefined;
  const { message } = entry;
  if (message.role === "user") return `prompt · ${excerpt(spokenText(message))}`;
  if (message.role !== "tool") return undefined;
  const named = toolResultIds(message).map((callId) => calls.get(callId) ?? "a tool");
  return `result · ${excerpt(named.join(", "))}`;
}

function callNamesOn(path: readonly SessionEntry[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const entry of path) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    for (const part of entry.message.parts) {
      if (part.type === "tool-call") names.set(part.callId, callLine(part.name, part.arguments));
    }
  }
  return names;
}

function latestEditsOn(path: readonly SessionEntry[]): Map<string, string> {
  const edits = new Map<string, string>();
  for (const entry of path) {
    if (entry.type === "context_edit") {
      edits.set(entry.targetId, entry.replacement === null ? "forgotten" : "rewritten");
    }
  }
  return edits;
}

function callLine(name: string, args: Record<string, unknown>): string {
  const subject = toolSubject(args);
  return subject === "" ? name : `${name} ${subject}`;
}

function toolResultIds(message: Message): string[] {
  return message.parts.flatMap((part) => (part.type === "tool-result" ? [part.callId] : []));
}

function spokenText(message: Message): string {
  return message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > excerptLimit ? `${flat.slice(0, excerptLimit - 1)}…` : flat;
}
