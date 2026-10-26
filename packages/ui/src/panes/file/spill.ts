import type { ToolRun } from "@keywork-app/client";
import type { SpillReference } from "@keywork-app/protocol";

export interface SpillSource {
  readonly sessionId: string;
  readonly spillId: string;
}

export interface SpillOpening {
  readonly kind: "file";
  readonly path: string;
  readonly from: number;
  readonly to: number;
  readonly spill: SpillSource;
}

export const spillEditorRefusal =
  "a spill lives beside its session, not in the workspace · nothing to open in your editor";

export function spillOpening(sessionId: string, run: ToolRun, spill: SpillReference): SpillOpening {
  return {
    kind: "file",
    path: run.subject === "" ? run.name : `${run.name} ${run.subject}`,
    from: spill.elidedFrom,
    to: spill.elidedTo,
    spill: { sessionId, spillId: spill.id },
  };
}

export function spillTitle(label: string): string {
  return `spill · ${label}`;
}

export function spillRefusal(reading: "missing" | "binary"): string {
  return reading === "binary"
    ? "this part of the spill holds binary bytes · nothing to show as text"
    : "this spill is gone · the session or its spill file was removed";
}
