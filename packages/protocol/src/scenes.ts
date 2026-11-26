import type { WorkspaceSessionRef } from "./creature-projects.ts";
import type {
  Seat,
  SettingPlace,
  SettingSize,
  SettingSubject,
  SettingWeight,
  SteadPlace,
} from "./show.ts";

// Contract 1.40: a creature keeps an arrangement by name and sets it out again.
export interface CreatureScene {
  readonly creature: string;
  readonly name: string;
  readonly place: SteadPlace | null;
  readonly holds: readonly SceneItem[];
  readonly keptAt: string;
}

export interface SceneItem {
  readonly kind: string;
  readonly title: string;
}

export interface CreatureScenes {
  readonly scenes: readonly CreatureScene[];
}

export interface SceneSetOut {
  readonly out: number;
  readonly missing: readonly string[];
  readonly asking: readonly string[];
  readonly stopped: string | null;
}

export const sceneChangeKinds = ["kept", "forgotten"] as const;

export type SceneChangeKind = (typeof sceneChangeKinds)[number];

export interface SceneChange {
  readonly creature: string;
  readonly change: SceneChangeKind;
  readonly scene: CreatureScene;
}

export const sceneLimit = 12;

// A scene a bound project's runtime keeps at the home for a creature it ran a thread for: the
// engine's own call, never the console's.
export interface SceneKeeping {
  readonly place: SteadPlace | null;
  readonly things: readonly SceneThing[];
  readonly keptIn: WorkspaceSessionRef;
}

export interface SceneThing {
  readonly what: SettingSubject;
  readonly where: SettingPlace;
  readonly seat?: Seat | undefined;
  readonly weight?: SettingWeight | undefined;
  readonly size?: SettingSize | undefined;
}

export interface SceneKept {
  readonly scene: CreatureScene;
  readonly replaced: boolean;
}

export const sceneRoutes = [
  { method: "GET", path: "/creatures/{slug}/scenes", operationId: "listCreatureScenes" },
  {
    method: "POST",
    path: "/creatures/{slug}/scenes/{name}/set-out",
    operationId: "setOutCreatureScene",
  },
  { method: "DELETE", path: "/creatures/{slug}/scenes/{name}", operationId: "forgetCreatureScene" },
  { method: "PUT", path: "/creatures/{slug}/scenes/{name}", operationId: "keepCreatureScene" },
] as const;
