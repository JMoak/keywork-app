import type { ToolRun, TranscriptEntry } from "@keywork-app/client";

export interface DisplayRun {
  readonly head: number;
  readonly runs: readonly ToolRun[];
}

export const displayTools = ["show", "arrange", "withdraw", "shown"] as const;

export type DisplayTool = (typeof displayTools)[number];

export function displayRuns(entries: readonly TranscriptEntry[]): ReadonlyMap<number, DisplayRun> {
  const byRow = new Map<number, DisplayRun>();
  let head = 0;
  while (head < entries.length) {
    const runs = rowsRunningFrom(entries, head);
    if (runs.length >= fewestInARun) {
      for (let row = head; row < head + runs.length; row += 1) byRow.set(row, { head, runs });
    }
    head += Math.max(1, runs.length);
  }
  return byRow;
}

export function displayRunLine(runs: readonly ToolRun[]): string {
  const done = runs.filter((run) => run.phase === "done");
  const told = displayTools
    .filter((tool) => done.some((run) => run.name === tool))
    .toSorted((one, other) => firstOf(done, one) - firstOf(done, other))
    .map((tool) => words[tool](done.filter((run) => run.name === tool)));
  const fell = runs.filter((run) => run.phase === "failed" || run.phase === "refused").length;
  const clauses = [...told, ...(fell === 0 ? [] : [`${fell} did not go through`])];
  return clauses.length === 0 ? settingOutLine : clauses.join(" · ");
}

export const settingOutLine = "setting things out";

const fewestInARun = 2;

const words: Readonly<Record<DisplayTool, (done: readonly ToolRun[]) => string>> = {
  show: (done) => `set out ${counted(done.length)}${done.every(saysOutside) ? " outside" : ""}`,
  arrange: () => "arranged them",
  withdraw: (done) => `took ${done.length} back`,
  shown: () => "looked over what is out",
};

function rowsRunningFrom(entries: readonly TranscriptEntry[], head: number): ToolRun[] {
  const runs: ToolRun[] = [];
  for (const entry of entries.slice(head)) {
    if (entry.kind !== "tool" || !joinsARun(entry.run)) break;
    runs.push(entry.run);
  }
  return runs;
}

function joinsARun(run: ToolRun): boolean {
  return isADisplayTool(run.name) && run.phase !== "asking" && run.child === undefined;
}

function isADisplayTool(name: string): name is DisplayTool {
  return (displayTools as readonly string[]).includes(name);
}

function saysOutside(run: ToolRun): boolean {
  return (
    /"where":\s*"outside"/.test(run.args) ||
    (run.detail ?? []).some((line) => /\boutside\b/i.test(line))
  );
}

function firstOf(done: readonly ToolRun[], tool: DisplayTool): number {
  return done.findIndex((run) => run.name === tool);
}

function counted(count: number): string {
  return count === 1 ? "1 thing" : `${count} things`;
}
