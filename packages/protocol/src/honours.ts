export const creatureHonourKinds = [
  "conversations",
  "night",
  "partners",
  "tower",
  "standing",
  "range",
  "run",
] as const;

export const steadHonourKinds = [
  "first-creature",
  "hamlet",
  "town",
  "paved-road",
  "first-tower",
] as const;

export type CreatureHonourKind = (typeof creatureHonourKinds)[number];

export type SteadHonourKind = (typeof steadHonourKinds)[number];

export type HonourKind = CreatureHonourKind | SteadHonourKind;

export interface Honour {
  readonly holder: string | null;
  readonly kind: HonourKind;
  readonly tier: number;
  readonly with: string | null;
  readonly earnedAt: string;
  readonly proof: string;
}

export const honourChangeKinds = ["earned", "dropped"] as const;

export type HonourChangeKind = (typeof honourChangeKinds)[number];

export interface HonourChange {
  readonly change: HonourChangeKind;
  readonly honour: Honour;
}

export interface CreatureHonours {
  readonly honours: readonly Honour[];
}

export const honourRoutes = [
  { method: "GET", path: "/creature-honours", operationId: "listCreatureHonours" },
] as const;
