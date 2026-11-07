import type { HostPort, WorkspaceOpen } from "../../host/port.ts";

export type FolderServing = "node" | "console";

export interface NodeServingHost {
  servingOf(workspace: string): Promise<FolderServing | undefined>;
  stopServing(workspace: string): Promise<WorkspaceOpen>;
}

export function nodeServingOf(host: HostPort): NodeServingHost | undefined {
  const { servingOf, stopServing } = host as HostPort & Partial<NodeServingHost>;
  if (typeof servingOf !== "function" || typeof stopServing !== "function") return undefined;
  return {
    servingOf: (workspace) => servingOf.call(host, workspace),
    stopServing: (workspace) => stopServing.call(host, workspace),
  };
}

export function servingLine(serving: FolderServing): string {
  return serving === "node" ? "served by the node" : "runs with the console";
}

export const stopServingQuestion =
  "stop serving this folder from the node? it runs with the console while open, and stops when the console closes";

export const stoppedServingNotice =
  "the node stopped serving this folder; it runs with the console now";
