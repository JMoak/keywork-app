import type { Clock } from "../companion/companion.ts";
import type { ScreenPoint } from "./channels.ts";
import type { Glider, GlideTrack } from "./glide.ts";
import type { Journey, PanesHelper } from "./helper.ts";

export const helperPatienceMs = 250;
export const longestHelperGlideMs = 600_000;

export interface HelpedSeams<Key> {
  helper: PanesHelper;
  unaided: Glider<Key>;
  clock: Pick<Clock, "now" | "setTimeout" | "clearTimeout">;
  windowOf(key: Key): string;
  pixelsOf(point: ScreenPoint): ScreenPoint;
  letGo(key: Key): void;
}

export function helpedGlider<Key>(seams: HelpedSeams<Key>): Glider<Key> {
  const { helper, unaided, clock } = seams;
  const flights = new Map<number, Flight<Key>>();
  const lettingGo = new Map<Key, number>();
  const awaitedSyncs: Array<() => void> = [];
  let flown = 0;
  let syncsAsked = 0;
  let syncsAnswered = 0;

  // A stalled event loop fires a timer that is long due before it reads what the helper wrote
  // meanwhile, so silence counts only once it has outlasted a second wait.
  const overdue = (afterMs: number): (() => void) => {
    let timer = clock.setTimeout(() => {
      timer = clock.setTimeout(() => helper.retire("it stopped answering"), helperPatienceMs);
    }, afterMs + helperPatienceMs);
    return () => clock.clearTimeout(timer);
  };

  const land = (flight: Flight<Key>): void => {
    if (!flights.delete(flight.id)) return;
    flight.unwatch();
    flight.landed();
  };

  const flightOf = (key: Key): Flight<Key> | undefined =>
    [...flights.values()].find((flight) => flight.legs.has(key));

  const leave = (key: Key): Leg<Key> | undefined => {
    const flight = flightOf(key);
    const leg = flight?.legs.get(key);
    if (flight === undefined || leg === undefined) return undefined;
    flight.legs.delete(key);
    if (flight.legs.size === 0) land(flight);
    return leg;
  };

  // A move the helper had already issued can land after it is told to let a window go; only
  // its answer to the sync that follows says the window is the host's alone again.
  const holdUntilSynced = (key: Key): void => {
    if (!helper.inUse()) return;
    syncsAsked += 1;
    lettingGo.set(key, syncsAsked);
    awaitedSyncs.push(overdue(0));
    helper.sync();
  };

  const free = (key: Key): void => {
    lettingGo.delete(key);
    seams.letGo(key);
  };

  const drop = (key: Key): void => {
    unaided.drop(key);
    const leg = leave(key);
    if (leg === undefined) return;
    helper.release(leg.journey.window);
    holdUntilSynced(key);
  };

  const fly = (tracks: readonly GlideTrack<Key>[], durationMs: number): Promise<void> => {
    if (tracks.length === 0) return Promise.resolve();
    const legs = new Map(tracks.map((track) => [track.key, legOf(track, seams)] as const));
    for (const key of legs.keys()) {
      unaided.drop(key);
      leave(key);
    }
    flown += 1;
    const id = flown;
    return new Promise((landed) => {
      const flight: Flight<Key> = {
        id,
        startedAt: clock.now(),
        durationMs,
        legs,
        landed,
        unwatch: overdue(durationMs),
      };
      flights.set(flight.id, flight);
      helper.glide(
        flight.id,
        durationMs,
        [...legs.values()].map(({ journey }) => journey),
      );
    });
  };

  const handOver = (flight: Flight<Key>): void => {
    flights.delete(flight.id);
    flight.unwatch();
    const left = Math.max(0, flight.durationMs - (clock.now() - flight.startedAt));
    const tracks = [...flight.legs.values()].map(({ track }) => track);
    void unaided.run(tracks, left).then(flight.landed);
  };

  helper.watch({
    settled: (id) => {
      const flight = flights.get(id);
      if (flight === undefined) return;
      for (const { track } of flight.legs.values()) arrive(track);
      land(flight);
    },
    refused: (window, reason) => {
      const flying = [...flights.values()].some((flight) => carries(flight, window));
      if (flying) helper.retire(`it refused window ${window} (${reason})`);
    },
    synced: () => {
      syncsAnswered += 1;
      awaitedSyncs.shift()?.();
      for (const [key, sync] of [...lettingGo]) if (sync <= syncsAnswered) free(key);
    },
    retired: () => {
      for (const forget of awaitedSyncs.splice(0)) forget();
      for (const key of [...lettingGo.keys()]) free(key);
      for (const flight of [...flights.values()]) handOver(flight);
    },
  });

  return {
    run: (tracks, durationMs) => {
      if (!helper.inUse()) return unaided.run(tracks, durationMs);
      const latest = [...new Map(tracks.map((track) => [track.key, track] as const)).values()];
      const held = latest.filter((track) => lettingGo.has(track.key));
      const ours = latest.filter((track) => !lettingGo.has(track.key));
      return Promise.all([unaided.run(held, durationMs), fly(ours, wholeMs(durationMs))]).then(
        () => undefined,
      );
    },
    gliding: (key) => unaided.gliding(key) || flightOf(key) !== undefined || lettingGo.has(key),
    drop,
    stop: () => {
      for (const flight of [...flights.values()]) {
        for (const { journey } of flight.legs.values()) helper.release(journey.window);
        land(flight);
      }
      for (const forget of awaitedSyncs.splice(0)) forget();
      lettingGo.clear();
      unaided.stop();
    },
  };
}

interface Leg<Key> {
  readonly track: GlideTrack<Key>;
  readonly journey: Journey;
}

interface Flight<Key> {
  readonly id: number;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly legs: Map<Key, Leg<Key>>;
  readonly landed: () => void;
  readonly unwatch: () => void;
}

function legOf<Key>(track: GlideTrack<Key>, seams: HelpedSeams<Key>): Leg<Key> {
  return {
    track,
    journey: {
      window: seams.windowOf(track.key),
      at: seams.pixelsOf(track.body.position()),
      to: seams.pixelsOf(track.to),
    },
  };
}

function carries<Key>(flight: Flight<Key>, window: string): boolean {
  return [...flight.legs.values()].some((leg) => leg.journey.window === window);
}

function arrive<Key>(track: GlideTrack<Key>): void {
  const stands = track.body.position();
  if (stands.x !== track.to.x || stands.y !== track.to.y) track.body.moveTo(track.to);
}

function wholeMs(durationMs: number): number {
  return durationMs > 0 ? Math.min(Math.round(durationMs), longestHelperGlideMs) : 0;
}
