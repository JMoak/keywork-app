import { localTime, second } from "../clock/clock.ts";
import { hashSeed, mulberry32, unit } from "../clock/random.ts";
import {
  advance,
  type Beat,
  type Body,
  type BodyPose,
  bodyPose,
  createBody,
  type Facing,
  flying,
  gazeDirections,
  lookToward,
  type MotionPrefs,
  type Place,
  play,
  type Rows,
  release,
} from "../pose/pose.ts";
import { referenceRows } from "../pose/skin.ts";
import { decidedFor } from "../world/bell.ts";
import {
  gateOpen,
  type HabitatState,
  type HeldChore,
  hasLandmark,
  type Slug,
  threadsOf,
} from "../world/types.ts";
import {
  admit,
  type Budget,
  type Decision,
  decide,
  emptyBudget,
  type GateContext,
  recorded,
} from "./gate.ts";
import {
  chooseIdle,
  type IdleChoice,
  nextIdleDelay,
  type Opportunities,
  type RecentIdle,
  recentLimit,
} from "./idle.ts";
import {
  crateArrivalRaisesOrder,
  freshNeeds,
  type Needs,
  needsAfter,
  raisedBy,
  relieved,
} from "./needs.ts";
import {
  type CreatureReading,
  creatureReading,
  type Glyph,
  glyphs,
  type Semantic,
  type ToolBeat,
  toolBeatMs,
  toolBeatOf,
  toolHeldUntil,
  workingBeat,
} from "./semantic.ts";

export interface Creature {
  readonly slug: Slug;
  readonly seed: number;
  readonly whimsy: number;
  readonly rows: Rows;
  readonly bornAt: number;
  readonly at: number;
  readonly needs: Needs;
  readonly reading: CreatureReading;
  readonly activity: Activity | undefined;
  readonly nextIdleAt: number | undefined;
  readonly recent: readonly RecentIdle[];
  readonly beats: number;
  readonly staged: readonly Beat[];
  readonly stage: Stage | undefined;
  readonly toolBeat: ToolBeat | undefined;
  readonly gaze: GazeHold | undefined;
  readonly greetedAt: number | undefined;
  readonly dragging: boolean;
  readonly cratesSeen: number;
  readonly marks: Marks;
  readonly body: Body;
  readonly decisions: readonly Decision[];
  readonly budget: Budget;
  readonly nextThoughtAt: number | undefined;
}

export interface Activity {
  readonly choice: IdleChoice;
  readonly startedAt: number;
  readonly endsAt: number;
}

export interface Stage {
  readonly beat: Beat;
  readonly accepted: boolean;
}

export interface GazeHold {
  readonly direction: number;
  readonly since: number;
  readonly released: boolean;
}

export interface Marks {
  readonly rang: string | undefined;
  readonly celebrated: string | undefined;
  readonly stumbled: string | undefined;
  readonly raised: string | undefined;
}

export interface Gesture {
  readonly kind: "hover" | "press" | "drag";
  readonly direction?: Facing;
}

export interface Pointer {
  readonly dx: number;
  readonly dy: number;
}

export interface StepContext extends GateContext {
  readonly pointer: Pointer | undefined;
  readonly gestures: readonly Gesture[];
}

export interface Pose extends BodyPose {
  readonly state: Semantic;
  readonly glyph: Glyph;
  readonly nextWakeAt: number | undefined;
}

export interface CreatureOptions {
  readonly rows?: Rows;
  readonly place?: Place;
  readonly offsetMinutes?: number;
  readonly dayKey?: string;
}

export const gazeRadius = 2.5;
export const gazeDeadzone = 0.3;
export const gazeTimeoutMs = 3 * second;
export const greetCooldownMs = 2 * second;
export const celebrationCycles = 3;

export const quietContext: StepContext = {
  visible: true,
  focused: true,
  fullscreen: false,
  doNotDisturb: false,
  tier: "ambient",
  reducedMotion: false,
  quietHours: false,
  pointer: undefined,
  gestures: [],
};

export function createCreature(slug: Slug, now: number, options: CreatureOptions = {}): Creature {
  const dayKey = options.dayKey ?? localTime(now, options.offsetMinutes ?? 0).dayKey;
  const seed = hashSeed(slug, dayKey);
  return {
    slug,
    seed,
    whimsy: whimsyOf(slug),
    rows: options.rows ?? referenceRows,
    bornAt: now,
    at: now,
    needs: freshNeeds,
    reading: {
      state: "idle",
      carrier: undefined,
      chore: undefined,
      lamps: 0,
      lanterns: 0,
      notes: 0,
      crates: 0,
      asks: 0,
    },
    activity: undefined,
    nextIdleAt: undefined,
    recent: [],
    beats: 0,
    staged: [],
    stage: undefined,
    toolBeat: undefined,
    gaze: undefined,
    greetedAt: undefined,
    dragging: false,
    cratesSeen: 0,
    marks: { rang: undefined, celebrated: undefined, stumbled: undefined, raised: undefined },
    body: createBody(now, seed, options.place ?? "bench"),
    decisions: [],
    budget: emptyBudget,
    nextThoughtAt: undefined,
  };
}

export function whimsyOf(slug: Slug): number {
  return 0.35 + 0.5 * unit(hashSeed(slug, "whimsy"));
}

export function step(
  creature: Creature,
  world: HabitatState,
  now: number,
  context: StepContext,
): Creature {
  const prefs = prefsOf(context);
  const reading = heldAtThePorch(creatureReading(world, creature.slug, now), world, creature.slug);
  const arrived: Creature = {
    ...creature,
    at: now,
    reading,
    needs: needsAfter(
      creature.needs,
      now - creature.at,
      reading.state === "working",
      hasLandmark(world, "tree"),
    ),
    body: advance(creature.body, now, prefs, creature.rows),
  };
  const noticed = noticeCrates(arrived);
  const entered = noticeTool(enterState(noticed, creature.reading, world));
  const living = live(entered, world, context);
  const staged = playStages(living, context);
  const held = holdState(staged, context);
  const looking = gaze(held, context);
  const touched = gestures(looking, context);
  return { ...touched, nextThoughtAt: nextThought(touched, context) };
}

export function poseOf(creature: Creature, prefs: MotionPrefs): Pose {
  const body = bodyPose(creature.body, creature.rows, prefs);
  const wakes = [body.nextFrameAt, creature.nextThoughtAt].filter(
    (at): at is number => at !== undefined,
  );
  return {
    ...body,
    state: creature.reading.state,
    glyph: glyphs[creature.reading.state],
    nextWakeAt: prefs.tier === "hidden" || wakes.length === 0 ? undefined : Math.min(...wakes),
  };
}

export function prefsOf(context: GateContext): MotionPrefs {
  return { reducedMotion: context.reducedMotion, tier: context.tier };
}

function noticeCrates(creature: Creature): Creature {
  const crates = creature.reading.crates;
  if (crates <= creature.cratesSeen)
    return crates === creature.cratesSeen ? creature : { ...creature, cratesSeen: crates };
  return { ...creature, needs: raisedBy(creature.needs, "order", crateArrivalRaisesOrder) };
}

function enterState(creature: Creature, previous: CreatureReading, world: HabitatState): Creature {
  const reading = creature.reading;
  const changed =
    reading.state !== previous.state ||
    (reading.state !== "idle" && reading.carrier?.thread !== previous.carrier?.thread);
  const settled = changed ? interrupted(creature) : creature;
  const stumbled = stumbleOnce(raiseWorkshop(settled, world));
  if (!changed) return stumbled;
  switch (reading.state) {
    case "porch":
      return ringOnce(stumbled);
    case "back":
      return celebrateOnce(stumbled);
    case "idle":
      return {
        ...stumbled,
        nextIdleAt:
          stumbled.nextIdleAt ?? creature.at + nextIdleDelay(rngFor(stumbled), stumbled.needs),
      };
    case "blocked":
    case "working":
    case "paused":
      return stumbled;
  }
}

function interrupted(creature: Creature): Creature {
  return {
    ...creature,
    activity: undefined,
    staged: [],
    stage: undefined,
    toolBeat: undefined,
    body: release(creature.body),
  };
}

function noticeTool(creature: Creature): Creature {
  const reading = creature.reading;
  const tool = reading.state === "working" ? reading.carrier?.tool?.name : undefined;
  const toolBeat = toolBeatOf(creature.toolBeat, tool, creature.at);
  return toolBeat === creature.toolBeat ? creature : { ...creature, toolBeat };
}

function raiseWorkshop(creature: Creature, world: HabitatState): Creature {
  const landmark = world.landmarks.find(
    (each) => each.kind === "workshop" && each.creature === creature.slug,
  );
  if (landmark === undefined || creature.marks.raised === landmark.at) return creature;
  const fresh = Date.parse(landmark.at) >= creature.bornAt;
  const marked = { ...creature, marks: { ...creature.marks, raised: landmark.at } };
  if (!fresh) return marked;
  return {
    ...marked,
    staged: [...marked.staged, { clip: "raise", lane: "agent", walkTo: "door", cycles: 2 }],
  };
}

function ringOnce(creature: Creature): Creature {
  const key = ringKey(creature.reading);
  if (creature.marks.rang === key) return creature;
  return {
    ...creature,
    marks: { ...creature.marks, rang: key },
    staged: [...creature.staged, { clip: "ring", lane: "needs-you", walkTo: "porch" }],
  };
}

function ringKey(reading: CreatureReading): string {
  const carrier = reading.carrier;
  if (carrier?.state === "porch") return `${carrier.thread}:${carrier.since}`;
  if (reading.chore !== undefined) {
    return `chore:${reading.chore.creature}/${reading.chore.routineId}`;
  }
  if (reading.decided !== undefined) return `decided:${reading.decided.recordId}`;
  return `${carrier?.thread}:${carrier?.since}`;
}

function heldAtThePorch(
  reading: CreatureReading,
  world: HabitatState,
  slug: Slug,
): CreatureReading {
  const chore = heldChoreOf(world, slug);
  if (chore !== undefined) return { ...reading, state: "porch", chore };
  const decided = decidedFor(world, slug);
  return decided === undefined ? reading : { ...reading, state: "porch", decided };
}

function heldChoreOf(world: HabitatState, slug: Slug): HeldChore | undefined {
  return Object.values(world.porch.chores)
    .filter((held) => held.creature === slug)
    .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? ""))[0];
}

function celebrateOnce(creature: Creature): Creature {
  const back = creature.reading.carrier?.back;
  if (back === undefined || creature.marks.celebrated === back.at) return creature;
  return {
    ...creature,
    marks: { ...creature.marks, celebrated: back.at },
    staged: [...creature.staged, deliveryCeremony],
  };
}

export const deliveryCeremony: Beat = {
  clip: "deliver",
  lane: "agent",
  walkTo: "porch",
  stride: "carry",
  after: { clip: "celebrate", lane: "agent", cycles: celebrationCycles },
};

function stumbleOnce(creature: Creature): Creature {
  const stumbledAt = creature.reading.carrier?.stumbledAt;
  if (creature.reading.state !== "working" || stumbledAt === undefined) return creature;
  if (creature.marks.stumbled === stumbledAt) return creature;
  return {
    ...creature,
    marks: { ...creature.marks, stumbled: stumbledAt },
    staged: [...creature.staged, { clip: "stumble", lane: "agent", walkTo: "bench" }],
  };
}

function live(creature: Creature, world: HabitatState, context: StepContext): Creature {
  if (!restful(creature.reading.state))
    return { ...creature, activity: undefined, nextIdleAt: undefined };
  const now = creature.at;
  if (creature.activity !== undefined) {
    if (now < creature.activity.endsAt) return creature;
    return finishActivity(creature);
  }
  if (creature.nextIdleAt === undefined) {
    return { ...creature, nextIdleAt: now + nextIdleDelay(rngFor(creature), creature.needs) };
  }
  if (now < creature.nextIdleAt) return creature;
  return beginActivity(creature, world, context);
}

function finishActivity(creature: Creature): Creature {
  const activity = creature.activity as Activity;
  const relievedNeeds = relieved(creature.needs, activity.choice.kind);
  const recent = [...creature.recent, { kind: activity.choice.kind, at: creature.at }].slice(
    -recentLimit,
  );
  const rested: Creature = { ...creature, activity: undefined, needs: relievedNeeds, recent };
  return {
    ...rested,
    body: activity.choice.kind === "look" ? lookToward(rested.body, undefined) : rested.body,
    nextIdleAt: creature.at + nextIdleDelay(rngFor(rested), relievedNeeds),
  };
}

function beginActivity(creature: Creature, world: HabitatState, context: StepContext): Creature {
  const random = rngFor(creature);
  const choice = chooseIdle(
    random,
    {
      needs: creature.needs,
      whimsy: creature.whimsy,
      recent: creature.recent,
      now: creature.at,
      quietHours: context.quietHours,
    },
    opportunities(creature, world, context),
  );
  const counted = { ...creature, beats: creature.beats + 1 };
  if (choice === undefined)
    return { ...counted, nextIdleAt: creature.at + nextIdleDelay(random, creature.needs) };
  const beat = beatOf(choice);
  const decision = decide(
    { beat, reason: `idle ${choice.kind}` },
    context,
    creature.budget,
    creature.at,
  );
  const judged = { ...counted, decisions: recorded(creature.decisions, decision) };
  if (decision.verdict !== "play") {
    return { ...judged, nextIdleAt: creature.at + nextIdleDelay(random, creature.needs) };
  }
  return {
    ...judged,
    budget: admit(creature.budget, creature.at),
    activity: { choice, startedAt: creature.at, endsAt: creature.at + choice.duration },
    staged: [...judged.staged, beat],
    nextIdleAt: undefined,
  };
}

function beatOf(choice: IdleChoice): Beat {
  return {
    clip: choice.clip,
    lane: "ambient",
    ...(choice.target === undefined ? {} : { walkTo: choice.target }),
    ...(choice.cycles === undefined ? {} : { cycles: choice.cycles }),
  };
}

function opportunities(
  creature: Creature,
  world: HabitatState,
  context: StepContext,
): Opportunities {
  const own = threadsOf(world, creature.slug);
  const chores = world.creatures[creature.slug]?.chores ?? [];
  const inspectables: Place[] = [
    ...(creature.reading.crates > 0 ? (["door"] as const) : []),
    ...(chores.length > 0 ? (["board"] as const) : []),
    ...(Object.keys(world.mills).length > 0 ? (["mill"] as const) : []),
    ...(world.storehouse.shelves.length > 0 ? (["storehouse"] as const) : []),
  ];
  const beyondGates = Object.values(world.gates)
    .filter((gate) => gate.creature === creature.slug && gateOpen(gate, creature.at))
    .filter((gate) => world.parcels[gate.parcel]?.online !== false)
    .map((gate): Place => `parcel:${gate.parcel}`);
  return {
    crateArrived:
      creature.reading.crates > 0 &&
      creature.recent.findLast((recent) => recent.kind === "tidy") === undefined,
    treeExists: hasLandmark(world, "tree"),
    beyondGates,
    inspectables:
      own.length === 0 ? inspectables.filter((place) => place !== "door") : inspectables,
    pointerNear: pointerNear(context.pointer),
    nearThePorch: creature.reading.state === "back",
  };
}

function playStages(creature: Creature, context: StepContext): Creature {
  let current = creature;
  if (current.stage !== undefined) {
    const inFlight = flying(current.body, current.stage.beat) && !overstayed(current);
    if (!current.stage.accepted || !inFlight) current = { ...current, stage: undefined };
    else return current;
  }
  const [next, ...rest] = current.staged;
  if (next === undefined) return current;
  const decision = decide(
    { beat: next, reason: `${current.reading.state} ${next.clip}` },
    context,
    current.budget,
    current.at,
  );
  const body =
    decision.verdict === "hold"
      ? current.body
      : play(current.body, next, prefsOf(context), current.rows);
  const accepted = decision.verdict !== "hold" && flying(body, next);
  return {
    ...current,
    body,
    staged: rest,
    stage: accepted ? { beat: next, accepted } : undefined,
    decisions: recorded(current.decisions, decision),
  };
}

function overstayed(creature: Creature): boolean {
  return creature.stage?.beat.lane === "ambient" && creature.activity === undefined;
}

function holdState(creature: Creature, context: StepContext): Creature {
  if (creature.stage !== undefined) return creature;
  const loop = restingLoop(creature);
  const body = play(creature.body, loop, prefsOf(context), creature.rows);
  return body === creature.body ? creature : { ...creature, body };
}

function restingLoop(creature: Creature): Beat {
  const activity = creature.activity;
  if (activity !== undefined && creature.rows[activity.choice.clip].loop)
    return beatOf(activity.choice);
  switch (creature.reading.state) {
    case "porch":
      return { clip: "wait", lane: "needs-you", walkTo: "porch" };
    case "blocked":
      return { clip: "blocked", lane: "agent", walkTo: "bench" };
    case "back":
      return { clip: "idle", lane: "ambient", walkTo: "porch" };
    case "working":
      return workingBeat(creature.reading.carrier?.tool?.name, creature.toolBeat, creature.at);
    case "paused":
      return { clip: "sit", lane: "agent", walkTo: "bench" };
    case "idle":
      return { clip: "idle", lane: "ambient" };
  }
}

function gaze(creature: Creature, context: StepContext): Creature {
  const pointer = context.pointer;
  const direction =
    pointer !== undefined && pointerNear(pointer) ? directionOf(pointer, creature.gaze) : undefined;
  if (direction === undefined) {
    if (creature.gaze === undefined) return creature;
    return { ...creature, gaze: undefined, body: lookToward(creature.body, undefined) };
  }
  const held = creature.gaze;
  if (held !== undefined && held.direction === direction) {
    if (held.released || creature.at - held.since < gazeTimeoutMs) return creature;
    return {
      ...creature,
      gaze: { ...held, released: true },
      body: lookToward(creature.body, undefined),
    };
  }
  return {
    ...creature,
    gaze: { direction, since: creature.at, released: false },
    body: lookToward(creature.body, direction),
  };
}

function gestures(creature: Creature, context: StepContext): Creature {
  const drag = context.gestures.find((gesture) => gesture.kind === "drag");
  let current = creature;
  for (const gesture of context.gestures) {
    if (gesture.kind === "hover" || gesture.kind === "press")
      current = greet(current, gesture.kind, context);
  }
  if (drag !== undefined) return dragged(current, drag.direction ?? current.body.facing, context);
  if (!current.dragging) return current;
  return { ...current, dragging: false, body: release(current.body, ["input"]) };
}

function greet(creature: Creature, kind: "hover" | "press", context: StepContext): Creature {
  if (creature.greetedAt !== undefined && creature.at - creature.greetedAt < greetCooldownMs)
    return creature;
  const beat: Beat = { clip: kind === "hover" ? "greet" : "wave", lane: "input" };
  const decision = decide({ beat, reason: kind }, context, creature.budget, creature.at);
  const judged = {
    ...creature,
    greetedAt: creature.at,
    decisions: recorded(creature.decisions, decision),
  };
  if (decision.verdict === "hold") return judged;
  return { ...judged, body: play(judged.body, beat, prefsOf(context), judged.rows) };
}

function dragged(creature: Creature, direction: Facing, context: StepContext): Creature {
  const beat: Beat = {
    clip: direction === "left" ? "walk-left" : "walk-right",
    lane: "input",
    facing: direction,
  };
  if (creature.dragging) {
    return { ...creature, body: play(creature.body, beat, prefsOf(context), creature.rows) };
  }
  const decision = decide({ beat, reason: "drag" }, context, creature.budget, creature.at);
  const judged = { ...creature, decisions: recorded(creature.decisions, decision) };
  if (decision.verdict === "hold") return judged;
  return {
    ...judged,
    dragging: true,
    body: play(judged.body, beat, prefsOf(context), judged.rows),
  };
}

function nextThought(creature: Creature, context: StepContext): number | undefined {
  if (context.tier === "hidden" || !context.visible) return undefined;
  const ambientAllowed = !context.reducedMotion && !context.fullscreen && !context.doNotDisturb;
  const candidates = [
    creature.activity?.endsAt,
    ambientAllowed ? creature.nextIdleAt : undefined,
    creature.gaze !== undefined && !creature.gaze.released
      ? creature.gaze.since + gazeTimeoutMs
      : undefined,
    creature.reading.carrier?.staleAt,
    creature.toolBeat === undefined ? undefined : creature.toolBeat.shownAt + toolBeatMs,
    toolHeldUntil(creature.reading.carrier?.tool),
  ].filter((at): at is number => at !== undefined && at > creature.at);
  return candidates.length === 0 ? undefined : Math.min(...candidates);
}

function restful(state: Semantic): boolean {
  return state === "idle" || state === "back";
}

function rngFor(creature: Creature): () => number {
  return mulberry32(hashSeed(creature.seed, creature.beats));
}

function pointerNear(pointer: Pointer | undefined): boolean {
  if (pointer === undefined) return false;
  const distance = Math.hypot(pointer.dx, pointer.dy);
  return distance >= gazeDeadzone && distance <= gazeRadius;
}

function directionOf(pointer: Pointer, held: GazeHold | undefined): number {
  const sector = (2 * Math.PI) / gazeDirections;
  const angle = Math.atan2(pointer.dy, pointer.dx);
  const exact = (((angle / sector) % gazeDirections) + gazeDirections) % gazeDirections;
  const nearest = Math.round(exact) % gazeDirections;
  if (held === undefined) return nearest;
  const away = Math.abs(
    ((exact - held.direction + gazeDirections / 2) % gazeDirections) - gazeDirections / 2,
  );
  return away > 0.75 ? nearest : held.direction;
}
