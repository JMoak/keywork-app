import type { FaceKey, Footprint, Part, Side, Sprite } from "./model.ts";
import type { Role } from "./texture.ts";

export interface Kit {
  readonly id: string;
  readonly name: string;
  readonly colours: Readonly<Record<Appearance, KitColours>>;
  readonly shading: Readonly<Record<FaceKey, number>>;
  ground(spec: GroundSpec): Construction;
  workshop(spec: WorkshopSpec): WorkshopConstruction;
  house(spec: HouseSpec): Construction;
  storehouse(spec: StorehouseSpec): Construction;
  mill(spec: MillSpec): Construction;
  shed(spec: ShedSpec): Construction;
  project(spec: ProjectSpec): Construction;
  prop(spec: PropSpec): Construction;
}

export type Appearance = "night" | "day";

export interface KitColours {
  readonly night: boolean;
  readonly ground: string;
  readonly roles: Readonly<Record<Role, string>>;
  readonly hues: readonly string[];
  readonly ramps: Readonly<Record<string, string>>;
  readonly sky: readonly string[];
  readonly orb: string | undefined;
  readonly orbSlit: boolean;
  readonly orbRays: boolean;
  readonly star: string | undefined;
  readonly pool: string | undefined;
  readonly haze: number;
  readonly shadow: number;
}

export interface Construction {
  readonly parts: readonly Part[];
  readonly crown?: readonly Crowning[];
  readonly annexes?: readonly Annex[];
  readonly reach: number;
  readonly foot?: Footprint;
  readonly glow?: readonly Glow[];
}

export interface WorkshopConstruction extends Construction {
  readonly footprint: Footprint;
  readonly lightColour: Role;
}

export interface Crowning {
  readonly x: number;
  readonly z: number;
  readonly part: Part;
}

export interface Annex {
  readonly what: string;
  readonly x: number;
  readonly z: number;
  readonly parts: readonly Part[];
}

export type SpriteArt = Omit<Sprite, "x" | "y" | "z" | "phase">;

export type RoadGrade = 0 | 1 | 2 | 3;

export interface RoadEdges {
  readonly north: RoadGrade;
  readonly south: RoadGrade;
  readonly west: RoadGrade;
  readonly east: RoadGrade;
  readonly northWest: RoadGrade;
  readonly northEast: RoadGrade;
  readonly southWest: RoadGrade;
  readonly southEast: RoadGrade;
}

export interface Glow {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly colour: Role;
  readonly alpha: number;
}

export interface GroundSpec {
  readonly cx: number;
  readonly cz: number;
  readonly worn: Footprint | undefined;
  readonly roads: RoadEdges;
  readonly glow: readonly Glow[];
  readonly night: boolean;
  readonly pooled: boolean;
  readonly shadow: number;
}

export type WallMeaning = "door" | "bench" | "shelf" | "board";

export interface WorkshopSpec {
  readonly seed: number;
  readonly order: number;
  readonly walls: Readonly<Record<Side, WallMeaning>>;
  readonly door: Side;
  readonly storeys: number;
  readonly lit: boolean;
  readonly loft: boolean;
  readonly delivered: number;
  readonly chores: number;
  readonly notes: number;
  readonly gates: number;
  readonly ivy: number;
  readonly boarded: boolean;
  readonly night: boolean;
  readonly garland: boolean;
  readonly banner: BannerTier;
  readonly star: boolean;
}

export type BannerTier = 0 | 1 | 2;

export type MonumentTier = 0 | 1 | 2;

export interface HouseSpec {
  readonly lit: boolean;
  readonly ringing: boolean;
  readonly vane: boolean;
  readonly tree: boolean;
  readonly smoke: boolean;
  readonly night: boolean;
}

export interface StorehouseSpec {
  readonly shelves: number;
}

export interface MillSpec {
  readonly turning: "still" | "drift" | "quick";
  readonly busy: boolean;
}

export interface ShedSpec {
  readonly seed: number;
  readonly order: number;
  readonly spot: ShedSpot;
  readonly floors: number;
  readonly lit: boolean;
  readonly roofed: boolean;
  readonly trackedFiles?: number | undefined;
}

export const projectStages = [
  "shack",
  "shed",
  "house",
  "tower",
  "high-rise",
  "skyscraper",
] as const;

export type ProjectStage = (typeof projectStages)[number];

export const familyFlags = 6;

export interface ProjectSpec {
  readonly stage: ProjectStage;
  readonly seed: number;
  readonly order: number;
  readonly lit: boolean;
  readonly name?: string | undefined;
  readonly family?: number | undefined;
}

export interface ShedSpot extends Footprint {
  readonly y0: number;
  readonly height: number;
  readonly ridge: "gx" | "gz";
  readonly door: Side;
}

export type PropSpec =
  | { readonly kind: "crate" }
  | { readonly kind: "monument"; readonly tier: MonumentTier }
  | { readonly kind: "tree" }
  | { readonly kind: "well" }
  | { readonly kind: "road-lamp"; readonly lit: boolean };

export function identityCount(kit: Kit): number {
  return kit.colours.night.hues.length;
}
