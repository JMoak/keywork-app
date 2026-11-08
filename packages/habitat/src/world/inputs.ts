import type {
  BusEnvelope,
  CreatureChanged,
  PendingAsk,
  RoutineNeed,
  RoutineView,
  SessionRow,
  Setting,
} from "@keywork-app/protocol";
import type {
  DecidedForKeeper,
  NodeId,
  ParcelRole,
  PathClass,
  SessionId,
  Slug,
  ThreadKind,
  WaitingReason,
  WorkshopHealth,
} from "./types.ts";

export type HabitatInput = BusEnvelope | RanchEvent | KeeperNotice;

export interface RanchEnvelope<T extends string, P> {
  readonly id: number;
  readonly ts: string;
  readonly type: T;
  readonly payload: P;
}

export type RanchEvent =
  | RanchEnvelope<"creature.changed", CreatureChanged>
  | RanchEnvelope<"mesh.parcel", { parcel: ParcelSummary }>
  | RanchEnvelope<"mesh.grant", { grant: GrantSummary; revoked?: boolean }>
  | RanchEnvelope<"mesh.walked", { grantId: string; creature: Slug; node: NodeId; callId: string }>
  | RanchEnvelope<"models.changed", { node: NodeId; servers: readonly MillSummary[] }>
  | RanchEnvelope<
      "routine.scheduled",
      { creature: Slug; routine: RoutineSummary; nextAt: string | null }
    >
  | RanchEnvelope<
      "routine.fired",
      { creature: Slug; routine: RoutineSummary; sessionId: SessionId }
    >
  | RanchEnvelope<
      "routine.finished",
      {
        creature: Slug;
        routine: RoutineSummary;
        sessionId: SessionId;
        outcome: "completed" | "failed" | "interrupted";
      }
    >
  | RanchEnvelope<
      "screen.session",
      { id: string; node: NodeId; kind: "view" | "control"; live: boolean }
    >
  | RanchEnvelope<"workshop.health", { creature: Slug; health: WorkshopHealth }>
  | RanchEnvelope<"turn.waiting", { sessionId: SessionId; reason: WaitingReason; until?: string }>
  | RanchEnvelope<"turn.resumed", { sessionId: SessionId }>;

export type RanchEventType = RanchEvent["type"];

export const ranchEventTypes: readonly RanchEventType[] = [
  "creature.changed",
  "mesh.parcel",
  "mesh.grant",
  "mesh.walked",
  "models.changed",
  "routine.scheduled",
  "routine.fired",
  "routine.finished",
  "screen.session",
  "workshop.health",
  "turn.waiting",
  "turn.resumed",
];

export type KeeperNotice =
  | { readonly type: "keeper.viewed"; readonly ts: string; readonly sessionId: SessionId }
  | { readonly type: "keeper.presence"; readonly ts: string; readonly present: boolean }
  | { readonly type: "keeper.asks"; readonly ts: string; readonly asks: readonly PendingAsk[] }
  | { readonly type: "keeper.chores"; readonly ts: string; readonly needs: readonly RoutineNeed[] }
  | {
      readonly type: "keeper.decided";
      readonly ts: string;
      readonly standing: readonly DecidedForKeeper[];
    }
  | {
      readonly type: "keeper.routines";
      readonly ts: string;
      readonly creature: Slug;
      readonly routines: readonly RoutineView[];
    }
  | {
      readonly type: "keeper.sessions";
      readonly ts: string;
      readonly sessions: readonly SessionRow[];
    }
  | { readonly type: "keeper.show"; readonly ts: string; readonly settings: readonly Setting[] };

export interface CreatureSummary {
  readonly slug: Slug;
  readonly name: string;
  readonly skin?: string;
  readonly seed?: number;
  readonly paused?: string | null;
  readonly workshop?: { readonly substrate: string; readonly node?: NodeId };
  readonly conversation?: SessionId;
  readonly threads?: readonly {
    readonly id: SessionId;
    readonly kind: ThreadKind;
    readonly title?: string;
  }[];
}

export interface ParcelSummary {
  readonly id: NodeId;
  readonly name: string;
  readonly roles: readonly ParcelRole[];
  readonly online: boolean;
  readonly path?: PathClass | null;
  readonly servers?: readonly MillSummary[];
}

export interface GrantSummary {
  readonly id: string;
  readonly creature: Slug;
  readonly node: NodeId;
  readonly caps: readonly string[];
  readonly expiresAt?: string;
}

export interface MillSummary {
  readonly id: string;
  readonly name: string;
  readonly loaded: readonly string[];
  readonly busy?: boolean;
}

export interface RoutineSummary {
  readonly id: string;
  readonly title: string;
}

export function isKeeperNotice(input: HabitatInput): input is KeeperNotice {
  return !("id" in input);
}

export function isBusEnvelope(input: HabitatInput): input is BusEnvelope {
  return "id" in input && "sessionId" in input;
}

export function isRanchEvent(input: HabitatInput): input is RanchEvent {
  return "id" in input && !("sessionId" in input);
}
