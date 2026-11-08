import type { SessionRow, Setting } from "@keywork-app/protocol";
import type { CreatureSummary } from "./inputs.ts";
import { withCreatures, withSessions, withSettings } from "./project.ts";
import { emptyHabitat, type HabitatState } from "./types.ts";

export interface ColdStart {
  readonly at: string;
  readonly sessions: readonly SessionRow[];
  readonly creatures?: readonly CreatureSummary[];
  readonly settings?: readonly Setting[];
  readonly offsetMinutes?: number;
}

export function coldStart(start: ColdStart): HabitatState {
  const seated = withCreatures(
    emptyHabitat(start.offsetMinutes ?? 0),
    start.creatures ?? [],
    start.at,
  );
  const threaded = withSessions(seated, start.sessions, start.at);
  const set =
    start.settings === undefined ? threaded : withSettings(threaded, start.settings, start.at);
  return { ...set, asOf: start.at };
}
