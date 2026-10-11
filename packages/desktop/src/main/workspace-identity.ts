import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";

export type AnchorSource = "declaration" | "git" | "launch";

export interface WorkspaceAnchor {
  root: string;
  source: AnchorSource;
}

export interface TicketLocation {
  identity: string;
  files: readonly string[];
}

export interface IdentitySeams {
  home: string;
  platform: NodeJS.Platform;
  exists(path: string): Promise<boolean>;
}

export async function locateTickets(
  workspace: string,
  seams: IdentitySeams,
): Promise<TicketLocation> {
  const paths = pathsOf(seams.platform);
  const anchor = await resolveAnchor(workspace, seams);
  const identity = workspaceIdentity(workspace, anchor, seams.platform);
  const keyworkHome = paths.join(seams.home, ".keywork");
  return {
    identity,
    files: [
      paths.join(keyworkHome, "workspaces", identity, "server.json"),
      paths.join(keyworkHome, "server.json"),
    ],
  };
}

export async function resolveAnchor(
  workspace: string,
  seams: Omit<IdentitySeams, "home">,
): Promise<WorkspaceAnchor> {
  const paths = pathsOf(seams.platform);
  const launch = paths.resolve(workspace);
  const declared = await nearestAbove(launch, paths, (dir) =>
    seams.exists(paths.join(dir, ".keywork", "workspace.json")),
  );
  if (declared !== undefined) return { root: declared, source: "declaration" };
  const repository = await nearestAbove(launch, paths, (dir) =>
    seams.exists(paths.join(dir, ".git")),
  );
  if (repository !== undefined) return { root: repository, source: "git" };
  return { root: launch, source: "launch" };
}

export function workspaceIdentity(
  workspace: string,
  anchor: WorkspaceAnchor,
  platform: NodeJS.Platform,
): string {
  const subject =
    anchor.source === "launch"
      ? canonicalPath(workspace, platform)
      : `workspace:${canonicalPath(anchor.root, platform)}`;
  return createHash("sha256").update(subject).digest("hex").slice(0, 12);
}

export function canonicalPath(path: string, platform: NodeJS.Platform): string {
  const absolute = pathsOf(platform).resolve(path);
  return platform === "win32" ? absolute.toLowerCase() : absolute;
}

type Paths = typeof posix;

function pathsOf(platform: NodeJS.Platform): Paths {
  return platform === "win32" ? win32 : posix;
}

async function nearestAbove(
  start: string,
  paths: Paths,
  holds: (dir: string) => Promise<boolean>,
): Promise<string | undefined> {
  for (let dir = start; ; dir = paths.dirname(dir)) {
    if (await holds(dir)) return dir;
    if (paths.dirname(dir) === dir) return undefined;
  }
}
