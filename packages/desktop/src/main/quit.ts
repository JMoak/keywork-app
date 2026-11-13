import { keyworkProfile, type ProductProfile } from "@keywork-app/product";
import type { SessionRow } from "@keywork-app/protocol";
import { folderName } from "./product.ts";

export interface WorkInFlight {
  workspace: string;
  working: readonly string[];
  asks: number;
}

export interface QuitWarning {
  type: "warning";
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
  noLink: true;
}

export interface QuitSeams {
  work(): Promise<readonly WorkInFlight[]>;
  ask(warning: QuitWarning): Promise<number>;
}

export const stopAndQuit = 0;

export const sessionsPatienceMs = 1500;

export async function mayQuit(
  seams: QuitSeams,
  profile: ProductProfile = keyworkProfile,
): Promise<boolean> {
  const warning = quitWarning(await seams.work(), profile);
  return warning === undefined || (await seams.ask(warning)) === stopAndQuit;
}

export async function workAcross(
  workspaces: readonly string[],
  sessionsOf: (workspace: string) => Promise<readonly SessionRow[]>,
  patienceMs = sessionsPatienceMs,
): Promise<WorkInFlight[]> {
  const readings = await Promise.all(
    workspaces.map(async (workspace) => {
      const rows = await withinPatience(sessionsOf(workspace), patienceMs);
      return rows === undefined ? undefined : workInFlight(workspace, rows);
    }),
  );
  return readings.filter((reading) => reading !== undefined);
}

export async function interruptWork(
  workspaces: readonly string[],
  seams: {
    sessionsOf(workspace: string): Promise<readonly SessionRow[]>;
    abort(workspace: string, sessionId: string): Promise<unknown>;
  },
  patienceMs = sessionsPatienceMs,
): Promise<void> {
  await Promise.all(
    workspaces.map(async (workspace) => {
      const rows = (await withinPatience(seams.sessionsOf(workspace), patienceMs)) ?? [];
      const busy = rows.filter(isBusy);
      await Promise.all(
        busy.map((row) => withinPatience(seams.abort(workspace, row.id), patienceMs)),
      );
    }),
  );
}

export function workInFlight(
  workspace: string,
  rows: readonly SessionRow[],
): WorkInFlight | undefined {
  const working = rows.filter((row) => row.working === true).map(sessionName);
  const asks = rows.reduce((sum, row) => sum + (row.waiting?.asks ?? 0), 0);
  return working.length === 0 && asks === 0 ? undefined : { workspace, working, asks };
}

export function quitWarning(
  work: readonly WorkInFlight[],
  profile: ProductProfile = keyworkProfile,
): QuitWarning | undefined {
  if (work.length === 0) return undefined;
  return {
    type: "warning",
    title: `Quit ${profile.name}`,
    message: "Work is still in progress",
    detail: [
      ...work.map(describeWorkspace),
      "Quitting stops the engine and interrupts this work.",
    ].join("\n\n"),
    buttons: ["Stop work and quit", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
}

const namedSessionsAtMost = 3;

function describeWorkspace(work: WorkInFlight): string {
  return [folderName(work.workspace), workingLine(work.working), asksLine(work.asks)]
    .filter((line) => line !== undefined)
    .join("\n");
}

function workingLine(sessions: readonly string[]): string | undefined {
  if (sessions.length === 0) return undefined;
  const named = sessions.slice(0, namedSessionsAtMost).join(", ");
  const unnamed = sessions.length - namedSessionsAtMost;
  return unnamed > 0 ? `working: ${named} and ${unnamed} more` : `working: ${named}`;
}

function asksLine(asks: number): string | undefined {
  if (asks === 0) return undefined;
  return asks === 1 ? "1 ask waits for you" : `${asks} asks wait for you`;
}

function isBusy(row: SessionRow): boolean {
  return row.working === true || (row.waiting?.asks ?? 0) > 0;
}

function sessionName(row: SessionRow): string {
  return row.title.trim() === "" ? "untitled session" : row.title.trim();
}

function withinPatience<Value>(
  pending: Promise<Value>,
  patienceMs: number,
): Promise<Value | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), patienceMs);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
