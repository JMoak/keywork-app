import type { SessionProjection } from "@keywork-app/client";
import type { SessionSummary } from "@keywork-app/protocol";

export function telemetry(projection: SessionProjection): string {
  const { usage } = projection;
  if (usage.turns === 0) return "";
  const tokens = `${usage.inputTokens + usage.outputTokens} tokens`;
  return usage.unpricedTurns === 0
    ? `${tokens} · $${usage.costUsd.toFixed(4)}`
    : `${tokens} · unpriced`;
}

export function sessionName(
  summary: SessionSummary | undefined,
  projection: SessionProjection | undefined,
): string {
  if (summary !== undefined && summary.title !== untitled) return summary.title;
  const firstPrompt = projection?.entries.find((entry) => entry.kind === "user");
  if (firstPrompt?.kind === "user") return firstPrompt.text;
  return summary === undefined ? "new session" : "session";
}

export function relativeAge(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

const untitled = "(untitled session)";
