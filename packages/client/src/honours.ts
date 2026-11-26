import {
  type BusEnvelope,
  type CreatureHonours,
  creatureHonourKinds,
  type Honour,
  type HonourChange,
  type HonourKind,
  honourChangeKinds,
  type ServedRefusal,
  steadHonourKinds,
} from "@keywork-app/protocol";
import { type RanchRequest, servedRefusalOf } from "./ranch.ts";

export interface HonoursClient {
  creatureHonours(): Promise<readonly Honour[] | ServedRefusal>;
}

export const honourOperations = {
  creatureHonours: "listCreatureHonours",
} as const satisfies Record<keyof HonoursClient, string>;

export function honourRoutes(request: RanchRequest): HonoursClient {
  return {
    creatureHonours: async () => {
      const response = await request("GET", "/creature-honours");
      return (
        (await servedRefusalOf(response)) ??
        ((await response.json()) as CreatureHonours).honours.flatMap((row) => honourOf(row) ?? [])
      );
    },
  };
}

export function honourChangeOf(envelope: BusEnvelope): HonourChange | undefined {
  if (envelope.type !== "creature.honours") return undefined;
  const { change } = envelope.payload;
  const honour = honourOf(envelope.payload.honour);
  return honour !== undefined && honourChangeKinds.includes(change)
    ? { change, honour }
    : undefined;
}

export function honourKey(honour: Pick<Honour, "holder" | "kind" | "tier" | "with">): string {
  return JSON.stringify([honour.holder, honour.kind, honour.tier, honour.with]);
}

export function honoursAfter(held: readonly Honour[], { change, honour }: HonourChange): Honour[] {
  const others = held.filter((each) => honourKey(each) !== honourKey(honour));
  return change === "dropped" ? others : [...others, honour];
}

function honourOf(value: unknown): Honour | undefined {
  if (!isRecord(value)) return undefined;
  const { holder, kind, tier, earnedAt, proof } = value;
  const partner = value.with;
  if (holder !== null && typeof holder !== "string") return undefined;
  if (!isHonourKind(kind)) return undefined;
  if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 1) return undefined;
  if (partner !== null && typeof partner !== "string") return undefined;
  if (typeof earnedAt !== "string" || Number.isNaN(Date.parse(earnedAt))) return undefined;
  if (typeof proof !== "string") return undefined;
  return { holder, kind, tier, with: partner, earnedAt, proof };
}

function isHonourKind(kind: unknown): kind is HonourKind {
  const known: readonly unknown[] = [...creatureHonourKinds, ...steadHonourKinds];
  return known.includes(kind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
