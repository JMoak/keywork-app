import type { InboxTally, RoutineNeedKind } from "@keywork-app/protocol";
import type { YardState } from "../yard/types.ts";

export type Slug = string;
export type SessionId = string;
export type NodeId = string;

export interface HabitatState {
  readonly house: House;
  readonly asOf: string | undefined;
  readonly lastEventId: number | undefined;
  readonly keeper: Keeper;
  readonly creatures: Readonly<Record<Slug, Creature>>;
  readonly threads: Readonly<Record<SessionId, Thread>>;
  readonly parcels: Readonly<Record<NodeId, Parcel>>;
  readonly gates: Readonly<Record<string, Gate>>;
  readonly mills: Readonly<Record<string, Mill>>;
  readonly spyglasses: Readonly<Record<string, Spyglass>>;
  readonly storehouse: Storehouse;
  readonly porch: Porch;
  readonly landmarks: readonly Landmark[];
  readonly history: readonly Happening[];
  readonly yard?: YardState | undefined;
}

export interface House {
  readonly offsetMinutes: number;
}

export interface Keeper {
  readonly present: boolean;
  readonly since: string | undefined;
}

export interface Porch {
  readonly inbox: InboxTally | undefined;
  readonly chores: Readonly<Record<string, HeldChore>>;
  readonly decided: Readonly<Record<string, DecidedForKeeper>>;
}

export interface DecidedForKeeper {
  readonly recordId: string;
  readonly sessionId: SessionId;
  readonly creature: Slug | undefined;
  readonly ruleClass: string;
  readonly tool: string;
  readonly at: string;
}

export interface HeldChore {
  readonly creature: Slug;
  readonly routineId: string;
  readonly need: RoutineNeedKind;
  readonly reason: string;
  readonly runId: string | null;
  readonly since: string | undefined;
  readonly digest: string | undefined;
}

export interface Creature {
  readonly slug: Slug;
  readonly name: string;
  readonly skin: string | undefined;
  readonly seed: number | undefined;
  readonly workshop: Workshop;
  readonly conversation: SessionId | undefined;
  readonly chores: readonly Chore[];
  readonly paused?: string | undefined;
}

export type WorkshopHealth = "up" | "starting" | "unresponsive" | "down";

export interface Workshop {
  readonly raisedAt: string;
  readonly parcel: NodeId | undefined;
  readonly substrate: string | undefined;
  readonly health: WorkshopHealth | undefined;
  readonly boardedAt: string | undefined;
}

export interface Chore {
  readonly id: string;
  readonly title: string;
  readonly nextAt: string | undefined;
  readonly lastRanAt: string | undefined;
  readonly running: SessionId | undefined;
}

export type ThreadKind = "conversation" | "thread" | "routine" | "child";

export interface Thread {
  readonly id: SessionId;
  readonly creature: Slug | undefined;
  readonly kind: ThreadKind;
  readonly parent: SessionId | undefined;
  readonly title: string;
  readonly turn: LiveTurn | undefined;
  readonly restingSince: string | undefined;
  readonly asks: Readonly<Record<string, Ask>>;
  readonly answered: Readonly<Record<string, "granted" | "denied">>;
  readonly back: Back | undefined;
  readonly failure: Failure | undefined;
  readonly failures: number;
  readonly waiting: Waiting | undefined;
  readonly changes: readonly string[];
  readonly report?: string | undefined;
  readonly queued: number;
  readonly children: readonly SessionId[];
  readonly outcome: string | undefined;
  readonly lastActivityAt: string;
  readonly viewedAt: string | undefined;
  readonly removed: boolean;
}

export interface LiveTurn {
  readonly startedAt: string;
  readonly lastProgressAt: string;
  readonly tool: ToolAtHand | undefined;
  readonly stumbledAt: string | undefined;
}

export interface ToolAtHand {
  readonly callId: string;
  readonly name: string;
  readonly since: string;
  readonly until?: string | undefined;
}

export interface Ask {
  readonly callId: string;
  readonly tool: string;
  readonly subject: string;
  readonly askedAt: string;
}

export interface Back {
  readonly at: string;
  readonly preview: string;
  readonly changes: readonly string[];
}

export interface Failure {
  readonly at: string;
  readonly eventId: number;
  readonly message: string;
}

export type WaitingReason = "overloaded" | "rate-limited" | "unreachable";

export interface Waiting {
  readonly reason: WaitingReason;
  readonly since: string;
  readonly until: string | undefined;
}

export type ParcelRole = "house" | "host" | "pasture";

export type PathClass = "direct" | "peer-relay" | "relay";

export interface Parcel {
  readonly id: NodeId;
  readonly name: string;
  readonly roles: readonly ParcelRole[];
  readonly online: boolean;
  readonly path: PathClass | undefined;
  readonly fencedAt: string;
  readonly seenAt: string;
}

export interface Gate {
  readonly id: string;
  readonly creature: Slug;
  readonly parcel: NodeId;
  readonly caps: readonly string[];
  readonly openedAt: string;
  readonly expiresAt: string | undefined;
  readonly latchedAt: string | undefined;
  readonly walks: number;
  readonly lastWalkAt: string | undefined;
}

export interface Mill {
  readonly id: string;
  readonly parcel: NodeId;
  readonly name: string;
  readonly loaded: readonly string[];
  readonly busy: boolean;
  readonly builtAt: string;
}

export interface Spyglass {
  readonly id: string;
  readonly parcel: NodeId;
  readonly kind: "view" | "control";
  readonly since: string;
}

export interface Storehouse {
  readonly shelves: readonly Shelf[];
  readonly folded: number;
  readonly wings: number;
}

export interface Shelf {
  readonly thread: SessionId;
  readonly creature: Slug | undefined;
  readonly title: string;
  readonly deliveredAt: string;
  readonly changes: number;
}

export type LandmarkKind = "workshop" | "tree" | "lantern-post" | "weathervane" | "chair" | "well";

export interface Landmark {
  readonly kind: LandmarkKind;
  readonly creature: Slug | undefined;
  readonly at: string;
  readonly evidence: string;
}

export type HappeningKind =
  | "fenced"
  | "fogged"
  | "cleared"
  | "raised"
  | "boarded"
  | "built"
  | "opened"
  | "latched"
  | "delivered"
  | "wing"
  | "first";

export interface Happening {
  readonly at: string;
  readonly kind: HappeningKind;
  readonly text: string;
  readonly about: string | undefined;
}

export const shelvesPerWing = 12;
export const historyLimit = 64;
export const previewLimit = 120;

export function emptyHabitat(offsetMinutes = 0): HabitatState {
  return {
    house: { offsetMinutes },
    asOf: undefined,
    lastEventId: undefined,
    keeper: { present: true, since: undefined },
    creatures: {},
    threads: {},
    parcels: {},
    gates: {},
    mills: {},
    spyglasses: {},
    storehouse: { shelves: [], folded: 0, wings: 1 },
    porch: { inbox: undefined, chores: {}, decided: {} },
    landmarks: [],
    history: [],
  };
}

export function emptyThread(id: SessionId, at: string): Thread {
  return {
    id,
    creature: undefined,
    kind: "thread",
    parent: undefined,
    title: "",
    turn: undefined,
    restingSince: undefined,
    asks: {},
    answered: {},
    back: undefined,
    failure: undefined,
    failures: 0,
    waiting: undefined,
    changes: [],
    queued: 0,
    children: [],
    outcome: undefined,
    lastActivityAt: at,
    viewedAt: undefined,
    removed: false,
  };
}

export function hasLandmark(
  state: Pick<HabitatState, "landmarks">,
  kind: LandmarkKind,
  creature?: Slug,
): boolean {
  return state.landmarks.some(
    (landmark) =>
      landmark.kind === kind && (creature === undefined || landmark.creature === creature),
  );
}

export function gateOpen(gate: Gate, now: number): boolean {
  if (gate.latchedAt !== undefined) return false;
  return gate.expiresAt === undefined || Date.parse(gate.expiresAt) > now;
}

export function crateOf(thread: Thread): Back | undefined {
  return thread.back;
}

export function threadsOf(state: HabitatState, creature: Slug): Thread[] {
  return Object.values(state.threads).filter(
    (thread) => thread.creature === creature && !thread.removed,
  );
}

export function childrenOf(state: HabitatState, parent: SessionId): Thread[] {
  return (state.threads[parent]?.children ?? []).flatMap((id) => {
    const child = state.threads[id];
    return child === undefined || child.removed ? [] : [child];
  });
}
