import { type HabitatState, type Thread, threadsOf } from "@keywork-app/habitat";
import type { Hit } from "@keywork-app/habitat/block";
import { rootPath } from "../../browser/tree.ts";
import type { ChoresSpec } from "../../chores/index.tsx";
import type { CreatureSpec } from "../../creature/index.tsx";
import type { FileSpec } from "../../file/index.tsx";
import type { MillsSpec } from "../../mills/index.tsx";
import type { NeedsYouSpec } from "../../needs-you/index.tsx";
import type { TreeSpec } from "../../tree/index.tsx";
import { noThreadYet } from "../copy.ts";

export type PaneOpening =
  | ChoresSpec
  | CreatureSpec
  | FileSpec
  | MillsSpec
  | NeedsYouSpec
  | TreeSpec;

export type Pressed =
  | { readonly kind: "session"; readonly session: string }
  | { readonly kind: "pane"; readonly spec: PaneOpening }
  | { readonly kind: "creature"; readonly creature: string }
  | { readonly kind: "notice"; readonly line: string };

export function pressedOn(hit: Hit, world: HabitatState, workspaceRoot: string): Pressed {
  const target = hit.target;
  switch (target.kind) {
    case "creature":
      return { kind: "creature", creature: target.creature };
    case "workshop":
      return pressedWorkshop(world, target.creature, hit.meaning);
    case "shed":
      return pressedProject(target.project, workspaceRoot);
    case "house":
      return { kind: "pane", spec: { kind: "needs-you" } };
    case "storehouse":
      return { kind: "pane", spec: { kind: "tree" } };
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

function pressedWorkshop(world: HabitatState, slug: string, meaning: string | undefined): Pressed {
  const creature = world.creatures[slug];
  const name = creature?.name ?? slug;
  switch (meaning) {
    case "door":
      return creature?.conversation === undefined
        ? { kind: "notice", line: noThreadYet(name) }
        : { kind: "session", session: creature.conversation };
    case "bench": {
      const thread = atTheBench(threadsOf(world, slug));
      return thread === undefined
        ? { kind: "notice", line: noThreadYet(name) }
        : { kind: "session", session: thread.id };
    }
    case "shelf":
      return { kind: "pane", spec: { kind: "creature", slug } };
    case "board":
      return { kind: "pane", spec: { kind: "chores", creature: slug } };
    default:
      return { kind: "creature", creature: slug };
  }
}

function atTheBench(threads: readonly Thread[]): Thread | undefined {
  const latest = (pool: readonly Thread[]): Thread | undefined =>
    [...pool].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
  return latest(threads.filter((thread) => thread.turn !== undefined)) ?? latest(threads);
}

function pressedProject(directory: string, workspaceRoot: string): Pressed {
  const path = directoryInWorkspace(directory, workspaceRoot);
  return path === undefined
    ? { kind: "notice", line: outsideTheWorkspace(directory) }
    : { kind: "pane", spec: { kind: "file", path } };
}

function forwardSlashed(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}
