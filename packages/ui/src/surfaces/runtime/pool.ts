import {
  type SurfaceEvent,
  type SurfaceId,
  type SurfacesPort,
  surfaceFramePrefix,
  surfacePageUrl,
} from "../port.ts";
import type { Realm } from "./realm.ts";

export interface PooledWindow {
  readonly id: SurfaceId;
  readonly window: Realm;
}

export interface Prepared {
  readonly settled: Promise<void>;
  dispose(): void;
}

export interface WindowPoolOptions {
  readonly port: SurfacesPort;
  readonly open: (url: string, frame: string) => Window | null;
  readonly prepare: (child: Realm) => Prepared;
  readonly lost: (taken: PooledWindow) => void;
  readonly size?: number | undefined;
  readonly burst?: number | undefined;
  readonly warmWithinMs?: number | undefined;
}

export interface WindowPool {
  warm(size?: number): void;
  warmCount(): number;
  take(): Promise<PooledWindow>;
  give(taken: PooledWindow): void;
  dispose(): void;
}

export const defaultPoolSize = 3;
export const defaultWarmWithinMs = 4000;
export const refillWithinMs = 120;

export class WindowRefused extends Error {
  override readonly name = "WindowRefused";
}

export function createWindowPool(options: WindowPoolOptions): WindowPool {
  const { port } = options;
  const warmWithinMs = options.warmWithinMs ?? defaultWarmWithinMs;
  const opening = new Map<string, Opening>();
  const announcedEarly = new Set<SurfaceId>();
  const preparations = new Map<PooledWindow, Prepared>();
  const idle: PooledWindow[] = [];
  const taken = new Set<PooledWindow>();
  const takers: Taker[] = [];
  let size = options.size ?? defaultPoolSize;
  let opened = 0;
  let toppingUp = false;
  let disposed = false;

  const open = (): boolean => {
    opened += 1;
    const frame = `${surfaceFramePrefix}${opened}`;
    const child = options.open(surfacePageUrl, frame);
    const early = [...announcedEarly].find((id) => names(id, frame));
    if (early !== undefined) announcedEarly.delete(early);
    if (child === null) return false;
    const window = child as Realm;
    const prepared = options.prepare(window);
    const named = deferred<SurfaceId>();
    const candidate: Opening = {
      frame,
      window,
      prepared,
      named,
      deadline: setTimeout(() => abandon(candidate, notInTime()), warmWithinMs),
    };
    opening.set(frame, candidate);
    if (early !== undefined) named.resolve(early);
    window.addEventListener("pagehide", () => vanished(window), { once: true });
    Promise.all([named.promise, prepared.settled]).then(
      ([id]) => arrive(candidate, id),
      (error: unknown) => abandon(candidate, error),
    );
    return true;
  };

  const arrive = (candidate: Opening, id: SurfaceId): void => {
    if (!opening.delete(candidate.frame)) return;
    clearTimeout(candidate.deadline);
    const warm: PooledWindow = { id, window: candidate.window };
    preparations.set(warm, candidate.prepared);
    hand(warm);
  };

  const abandon = (candidate: Opening, error: unknown): void => {
    if (!opening.delete(candidate.frame)) return;
    clearTimeout(candidate.deadline);
    candidate.prepared.dispose();
    candidate.window.close();
    refuseUnserved(error);
  };

  const hand = (warm: PooledWindow): void => {
    const taker = takers.shift();
    if (taker === undefined) {
      idle.push(warm);
      return;
    }
    taken.add(warm);
    taker.resolve(warm);
  };

  const refuseUnserved = (error: unknown): void => {
    while (takers.length > opening.size) takers.pop()?.reject(error);
  };

  const summon = (): void => {
    while (opening.size < takers.length) {
      if (open()) continue;
      refuseUnserved(new WindowRefused("no window could open for this pane"));
      return;
    }
  };

  const kept = (): number => Math.max(size, (options.burst ?? 0) - taken.size);

  const shortOfABurst = (): boolean => idle.length + opening.size < kept() + takers.length;

  const refill = (): void => {
    if (disposed) return;
    while (idle.length + opening.size < size + takers.length) if (!open()) return;
    if (shortOfABurst()) oneMoreSoon();
  };

  const oneMoreSoon = (): void => {
    if (toppingUp) return;
    toppingUp = true;
    soon(oneMore);
  };

  const oneMore = (): void => {
    toppingUp = false;
    if (!disposed && shortOfABurst() && open()) oneMoreSoon();
  };

  const release = (held: PooledWindow): void => {
    preparations.get(held)?.dispose();
    preparations.delete(held);
  };

  const close = (held: PooledWindow): void => {
    release(held);
    quietly(port.close(held.id));
  };

  const forget = (held: PooledWindow): void => {
    const at = idle.indexOf(held);
    if (at >= 0) idle.splice(at, 1);
    if (taken.delete(held)) options.lost(held);
    release(held);
    whenIdle(refill);
  };

  const closedUnderneath = (
    candidate: Opening | undefined,
    held: PooledWindow | undefined,
  ): void => {
    if (candidate !== undefined) abandon(candidate, closedEarly());
    else if (held !== undefined) forget(held);
  };

  const vanished = (window: Realm): void =>
    closedUnderneath(
      [...opening.values()].find((candidate) => candidate.window === window),
      [...idle, ...taken].find((held) => held.window === window),
    );

  const openingNamed = (id: SurfaceId): Opening | undefined =>
    [...opening.values()].find((candidate) => names(id, candidate.frame));

  // The host can announce a window while the call that opens it is still returning.
  const announced = (id: SurfaceId): void => {
    const candidate = openingNamed(id);
    if (candidate === undefined) announcedEarly.add(id);
    else candidate.named.resolve(id);
  };

  const unsubscribe = port.onEvent((event: SurfaceEvent) => {
    if (event.kind === "ready") announced(event.id);
    else if (event.kind === "closed") {
      closedUnderneath(
        openingNamed(event.id),
        [...idle, ...taken].find((held) => held.id === event.id),
      );
    }
  });

  return {
    warm: (next = size) => {
      size = next;
      refill();
    },
    warmCount: () => idle.length,
    take: () => {
      if (disposed) return Promise.reject(new WindowRefused("panes can no longer leave"));
      const warm = idle.shift();
      if (warm !== undefined) {
        taken.add(warm);
        whenIdle(refill);
        return Promise.resolve(warm);
      }
      const taker = deferred<PooledWindow>();
      takers.push(taker);
      summon();
      return taker.promise;
    },
    give: (held) => {
      if (!taken.delete(held)) return;
      if (disposed || held.window.closed) return close(held);
      if (takers.length === 0 && idle.length >= kept()) return close(held);
      quietly(port.hide(held.id));
      hand(held);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      for (const candidate of [...opening.values()]) abandon(candidate, disposedEarly());
      refuseUnserved(disposedEarly());
      for (const held of [...idle, ...taken]) close(held);
      idle.length = 0;
      taken.clear();
    },
  };
}

interface Opening {
  readonly frame: string;
  readonly window: Realm;
  readonly prepared: Prepared;
  readonly named: Deferred<SurfaceId>;
  readonly deadline: ReturnType<typeof setTimeout>;
}

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(error: unknown): void;
}

type Taker = Deferred<PooledWindow>;

function names(id: SurfaceId, frame: string): boolean {
  return id === frame || `${surfaceFramePrefix}${id}` === frame;
}

function notInTime(): WindowRefused {
  return new WindowRefused("a window for this pane did not open in time");
}

function closedEarly(): WindowRefused {
  return new WindowRefused("the window for this pane closed before it was ready");
}

function disposedEarly(): WindowRefused {
  return new WindowRefused("panes can no longer leave");
}

function deferred<Value>(): Deferred<Value> {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<Value>((fulfil, fail) => {
    resolve = fulfil;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function whenIdle(work: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(work, { timeout: refillWithinMs });
  } else setTimeout(work, 0);
}

function soon(work: () => void): void {
  setTimeout(work, 0);
}

function quietly(request: Promise<void>): void {
  request.catch(() => undefined);
}
