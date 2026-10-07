export interface OpenWorkspace {
  workspace: string;
  windows: number;
  pendingAsks: number;
}

export type Placement =
  | { kind: "focus"; windowId: number }
  | { kind: "reuse"; windowId: number }
  | { kind: "new" };

export interface Release {
  workspace: string;
  lastWindow: boolean;
}

export interface WindowRegistry {
  add(windowId: number, workspace?: string): void;
  bind(windowId: number, workspace: string): void;
  unbind(windowId: number): Release | undefined;
  remove(windowId: number): Release | undefined;
  focused(windowId: number): void;
  setPendingAsks(windowId: number, count: number): void;
  workspaceOf(windowId: number): string | undefined;
  windowsOf(workspace: string): readonly number[];
  mostRecentlyActive(): number | undefined;
  placeFor(workspace: string): Placement;
  list(): readonly OpenWorkspace[];
  pendingAsks(): number;
  onChange(listener: () => void): () => void;
}

export function windowRegistry(): WindowRegistry {
  const bound = new Map<number, string | undefined>();
  const asks = new Map<string, number>();
  const activity: number[] = [];
  const listeners = new Set<() => void>();

  const announce = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const windowsOf = (workspace: string): number[] =>
    [...bound].filter(([, held]) => held === workspace).map(([id]) => id);

  const detach = (windowId: number): Release | undefined => {
    const workspace = bound.get(windowId);
    if (workspace === undefined) return undefined;
    bound.set(windowId, undefined);
    const lastWindow = windowsOf(workspace).length === 0;
    if (lastWindow) asks.delete(workspace);
    return { workspace, lastWindow };
  };

  return {
    add: (windowId, workspace) => {
      bound.set(windowId, workspace);
      activity.unshift(windowId);
      announce();
    },
    bind: (windowId, workspace) => {
      bound.set(windowId, workspace);
      announce();
    },
    unbind: (windowId) => {
      const release = detach(windowId);
      if (release !== undefined) announce();
      return release;
    },
    remove: (windowId) => {
      const release = detach(windowId);
      bound.delete(windowId);
      forget(activity, windowId);
      announce();
      return release;
    },
    focused: (windowId) => {
      if (!bound.has(windowId)) return;
      forget(activity, windowId);
      activity.unshift(windowId);
    },
    setPendingAsks: (windowId, count) => {
      const workspace = bound.get(windowId);
      if (workspace === undefined) return;
      asks.set(workspace, Math.max(0, count));
      announce();
    },
    workspaceOf: (windowId) => bound.get(windowId),
    windowsOf,
    mostRecentlyActive: () => activity[0],
    placeFor: (workspace) => {
      const showing = activity.find((id) => bound.get(id) === workspace);
      if (showing !== undefined) return { kind: "focus", windowId: showing };
      const frontDoor = activity.find((id) => bound.get(id) === undefined);
      if (frontDoor !== undefined) return { kind: "reuse", windowId: frontDoor };
      return { kind: "new" };
    },
    list: () => {
      const seen = new Map<string, number>();
      for (const id of activity) {
        const workspace = bound.get(id);
        if (workspace !== undefined) seen.set(workspace, (seen.get(workspace) ?? 0) + 1);
      }
      return [...seen].map(([workspace, windows]) => ({
        workspace,
        windows,
        pendingAsks: asks.get(workspace) ?? 0,
      }));
    },
    pendingAsks: () => [...asks.values()].reduce((sum, count) => sum + count, 0),
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type QuitGate = (event: { preventDefault(): void }, quit: () => void) => void;

export function quitGate(stopEverything: () => Promise<void>): QuitGate {
  let stopping: Promise<void> | undefined;
  let stopped = false;
  return (event, quit) => {
    if (stopped) return;
    event.preventDefault();
    if (stopping !== undefined) return;
    stopping = stopEverything()
      .catch(() => undefined)
      .then(() => {
        stopped = true;
        quit();
      });
  };
}

function forget(ids: number[], windowId: number): void {
  const at = ids.indexOf(windowId);
  if (at !== -1) ids.splice(at, 1);
}
