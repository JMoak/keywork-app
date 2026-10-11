import type { EffortLevel, SessionState, SessionSummary } from "@keywork-app/protocol";
import type { SessionProjection } from "./types.ts";

export interface SessionControls {
  readonly model: string | undefined;
  readonly thinking: boolean;
  readonly effort: EffortLevel | undefined;
  readonly title: string | undefined;
  readonly leafId: string | null | undefined;
  readonly undoable: boolean | undefined;
  readonly redoable: boolean | undefined;
  readonly basis: "unknown" | "summary" | "reported";
}

export const unknownControls: SessionControls = {
  model: undefined,
  thinking: false,
  effort: undefined,
  title: undefined,
  leafId: undefined,
  undoable: undefined,
  redoable: undefined,
  basis: "unknown",
};

export function sessionControls(
  summary: SessionSummary | undefined,
  projection: Pick<SessionProjection, "standing"> | undefined,
): SessionControls {
  const standing = projection?.standing;
  if (standing !== undefined) return reportedControls(standing);
  return summary === undefined ? unknownControls : summaryControls(summary);
}

function reportedControls(standing: SessionState): SessionControls {
  return {
    model: standing.model,
    thinking: standing.thinking,
    effort: standing.effort,
    title: standing.title,
    leafId: standing.leafId,
    undoable: standing.undoable,
    redoable: standing.redoable,
    basis: "reported",
  };
}

function summaryControls(summary: SessionSummary): SessionControls {
  return {
    ...unknownControls,
    model: summary.model,
    thinking: summary.thinking ?? false,
    effort: summary.effort,
    title: summary.title,
    basis: "summary",
  };
}
