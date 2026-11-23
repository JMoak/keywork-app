import { creatureReading, type HabitatState, type Thread, threadsOf } from "@keywork-app/habitat";
import { type Hit, placeOfTarget } from "@keywork-app/habitat/block";
import type { SteadPlace } from "@keywork-app/protocol";
import { rootPath } from "../../browser/tree.ts";
import type { ChoresSpec } from "../../chores/index.tsx";
import type { ConversationSpec } from "../../conversation/index.tsx";
import type { CreatureSpec } from "../../creature/index.tsx";
import type { FileSpec } from "../../file/index.tsx";
import type { MillsSpec } from "../../mills/index.tsx";
import type { NeedsYouSpec } from "../../needs-you/index.tsx";
import type { ParcelsSpec } from "../../parcels/index.tsx";
import { noThreadYet } from "../copy.ts";

export type PaneOpening =
  | ChoresSpec
  | ConversationSpec
  | CreatureSpec
  | FileSpec
  | MillsSpec
  | NeedsYouSpec
  | ParcelsSpec;

export type Opening =
  | { readonly kind: "pane"; readonly spec: PaneOpening }
  | { readonly kind: "notice"; readonly line: string };

export const faces = ["door", "bench", "shelf", "board"] as const;

export type Face = (typeof faces)[number];

export interface Pressed {
  readonly place: SteadPlace;
  readonly face: Face | undefined;
}

export function pressedOn(hit: Hit): Pressed | undefined {
  if (hit.target.kind === "creature") {
    return { place: { kind: "workshop", creature: hit.target.creature }, face: undefined };
  }
  const place = placeOfTarget(hit.target);
  if (place === undefined) return undefined;
  return { place, face: faces.find((face) => face === hit.meaning) };
}

export function openingAt(
  { place, face }: Pressed,
  world: HabitatState,
  workspaceRoot: string,
  now: number = Date.now(),
): Opening {
  switch (place.kind) {
    case "workshop":
      return workshopOpening(world, place.creature, face, now);
    case "project":
      return projectOpening(place.directory, workspaceRoot);
    case "porch":
      return { kind: "pane", spec: { kind: "needs-you" } };
    case "store":
      return { kind: "pane", spec: { kind: "parcels" } };
    case "mill":
      return { kind: "pane", spec: { kind: "mills" } };
  }
}

export function directoryInWorkspace(directory: string, workspaceRoot: string): string | undefined {
  const path = forwardSlashed(directory);
  const root = forwardSlashed(workspaceRoot);
  if (root === "") return undefined;
  if (path.toLowerCase() === root.toLowerCase()) return rootPath;
  return path.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    ? path.slice(root.length + 1)
    : undefined;
}

export const outsideTheWorkspace = (directory: string): string =>
  `${directory} lies outside this workspace · no pane here opens it`;

export function threadItIsOn(world: HabitatState, slug: string, now: number): string | undefined {
  const carried = creatureReading(world, slug, now).carrier?.thread;
  if (carried !== undefined) return carried;
  return world.creatures[slug]?.conversation ?? latest(threadsOf(world, slug))?.id;
}

function workshopOpening(
  world: HabitatState,
  slug: string,
  face: Face | undefined,
  now: number,
): Opening {
  const name = world.creatures[slug]?.name ?? slug;
  const session = (id: string | undefined): Opening =>
    id === undefined
      ? { kind: "notice", line: noThreadYet(name) }
      : { kind: "pane", spec: { kind: "conversation", sessionId: id } };
  switch (face) {
    case "door":
      return session(world.creatures[slug]?.conversation);
    case "bench":
      return session(atTheBench(threadsOf(world, slug))?.id);
    case "shelf":
      return { kind: "pane", spec: { kind: "creature", slug } };
    case "board":
      return { kind: "pane", spec: { kind: "chores", creature: slug } };
    case undefined:
      return session(threadItIsOn(world, slug, now));
  }
}

function atTheBench(threads: readonly Thread[]): Thread | undefined {
  return latest(threads.filter((thread) => thread.turn !== undefined)) ?? latest(threads);
}

function latest(pool: readonly Thread[]): Thread | undefined {
  return [...pool].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
}

function projectOpening(directory: string, workspaceRoot: string): Opening {
  const path = directoryInWorkspace(directory, workspaceRoot);
  return path === undefined
    ? { kind: "notice", line: outsideTheWorkspace(directory) }
    : { kind: "pane", spec: { kind: "file", path } };
}

function forwardSlashed(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}
