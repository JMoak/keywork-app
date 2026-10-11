import type { BusEnvelope, TreeEntry, TreeListing } from "@keywork-app/protocol";

export type DirectoryState =
  | { kind: "loading" }
  | { kind: "loaded"; entries: readonly TreeEntry[] }
  | { kind: "failed"; reason: string };

export interface TreeState {
  readonly directories: Readonly<Record<string, DirectoryState>>;
  readonly expanded: readonly string[];
  readonly showHidden: boolean;
  readonly filter: string;
  readonly lit: Readonly<Record<string, number>>;
}

export interface BrowserRow {
  readonly path: string;
  readonly name: string;
  readonly kind: "file" | "dir";
  readonly depth: number;
  readonly expanded: boolean;
  readonly ignored: boolean;
  readonly hidden: boolean;
  readonly load: DirectoryState["kind"] | undefined;
  readonly lit: boolean;
}

export const rootPath = "";

export const followHoldMs = 4000;

export const followedTools: readonly string[] = ["read", "write", "edit"];

export const writingTools: readonly string[] = ["write", "edit"];

export const emptyTree: TreeState = {
  directories: {},
  expanded: [rootPath],
  showHidden: false,
  filter: "",
  lit: {},
};

export function loading(state: TreeState, path: string): TreeState {
  return { ...state, directories: { ...state.directories, [path]: { kind: "loading" } } };
}

export function withListing(state: TreeState, listing: TreeListing): TreeState {
  return {
    ...state,
    directories: {
      ...state.directories,
      [listing.path]: { kind: "loaded", entries: listing.entries },
    },
  };
}

export function withFailure(state: TreeState, path: string, reason: string): TreeState {
  return { ...state, directories: { ...state.directories, [path]: { kind: "failed", reason } } };
}

export function forgetListings(state: TreeState): TreeState {
  return { ...state, directories: {} };
}

export function isExpanded(state: TreeState, path: string): boolean {
  return state.expanded.includes(path);
}

export function expand(state: TreeState, path: string): TreeState {
  return isExpanded(state, path) ? state : { ...state, expanded: [...state.expanded, path] };
}

export function collapse(state: TreeState, path: string): TreeState {
  return { ...state, expanded: state.expanded.filter((open) => open !== path) };
}

export function toggleHidden(state: TreeState): TreeState {
  return { ...state, showHidden: !state.showHidden };
}

export function withFilter(state: TreeState, filter: string): TreeState {
  return { ...state, filter };
}

export function directoriesToLoad(state: TreeState): string[] {
  return state.expanded.filter((path) => state.directories[path] === undefined);
}

export function lift(state: TreeState, path: string, nowMs: number): TreeState {
  let next: TreeState = { ...state, lit: { ...state.lit, [path]: nowMs + followHoldMs } };
  for (const ancestor of ancestorsOf(path)) {
    if (isLoaded(state, ancestor)) next = expand(next, ancestor);
  }
  return next;
}

export function expireLit(state: TreeState, nowMs: number): TreeState {
  const kept = Object.entries(state.lit).filter(([, until]) => until > nowMs);
  if (kept.length === Object.keys(state.lit).length) return state;
  return { ...state, lit: Object.fromEntries(kept) };
}

export function nextExpiry(state: TreeState): number | undefined {
  const times = Object.values(state.lit);
  return times.length === 0 ? undefined : Math.min(...times);
}

export function rows(state: TreeState, nowMs = 0): BrowserRow[] {
  if (state.filter === "") return walk(state, (path) => isExpanded(state, path), nowMs);
  const everythingLoaded = walk(state, (path) => isLoaded(state, path), nowMs);
  const needle = state.filter.toLowerCase();
  const matches = everythingLoaded.filter((row) => row.name.toLowerCase().includes(needle));
  const shown = new Set(matches.flatMap((row) => [row.path, ...ancestorsOf(row.path)]));
  return everythingLoaded.filter((row) => shown.has(row.path));
}

export function agentPathOf(envelope: BusEnvelope, workspaceRoot: string): string | undefined {
  if (envelope.type !== "tool.started") return undefined;
  const { call } = envelope.payload;
  if (!followedTools.includes(call.name)) return undefined;
  const path = call.arguments.path;
  return typeof path === "string" ? relativeToRoot(path, workspaceRoot) : undefined;
}

export interface AgentWrite {
  readonly callId: string;
  readonly path: string;
}

export function agentWriteOf(envelope: BusEnvelope, workspaceRoot: string): AgentWrite | undefined {
  if (envelope.type !== "tool.started") return undefined;
  const { call } = envelope.payload;
  if (!writingTools.includes(call.name)) return undefined;
  const path = agentPathOf(envelope, workspaceRoot);
  return path === undefined ? undefined : { callId: call.callId, path };
}

export function finishedCallOf(envelope: BusEnvelope): string | undefined {
  return envelope.type === "tool.finished" ? envelope.payload.callId : undefined;
}

export function rereadWhereMissing(state: TreeState, path: string): TreeState {
  const stale = ancestorsOf(path).find(
    (directory) =>
      isLoaded(state, directory) && !lists(state, directory, nextSegment(directory, path)),
  );
  return stale === undefined ? state : forgetListing(state, stale);
}

export function relativeToRoot(path: string, workspaceRoot: string): string | undefined {
  const normalized = slashes(path);
  const root = slashes(workspaceRoot).replace(/\/+$/, "");
  if (isAbsolutePath(normalized)) {
    if (!normalized.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return undefined;
    return normalized.slice(root.length + 1);
  }
  return normalized.replace(/^\.\//, "");
}

export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return [rootPath, ...parts.map((_, index) => parts.slice(0, index + 1).join("/"))];
}

export function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? rootPath : path.slice(0, cut);
}

export function joinPath(directory: string, name: string): string {
  return directory === rootPath ? name : `${directory}/${name}`;
}

function walk(state: TreeState, opens: (path: string) => boolean, nowMs: number): BrowserRow[] {
  const collected: BrowserRow[] = [];
  collect(state, opens, rootPath, 0, collected, nowMs);
  return collected;
}

function isLoaded(state: TreeState, path: string): boolean {
  return state.directories[path]?.kind === "loaded";
}

function lists(state: TreeState, directory: string, name: string): boolean {
  const listing = state.directories[directory];
  return listing?.kind === "loaded" && listing.entries.some((entry) => entry.name === name);
}

function nextSegment(directory: string, path: string): string {
  const below = directory === rootPath ? path : path.slice(directory.length + 1);
  return below.split("/")[0] ?? below;
}

function forgetListing(state: TreeState, path: string): TreeState {
  const { [path]: _forgotten, ...kept } = state.directories;
  return { ...state, directories: kept };
}

function collect(
  state: TreeState,
  opens: (path: string) => boolean,
  directory: string,
  depth: number,
  into: BrowserRow[],
  nowMs: number,
): void {
  const listing = state.directories[directory];
  if (listing?.kind !== "loaded") return;
  for (const entry of listing.entries) {
    if (entry.hidden && !state.showHidden) continue;
    const path = joinPath(directory, entry.name);
    const expanded = entry.kind === "dir" && opens(path);
    into.push({
      path,
      name: entry.name,
      kind: entry.kind,
      depth,
      expanded,
      ignored: entry.ignored,
      hidden: entry.hidden,
      load: entry.kind === "dir" ? state.directories[path]?.kind : undefined,
      lit: (state.lit[path] ?? 0) > nowMs,
    });
    if (expanded) collect(state, opens, path, depth + 1, into, nowMs);
  }
}

function slashes(path: string): string {
  return path.replace(/\\/g, "/");
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:\//.test(path);
}
