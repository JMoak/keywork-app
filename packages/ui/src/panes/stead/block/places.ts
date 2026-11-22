import type { HabitatState } from "@keywork-app/habitat";
import {
  type ConversationPlace,
  type ConversationPlaces,
  directoriesIn,
  type ProjectSite,
  projectSitesOf,
  type TrackedFiles,
} from "@keywork-app/habitat/block";
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { ShellSeams } from "../../registry.ts";

export interface SessionPlace {
  readonly cwd: string;
  readonly createdAt: string;
}

export interface PlaceSeams {
  readSession(id: string): Promise<SessionPlace | undefined>;
  readonly trackedFiles?: ((directory: string) => Promise<number | undefined>) | undefined;
}

export interface PlaceTimers {
  after(ms: number, run: () => void): () => void;
  every(ms: number, run: () => void): () => void;
}

export interface ProjectPlaces {
  places(): ConversationPlaces;
  trackedFiles(): TrackedFiles;
}

export type ProjectSites = Readonly<Record<string, readonly ProjectSite[]>>;

export const placeReadsAtOnce = 2;
export const placeSettleMs = 400;
export const trackedFilesRefreshMs = 60_000;

export function createProjectSites(
  seams: PlaceSeams,
  world: () => HabitatState,
  timers: PlaceTimers = browserTimers,
): () => ProjectSites {
  const known = createProjectPlaces(seams, () => creatureSessionsOf(world()), timers);
  return createMemo(() => projectSitesOf(world(), known.places(), known.trackedFiles()));
}

export function placeSeamsOf(shell: Pick<ShellSeams, "client" | "host">): PlaceSeams {
  const { host } = shell;
  return {
    readSession: (id) => shell.client.session(id),
    trackedFiles:
      host.trackedFiles === undefined
        ? undefined
        : async (directory) => await host.trackedFiles?.(directory),
  };
}

export function creatureSessionsOf(state: HabitatState): string[] {
  return Object.values(state.threads)
    .filter((thread) => thread.creature !== undefined && !thread.removed)
    .map((thread) => thread.id)
    .sort();
}

export function createProjectPlaces(
  seams: PlaceSeams,
  sessions: () => readonly string[],
  timers: PlaceTimers = browserTimers,
): ProjectPlaces {
  const [places, setPlaces] = createSignal<ConversationPlaces>({});
  const [trackedFiles, setTrackedFiles] = createSignal<TrackedFiles>({});
  const wanted = createMemo(sessions, [], { equals: sameList });
  const asked = new Set<string>();
  const waiting: string[] = [];
  const arrived = new Map<string, ConversationPlace>();
  let reading = 0;
  let settling: (() => void) | undefined;
  let disposed = false;

  const settle = (): void => {
    settling = undefined;
    if (disposed || arrived.size === 0) return;
    const landed = Object.fromEntries(arrived);
    arrived.clear();
    setPlaces((held) => ({ ...held, ...landed }));
  };
  const landed = (id: string, found: SessionPlace | undefined): void => {
    if (found !== undefined) arrived.set(id, { directory: found.cwd, startedAt: found.createdAt });
    settling ??= timers.after(placeSettleMs, settle);
  };
  const pump = (): void => {
    while (!disposed && reading < placeReadsAtOnce && waiting.length > 0) {
      const id = waiting.shift();
      if (id === undefined) return;
      reading += 1;
      seams
        .readSession(id)
        .then(
          (found) => landed(id, found),
          () => asked.delete(id),
        )
        .finally(() => {
          reading -= 1;
          pump();
        });
    }
  };
  const count = async (): Promise<void> => {
    const read = seams.trackedFiles;
    if (read === undefined) return;
    const counted = await Promise.all(
      directoriesIn(places()).map(
        async (directory) => [directory, await read(directory).catch(() => undefined)] as const,
      ),
    );
    const next: Record<string, number> = {};
    for (const [directory, files] of counted) if (files !== undefined) next[directory] = files;
    if (!disposed && !sameCounts(trackedFiles(), next)) setTrackedFiles(next);
  };

  createEffect(
    on(wanted, (ids) => {
      for (const id of ids) {
        if (asked.has(id)) continue;
        asked.add(id);
        waiting.push(id);
      }
      pump();
    }),
  );
  createEffect(on(places, () => void count()));
  const stopRefreshing = timers.every(trackedFilesRefreshMs, () => void count());
  onCleanup(() => {
    disposed = true;
    stopRefreshing();
    settling?.();
  });
  return { places, trackedFiles };
}

export const browserTimers: PlaceTimers = {
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
  every: (ms, run) => {
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
  },
};

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameCounts(a: TrackedFiles, b: TrackedFiles): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
