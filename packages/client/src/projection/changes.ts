import type { BusEnvelope, ChangedPath, ChangesReading } from "@keywork-app/protocol";

export type ChangesAvailability = "unknown" | "trusted" | "untrusted" | "no-baseline";

export interface ChangesState {
  readonly availability: ChangesAvailability;
  readonly baseline: string | undefined;
  readonly files: readonly ChangedPath[];
  readonly stale: boolean;
}

export interface TurnGroup {
  readonly turn: number | undefined;
  readonly files: readonly ChangedPath[];
}

export const emptyChangesState: ChangesState = {
  availability: "unknown",
  baseline: undefined,
  files: [],
  stale: true,
};

export function changesState(state: ChangesState, envelope: BusEnvelope): ChangesState {
  if (envelope.type !== "changes.updated" || envelope.payload.replay === true) return state;
  const known = new Map(state.files.map((file) => [file.path, file]));
  return {
    ...state,
    availability: state.availability === "unknown" ? "trusted" : state.availability,
    files: envelope.payload.paths.map((path) => known.get(path) ?? unknownCounts(path)),
    stale: true,
  };
}

export function changesSnapshot(state: ChangesState, reading: ChangesReading): ChangesState {
  if (reading === "missing") return { ...state, files: [], stale: false };
  if (reading === "no-baseline") {
    return { availability: "no-baseline", baseline: undefined, files: [], stale: false };
  }
  if (!reading.trusted) {
    return { availability: "untrusted", baseline: undefined, files: [], stale: false };
  }
  return {
    availability: "trusted",
    baseline: reading.baseline,
    files: [...reading.files].sort(byTurnThenPath),
    stale: false,
  };
}

export function changesByTurn(files: readonly ChangedPath[]): TurnGroup[] {
  const groups = new Map<number | undefined, ChangedPath[]>();
  for (const file of [...files].sort(byTurnThenPath)) {
    const group = groups.get(file.turn);
    if (group === undefined) groups.set(file.turn, [file]);
    else group.push(file);
  }
  return [...groups].map(([turn, grouped]) => ({ turn, files: grouped }));
}

export function countsOf(file: ChangedPath): string {
  return `+${file.added} −${file.deleted}`;
}

function unknownCounts(path: string): ChangedPath {
  return { path, added: 0, deleted: 0 };
}

function byTurnThenPath(a: ChangedPath, b: ChangedPath): number {
  const unattributed = -1;
  return (b.turn ?? unattributed) - (a.turn ?? unattributed) || a.path.localeCompare(b.path);
}
