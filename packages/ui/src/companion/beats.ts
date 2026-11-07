import {
  advance,
  type Beat,
  type Body,
  type BodyPose,
  bodyPose,
  createBody,
  type Facing,
  flying,
  hashSeed,
  type MotionPrefs,
  type PoseName,
  play,
  type Rows,
  release,
  type ToolBeat,
  toolBeatOf,
  toolClip,
  workingBeat,
} from "@keywork-app/habitat";
import type { CompanionSnapshot, SemanticState } from "./port.ts";

export interface Mirror {
  readonly seed: number;
  readonly body: Body;
  readonly shown: Shown | undefined;
  readonly staged: readonly Beat[];
  readonly stage: Beat | undefined;
  readonly toolBeat: ToolBeat | undefined;
}

export interface Shown {
  readonly state: SemanticState;
  readonly threadId: string | undefined;
}

export const celebrationCycles = 3;

export function createMirror(now: number, seed: number): Mirror {
  return {
    seed,
    body: createBody(now, seed, "bench"),
    shown: undefined,
    staged: [],
    stage: undefined,
    toolBeat: undefined,
  };
}

export function seedOf(creature: CompanionSnapshot["creature"] | undefined): number {
  return hashSeed(creature?.slug ?? creature?.name ?? "companion");
}

export function followSnapshot(
  mirror: Mirror,
  snapshot: CompanionSnapshot | undefined,
  now: number,
  prefs: MotionPrefs,
  rows: Rows,
): Mirror {
  const arrived = { ...mirror, body: advance(mirror.body, now, prefs, rows) };
  const entered = noticeTool(snapshot === undefined ? arrived : enter(arrived, snapshot), snapshot);
  return hold(playStaged(entered, prefs, rows), snapshot, prefs, rows);
}

export interface ShownPose {
  readonly clip: PoseName;
  readonly frame: number;
  readonly facing: Facing;
  readonly nextWakeAt: number | undefined;
}

export function shownPose(body: Body, rows: Rows, prefs: MotionPrefs): ShownPose {
  const pose = bodyPose(body, rows, prefs);
  return {
    clip: pose.clip,
    frame: prefs.tier === "rest" && rows[pose.clip].loop ? 0 : pose.frame,
    facing: pose.facing,
    nextWakeAt: nextFrameBoundary(body, rows, prefs),
  };
}

export function playInput(mirror: Mirror, beat: Beat, prefs: MotionPrefs, rows: Rows): Mirror {
  return { ...mirror, body: play(mirror.body, { ...beat, lane: "input" }, prefs, rows) };
}

export function releaseInput(mirror: Mirror): Mirror {
  return { ...mirror, body: release(mirror.body, ["input"]) };
}

export function walkBeat(facing: Facing): Beat {
  return { clip: facing === "left" ? "walk-left" : "walk-right", lane: "input", facing };
}

export const greetBeat: Beat = { clip: "greet", lane: "input" };
export const waveBeat: Beat = { clip: "wave", lane: "input" };

export function restingBeat(snapshot: CompanionSnapshot | undefined): Beat {
  switch (snapshot?.state) {
    case "porch":
      return { clip: "wait", lane: "needs-you", walkTo: "porch" };
    case "blocked":
      return { clip: "blocked", lane: "agent", walkTo: "bench" };
    case "back":
      return { clip: "idle", lane: "ambient", walkTo: "porch" };
    case "working":
      return { clip: toolClip(snapshot.tool), lane: "agent", walkTo: "bench" };
    case "paused":
      return { clip: "sit", lane: "agent", walkTo: "bench" };
    default:
      return { clip: "idle", lane: "ambient" };
  }
}

export function ceremonyFor(snapshot: CompanionSnapshot): Beat | undefined {
  switch (snapshot.state) {
    case "porch":
      return { clip: "ring", lane: "needs-you", walkTo: "porch" };
    case "back":
      return {
        clip: "deliver",
        lane: "agent",
        walkTo: "porch",
        stride: "carry",
        after: { clip: "celebrate", lane: "agent", cycles: celebrationCycles },
      };
    default:
      return undefined;
  }
}

export function clipForState(snapshot: CompanionSnapshot | undefined): PoseName {
  return restingBeat(snapshot).clip;
}

function nextFrameBoundary(body: Body, rows: Rows, prefs: MotionPrefs): BodyPose["nextFrameAt"] {
  const tier = prefs.tier === "hidden" ? "hidden" : "rest";
  return bodyPose(body, rows, { reducedMotion: prefs.reducedMotion, tier }).nextFrameAt;
}

function enter(mirror: Mirror, snapshot: CompanionSnapshot): Mirror {
  const shown: Shown = { state: snapshot.state, threadId: snapshot.threadId };
  if (!changed(mirror.shown, shown)) return mirror;
  const settled: Mirror = {
    ...mirror,
    shown,
    staged: [],
    stage: undefined,
    toolBeat: undefined,
    body: release(mirror.body),
  };
  const ceremony = ceremonyFor(snapshot);
  return ceremony === undefined ? settled : { ...settled, staged: [ceremony] };
}

function noticeTool(mirror: Mirror, snapshot: CompanionSnapshot | undefined): Mirror {
  const tool = snapshot?.state === "working" ? snapshot.tool : undefined;
  const toolBeat = toolBeatOf(mirror.toolBeat, tool, mirror.body.at);
  return toolBeat === mirror.toolBeat ? mirror : { ...mirror, toolBeat };
}

function changed(previous: Shown | undefined, shown: Shown): boolean {
  if (previous === undefined) return true;
  if (previous.state !== shown.state) return true;
  return shown.state !== "idle" && previous.threadId !== shown.threadId;
}

function playStaged(mirror: Mirror, prefs: MotionPrefs, rows: Rows): Mirror {
  const standing = mirror.stage !== undefined && flying(mirror.body, mirror.stage);
  if (standing) return mirror;
  const [next, ...rest] = mirror.staged;
  if (next === undefined)
    return mirror.stage === undefined ? mirror : { ...mirror, stage: undefined };
  const body = play(mirror.body, next, prefs, rows);
  return { ...mirror, body, staged: rest, stage: flying(body, next) ? next : undefined };
}

function hold(
  mirror: Mirror,
  snapshot: CompanionSnapshot | undefined,
  prefs: MotionPrefs,
  rows: Rows,
): Mirror {
  if (mirror.stage !== undefined) return mirror;
  const beat =
    snapshot?.state === "working"
      ? workingBeat(snapshot.tool, mirror.toolBeat, mirror.body.at)
      : restingBeat(snapshot);
  const body = play(mirror.body, beat, prefs, rows);
  return body === mirror.body ? mirror : { ...mirror, body };
}
