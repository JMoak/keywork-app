import type { SessionProjection } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";

export function sessionName(
  summary: SessionSummary | undefined,
  projection: SessionProjection | undefined,
): string {
  const told = toldName(summary, projection);
  if (told === undefined) return summary === undefined ? "new session" : "session";
  const name = shortName(told);
  return projection?.forkedFrom === undefined ? name : `${name} · fork`;
}

export function shortName(text: string): string {
  const line = firstLine(text);
  return capped(leadingClause(line) ?? line);
}

const untitled = "(untitled session)";
const nameLimit = 48;
const clauseWordsAtLeast = 3;
const clauseEnd = /[.!?](?=\s|$)|[:;](?=\s)|\s[-–—]\s/;
const trailingMarks = /[\s,.:;!?–—-]+$/;

function toldName(
  summary: SessionSummary | undefined,
  projection: SessionProjection | undefined,
): string | undefined {
  if (summary !== undefined && summary.title !== untitled) return summary.title;
  const firstPrompt = projection?.entries.find((entry) => entry.kind === "user");
  return firstPrompt?.kind === "user" ? firstPrompt.text : undefined;
}

function firstLine(text: string): string {
  const [line = ""] = text.trim().split(/\r?\n/, 1);
  return line.replace(/\s+/g, " ").replace(/…$/, "").trim();
}

function leadingClause(line: string): string | undefined {
  const end = line.search(clauseEnd);
  if (end <= 0) return undefined;
  const clause = line.slice(0, end).trim();
  return clause.split(" ").length >= clauseWordsAtLeast ? clause : undefined;
}

function capped(text: string): string {
  const characters = Array.from(text);
  if (characters.length <= nameLimit) return text;
  const head = characters.slice(0, nameLimit).join("");
  const lastSpace = head.lastIndexOf(" ");
  const cut = lastSpace > nameLimit / 2 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(trailingMarks, "")}…`;
}
