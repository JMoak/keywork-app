import type { ServerFeed } from "@keywork-app/client";
import {
  directoriesIn,
  type HeardAt,
  inOrderOfFounding,
  type LotOrder,
  lotOrderAfter,
  type ProjectSite,
  projectSitesOf,
  sameLotOrder,
  type TrackedFiles,
  worksiteKey,
  worksitesAfter,
} from "@keywork-app/habitat/block";
import type {
  CreatureWorksite,
  CreatureWorksiteChange,
  ServedRefusal,
} from "@keywork-app/protocol";
import { batch, createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import type { ShellSeams } from "../../registry.ts";

export interface PlaceSeams {
  readWorksites(): Promise<readonly CreatureWorksite[] | ServedRefusal>;
  readonly feed: Pick<ServerFeed, "subscribe">;
  readonly trackedFiles?: ((directory: string) => Promise<number | undefined>) | undefined;
}

export interface PlaceTimers {
  every(ms: number, run: () => void): () => void;
}

export interface Worksites {
  rows(): readonly CreatureWorksite[];
  heardAt(): HeardAt;
  whole(): boolean;
}

export interface LotOrders {
  stored(): LotOrder | undefined;
  keep(order: Record<string, string[]>): void;
}

export type ProjectSites = Readonly<Record<string, readonly ProjectSite[]>>;

export const trackedFilesRefreshMs = 60_000;

export function createProjectSites(
  seams: PlaceSeams,
  lots: LotOrders = forgetful,
  timers: PlaceTimers = browserTimers,
  now: () => number = Date.now,
): () => ProjectSites {
  const worksites = createWorksites(seams, now);
  const trackedFiles = createTrackedFiles(seams, () => directoriesIn(worksites.rows()), timers);
  const order = createMemo(
    () => lotOrderAfter(lots.stored() ?? noLots, worksites.rows(), worksites.whole()),
    noLots,
    { equals: sameLotOrder },
  );
  createEffect(
    on(order, (held) => {
      if (!sameLotOrder(held, lots.stored() ?? noLots)) lots.keep(copied(held));
    }),
  );
  return createMemo(() =>
    projectSitesOf(worksites.rows(), trackedFiles(), worksites.heardAt(), order()),
  );
}

export function placeSeamsOf(shell: Pick<ShellSeams, "client" | "host" | "feed">): PlaceSeams {
  const { host } = shell;
  return {
    readWorksites: () => shell.client.creatureWorksites(),
    feed: shell.feed,
    trackedFiles:
      host.trackedFiles === undefined
        ? undefined
        : async (directory) => await host.trackedFiles?.(directory),
  };
}

export function createWorksites(seams: PlaceSeams, now: () => number = Date.now): Worksites {
  const [rows, setRows] = createSignal<readonly CreatureWorksite[]>([]);
  const [heardAt, setHeardAt] = createSignal<HeardAt>(new Map());
  const [whole, setWhole] = createSignal(false);
  let beforeTheListing: CreatureWorksiteChange[] | undefined = [];
  let disposed = false;

  const follow = (change: CreatureWorksiteChange): void => {
    if (beforeTheListing !== undefined) {
      beforeTheListing.push(change);
      return;
    }
    setRows((held) => worksitesAfter(held, change));
    setHeardAt((held) => new Map(held).set(worksiteKey(change.worksite), now()));
  };
  const seat = (listed: readonly CreatureWorksite[] | undefined): void => {
    const early = beforeTheListing ?? [];
    beforeTheListing = undefined;
    if (disposed) return;
    batch(() => {
      setRows(early.reduce(worksitesAfter, inOrderOfFounding(listed ?? [])));
      setWhole(listed !== undefined);
    });
  };

  onCleanup(
    seams.feed.subscribe((batch) => {
      for (const envelope of batch) {
        if (envelope.type === "creature.worksites") follow(envelope.payload);
      }
    }),
  );
  void Promise.resolve()
    .then(() => seams.readWorksites())
    .then(
      (listed) => seat(Array.isArray(listed) ? listed : undefined),
      () => seat(undefined),
    );
  onCleanup(() => {
    disposed = true;
  });
  return { rows, heardAt, whole };
}

export const browserTimers: PlaceTimers = {
  every: (ms, run) => {
    const timer = setInterval(run, ms);
    return () => clearInterval(timer);
  },
};

export const forgetful: LotOrders = { stored: () => undefined, keep: () => undefined };

const noLots: LotOrder = {};

function copied(order: LotOrder): Record<string, string[]> {
  return Object.fromEntries(Object.entries(order).map(([creature, lot]) => [creature, [...lot]]));
}

function createTrackedFiles(
  seams: PlaceSeams,
  directories: () => readonly string[],
  timers: PlaceTimers,
): () => TrackedFiles {
  const [trackedFiles, setTrackedFiles] = createSignal<TrackedFiles>({});
  const wanted = createMemo(directories, [], { equals: sameList });
  let disposed = false;

  const count = async (): Promise<void> => {
    const read = seams.trackedFiles;
    if (read === undefined) return;
    const counted = await Promise.all(
      wanted().map(
        async (directory) => [directory, await read(directory).catch(() => undefined)] as const,
      ),
    );
    const next: Record<string, number> = {};
    for (const [directory, files] of counted) if (files !== undefined) next[directory] = files;
    if (!disposed && !sameCounts(trackedFiles(), next)) setTrackedFiles(next);
  };

  createEffect(on(wanted, () => void count()));
  const stopRefreshing = timers.every(trackedFilesRefreshMs, () => void count());
  onCleanup(() => {
    disposed = true;
    stopRefreshing();
  });
  return trackedFiles;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameCounts(a: TrackedFiles, b: TrackedFiles): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}
