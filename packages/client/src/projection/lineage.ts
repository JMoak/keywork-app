import type { BusEnvelope, ChildFinished, ChildStarted } from "@keywork-app/protocol";
import type { ChildState, SessionProjection, ToolPhase, ToolRun } from "./types.ts";

export interface ChildLineage {
  readonly sessionId: string;
  readonly parentId: string;
  readonly callId: string;
  readonly title: string;
  readonly bot: string | undefined;
  readonly state: ChildState;
  readonly costNanos: number | undefined;
}

export type LineageState = Readonly<Record<string, readonly ChildLineage[]>>;

export const emptyLineage: LineageState = {};

export function childStateOf(run: ToolRun): ChildState {
  return run.child?.outcome ?? stateOfPhase[run.phase];
}

export function lineageState(state: LineageState, envelope: BusEnvelope): LineageState {
  switch (envelope.type) {
    case "child.started":
      return started(state, envelope.sessionId, envelope.payload);
    case "child.finished":
      return finished(state, envelope.sessionId, envelope.payload);
    default:
      return state;
  }
}

export function lineageOfProjection(
  state: LineageState,
  parentId: string,
  projection: SessionProjection,
): LineageState {
  return projection.entries.reduce((current, entry) => {
    const child = entry.kind === "tool" ? lineageOfRun(entry.run, parentId) : undefined;
    return child === undefined ? current : withChild(current, child);
  }, state);
}

export function childrenOf(state: LineageState, parentId: string): readonly ChildLineage[] {
  return state[parentId] ?? [];
}

export function lineageOf(state: LineageState, childId: string): ChildLineage | undefined {
  for (const children of Object.values(state)) {
    const found = children.find((child) => child.sessionId === childId);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function childrenTouchedBy(
  state: LineageState,
  envelopes: readonly BusEnvelope[],
): Set<string> {
  const touched = new Set<string>();
  for (const envelope of envelopes) {
    const id = touchedChild(state, envelope);
    if (id !== undefined) touched.add(id);
  }
  return touched;
}

const stateOfPhase: Readonly<Record<ToolPhase, ChildState>> = {
  proposed: "running",
  asking: "running",
  running: "running",
  done: "completed",
  failed: "failed",
  refused: "denied",
};

const untitledChild = "child";

function started(state: LineageState, parentId: string, payload: ChildStarted): LineageState {
  if (payload.sessionId === undefined) return state;
  return withChild(state, {
    sessionId: payload.sessionId,
    parentId,
    callId: payload.callId,
    title: payload.title,
    bot: payload.bot,
    state: "running",
    costNanos: undefined,
  });
}

function finished(state: LineageState, parentId: string, payload: ChildFinished): LineageState {
  if (payload.sessionId === undefined) return state;
  const known = lineageOf(state, payload.sessionId);
  return withChild(state, {
    sessionId: payload.sessionId,
    parentId,
    callId: payload.callId,
    title: known?.title ?? untitledChild,
    bot: known?.bot,
    state: payload.outcome,
    costNanos: payload.costNanos,
  });
}

function lineageOfRun(run: ToolRun, parentId: string): ChildLineage | undefined {
  const child = run.child;
  if (child?.sessionId === undefined) return undefined;
  return {
    sessionId: child.sessionId,
    parentId,
    callId: run.callId,
    title: child.title,
    bot: child.bot,
    state: childStateOf(run),
    costNanos: child.costNanos,
  };
}

function withChild(state: LineageState, child: ChildLineage): LineageState {
  const siblings = state[child.parentId] ?? [];
  const at = siblings.findIndex((sibling) => sibling.sessionId === child.sessionId);
  const next =
    at === -1
      ? [...siblings, child]
      : siblings.map((sibling, index) => (index === at ? child : sibling));
  return { ...state, [child.parentId]: next };
}

function touchedChild(state: LineageState, envelope: BusEnvelope): string | undefined {
  if (envelope.type === "child.finished") return envelope.payload.sessionId;
  if (envelope.type !== "tool.output") return undefined;
  const callId = envelope.payload.callId;
  return childrenOf(state, envelope.sessionId).find(
    (child) => child.callId === callId && child.state === "running",
  )?.sessionId;
}
