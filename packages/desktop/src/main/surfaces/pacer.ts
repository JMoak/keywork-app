export const glideFrameMs = 8;

export interface PacerClock {
  now(): number;
  defer(run: () => void): void;
  sleep(run: () => void, ms: number): void;
}

export interface Pacing {
  readonly frameMs: number;
  readonly timerLatenessMs: number;
}

export type EveryFrame = (tick: () => void) => () => void;

export function framePacer(clock: PacerClock, pacing: Pacing): EveryFrame {
  return (tick) => {
    let live = true;
    let due = clock.now() + pacing.frameMs;

    const waitUntilDue = (): void => {
      const left = due - clock.now();
      if (left > pacing.timerLatenessMs) clock.sleep(wake, left - pacing.timerLatenessMs);
      else clock.defer(wake);
    };

    const wake = (): void => {
      if (!live) return;
      if (clock.now() >= due) {
        due = clock.now() + pacing.frameMs;
        tick();
      }
      if (live) waitUntilDue();
    };

    waitUntilDue();
    return () => {
      live = false;
    };
  };
}

// Windows wakes a timer on its 15.6 ms clock interrupt, later than a frame lasts, so there the
// wait for the next frame can only be spent yielding to the event loop.
export function timerLatenessOn(platform: NodeJS.Platform): number {
  return platform === "win32" ? 16 : 1;
}
