import type { YardState } from "@keywork-app/habitat";
import { type Accessor, createEffect, onCleanup, untrack } from "solid-js";

export type ChangesAt = (yard: YardState, at: number) => number | undefined;

export interface YardWakeSeams {
  readonly yard: Accessor<YardState>;
  readonly changesAt: ChangesAt;
  now(): number;
  wake(): void;
}

export const soonestWakeMs = 100;

export function wakeWhenTheYardChanges(seams: YardWakeSeams): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sleep = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (yard: YardState): void => {
    sleep();
    const at = seams.now();
    const next = seams.changesAt(yard, at);
    if (next === undefined) return;
    timer = setTimeout(wake, Math.max(soonestWakeMs, next - at));
  };
  const wake = (): void => {
    seams.wake();
    schedule(untrack(seams.yard));
  };
  createEffect(() => schedule(seams.yard()));
  onCleanup(sleep);
}
