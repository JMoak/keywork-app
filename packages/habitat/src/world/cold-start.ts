import type { SessionRow } from "@keywork-app/protocol";
import type { CreatureSummary } from "./inputs.ts";
import { withCreatures, withSessions } from "./project.ts";
import { emptyHabitat, type HabitatState } from "./types.ts";

export interface ColdStart {
  readonly at: string;
  readonly sessions: readonly SessionRow[];
  readonly creatures?: readonly CreatureSummary[];
  readonly offsetMinutes?: number;
}

export function coldStart(start: ColdStart): HabitatState {
  const seated = withCreatures(
    emptyHabitat(start.offsetMinutes ?? 0),
    start.creatures ?? [],
    start.at,
  );
  return { ...withSessions(seated, start.sessions, start.at), asOf: start.at };
}
