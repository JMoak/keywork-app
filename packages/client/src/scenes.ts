import {
  type BusEnvelope,
  type CreatureScene,
  type CreatureScenes,
  type SceneChange,
  type SceneKeeping,
  type SceneKept,
  type SceneSetOut,
  type ServedRefusal,
  sceneChangeKinds,
} from "@keywork-app/protocol";
import { type RanchRequest, servedRefusalOf } from "./ranch.ts";

export interface ScenesClient {
  creatureScenes(slug: string): Promise<readonly CreatureScene[] | ServedRefusal>;
  setOutScene(slug: string, name: string): Promise<SceneSetOut | ServedRefusal>;
  forgetScene(slug: string, name: string): Promise<ServedRefusal | undefined>;
  keepScene(slug: string, name: string, keeping: SceneKeeping): Promise<SceneKept | ServedRefusal>;
}

export const sceneOperations = {
  creatureScenes: "listCreatureScenes",
  setOutScene: "setOutCreatureScene",
  forgetScene: "forgetCreatureScene",
  keepScene: "keepCreatureScene",
} as const satisfies Record<keyof ScenesClient, string>;

export function sceneRoutes(request: RanchRequest): ScenesClient {
  return {
    creatureScenes: async (slug) => {
      const response = await request("GET", scenesOf(slug));
      return (
        (await servedRefusalOf(response)) ?? ((await response.json()) as CreatureScenes).scenes
      );
    },
    setOutScene: async (slug, name) => {
      const response = await request("POST", `${sceneAt(slug, name)}/set-out`);
      return (await servedRefusalOf(response)) ?? ((await response.json()) as SceneSetOut);
    },
    forgetScene: async (slug, name) =>
      servedRefusalOf(await request("DELETE", sceneAt(slug, name))),
    keepScene: async (slug, name, keeping) => {
      const response = await request("PUT", sceneAt(slug, name), keeping);
      return (await servedRefusalOf(response)) ?? ((await response.json()) as SceneKept);
    },
  };
}

export function sceneChangeOf(envelope: BusEnvelope): SceneChange | undefined {
  return envelope.type === "creature.scenes" && isSceneChange(envelope.payload)
    ? envelope.payload
    : undefined;
}

export function scenesAfter(
  held: readonly CreatureScene[],
  { change, scene }: SceneChange,
): readonly CreatureScene[] {
  const others = held.filter((kept) => !sameName(kept.name, scene.name));
  return change === "kept" ? [scene, ...others] : others;
}

export function sameName(one: string, other: string): boolean {
  return one.toLowerCase() === other.toLowerCase();
}

function scenesOf(slug: string): string {
  return `/creatures/${encodeURIComponent(slug)}/scenes`;
}

function sceneAt(slug: string, name: string): string {
  return `${scenesOf(slug)}/${encodeURIComponent(name)}`;
}

function isSceneChange(payload: unknown): payload is SceneChange {
  if (typeof payload !== "object" || payload === null) return false;
  const { creature, change, scene } = payload as Record<string, unknown>;
  return (
    typeof creature === "string" &&
    sceneChangeKinds.some((kind) => kind === change) &&
    typeof scene === "object" &&
    scene !== null &&
    typeof (scene as Record<string, unknown>).name === "string"
  );
}
