import type { Clock } from "../companion/companion.ts";
import type { ScreenPoint, ScreenRect } from "./channels.ts";
import type { Glider, GlideTrack, PlayTrack } from "./glide.ts";
import { type Journey, mostRolesInAPlay, type PanesHelper, type Role } from "./helper.ts";

export const helperPatienceMs = 250;
// Windows sizes a window while the call waits. Measured on 2026-11-22 with real panes at 60 Hz:
// growing on the way kept 62 updates a second with four panes and 56 with eight, and fell to 30
// with sixteen. Past this many panes changing size in one play, each takes its size at once.
export const mostPanesGrowingOnTheWay = 8;
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
    helper.release(leg.window);
    holdUntilSynced(key);
  };

  const takeOff = (
    legs: Map<Key, Leg<Key>>,
    lastsMs: number,
    send: (id: number) => void,
  ): Promise<void> => {
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
        durationMs: lastsMs,
        legs,
        landed,
        unwatch: overdue(lastsMs),
      };
      flights.set(flight.id, flight);
      send(flight.id);
    });
  };

  const fly = (tracks: readonly GlideTrack<Key>[], durationMs: number): Promise<void> => {
    if (tracks.length === 0) return Promise.resolve();
    const legs = new Map(tracks.map((track) => [track.key, legOf(track, seams)] as const));
    const journeys = [...legs.values()].flatMap((leg) => leg.journey ?? []);
    return takeOff(legs, durationMs, (id) => helper.glide(id, durationMs, journeys));
  };

  const stage = (tracks: readonly PlayTrack<Key>[]): Promise<void> => {
    if (tracks.length === 0) return Promise.resolve();
    const legs = new Map(tracks.map((track) => [track.key, partOf(track, seams)] as const));
    const roles = sizedForTheirNumber([...legs.values()].flatMap((leg) => leg.role ?? []));
    const lastsMs = Math.max(...roles.map((role) => role.delayMs + role.durationMs));
    return takeOff(legs, lastsMs, (id) => helper.play(id, roles));
  };

  // Whatever the helper had not finished is finished here: a glide with the time it had left,
  // and each part of a play with what is left of its own wait and of its own journey.
  const handOver = (flight: Flight<Key>): void => {
    flights.delete(flight.id);
    flight.unwatch();
    const elapsed = clock.now() - flight.startedAt;
    const legs = [...flight.legs.values()];
    const glides = legs.flatMap((leg) => leg.track ?? []);
    const parts = legs.flatMap((leg) => (leg.part === undefined ? [] : [later(leg.part, elapsed)]));
    const left = Math.max(0, flight.durationMs - elapsed);
    void Promise.all([unaided.run(glides, left), unaided.play(parts)]).then(flight.landed);
  };

  helper.watch({
    settled: (id) => {
      const flight = flights.get(id);
      if (flight === undefined) return;
      for (const leg of flight.legs.values()) leg.arrive();
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
    play: (tracks) => {
      if (!helper.inUse()) return unaided.play(tracks);
      const latest = [...new Map(tracks.map((track) => [track.key, track] as const)).values()];
      const ours = latest.filter((track) => !lettingGo.has(track.key)).slice(0, mostRolesInAPlay);
      const theirs = latest.filter((track) => !ours.includes(track));
      return Promise.all([unaided.play(theirs), stage(ours)]).then(() => undefined);
    },
    gliding: (key) => unaided.gliding(key) || flightOf(key) !== undefined || lettingGo.has(key),
    drop,
    stop: () => {
      for (const flight of [...flights.values()]) {
        for (const { window } of flight.legs.values()) helper.release(window);
        land(flight);
      }
      for (const forget of awaitedSyncs.splice(0)) forget();
      lettingGo.clear();
      unaided.stop();
    },
  };
}

// A leg is a glide's (a track and its journey) or a play's (a part and its role).
interface Leg<Key> {
  readonly window: string;
  readonly arrive: () => void;
  readonly track?: GlideTrack<Key>;
  readonly journey?: Journey;
  readonly part?: PlayTrack<Key>;
  readonly role?: Role;
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
  const window = seams.windowOf(track.key);
  return {
    window,
    arrive: () => arrive(track),
    track,
    journey: {
      window,
      at: seams.pixelsOf(track.body.position()),
      to: seams.pixelsOf(track.to),
    },
  };
}

function partOf<Key>(track: PlayTrack<Key>, seams: HelpedSeams<Key>): Leg<Key> {
  const window = seams.windowOf(track.key);
  return {
    window,
    arrive: () => takeShape(track),
    part: track,
    role: {
      window,
      at: inPixels(track.body.frame(), seams),
      to: inPixels(track.to, seams),
      delayMs: wholeMs(track.delayMs),
      durationMs: wholeMs(track.durationMs),
    },
  };
}

// Both corners are converted, so a frame keeps its size in pixels on the display it stands on.
function inPixels<Key>(frame: ScreenRect, seams: HelpedSeams<Key>): ScreenRect {
  const corner = seams.pixelsOf(frame);
  const far = seams.pixelsOf({ x: frame.x + frame.width, y: frame.y + frame.height });
  return { x: corner.x, y: corner.y, width: far.x - corner.x, height: far.y - corner.y };
}

function sizedForTheirNumber(roles: readonly Role[]): Role[] {
  const changesSize = ({ at, to }: Role): boolean =>
    at.width !== to.width || at.height !== to.height;
  const sizeAtOnce = roles.filter(changesSize).length > mostPanesGrowingOnTheWay;
  return roles.map((role) => (sizeAtOnce && changesSize(role) ? { ...role, sizeAtOnce } : role));
}

function later<Key>(part: PlayTrack<Key>, elapsedMs: number): PlayTrack<Key> {
  const delayMs = Math.max(0, part.delayMs - elapsedMs);
  const underWay = Math.max(0, elapsedMs - part.delayMs);
  return { ...part, delayMs, durationMs: Math.max(0, part.durationMs - underWay) };
}

function carries<Key>(flight: Flight<Key>, window: string): boolean {
  return [...flight.legs.values()].some((leg) => leg.window === window);
}

function takeShape<Key>(track: PlayTrack<Key>): void {
  const stands = track.body.frame();
  const { to } = track;
  const there =
    stands.x === to.x &&
    stands.y === to.y &&
    stands.width === to.width &&
    stands.height === to.height;
  if (!there) track.body.reshape(to);
}

function arrive<Key>(track: GlideTrack<Key>): void {
  const stands = track.body.position();
  if (stands.x !== track.to.x || stands.y !== track.to.y) track.body.moveTo(track.to);
}

function wholeMs(durationMs: number): number {
  return durationMs > 0 ? Math.min(Math.round(durationMs), longestHelperGlideMs) : 0;
}
