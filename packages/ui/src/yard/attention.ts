import type { AttendKind, KeeperNotice } from "@keywork-app/habitat";
import { type Accessor, createEffect, on } from "solid-js";

export type AttendNotice = Extract<KeeperNotice, { type: "keeper.attend" }>;

export interface AttentionSeams {
  readonly panel: Accessor<string | undefined>;
  now(): number;
  attend(notice: AttendNotice): void;
}

export interface AttentionReports {
  interacted(id: string): void;
}

export interface AttentionFeed {
  attend(notice: AttendNotice): void;
  subscribe(listener: (notice: AttendNotice) => void): () => void;
}

export const interactEveryMs = 2_000;

export const interactionEvents = ["scroll", "input", "keydown"] as const;

export function createAttentionReports(seams: AttentionSeams): AttentionReports {
  const report = (id: string, kind: AttendKind): void =>
    seams.attend({ type: "keeper.attend", ts: new Date(seams.now()).toISOString(), id, kind });
  createEffect(
    on(seams.panel, (now, before) => {
      if (before !== undefined) report(before, "leave");
      if (now !== undefined) report(now, "enter");
    }),
  );
  const lastInteraction = new Map<string, number>();
  return {
    interacted: (id) => {
      const at = seams.now();
      if (!interactionDue(lastInteraction.get(id), at)) return;
      lastInteraction.set(id, at);
      report(id, "interact");
    },
  };
}

export function createAttentionFeed(): AttentionFeed {
  const listeners = new Set<(notice: AttendNotice) => void>();
  return {
    attend: (notice) => {
      for (const listener of listeners) listener(notice);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function interactionDue(lastAt: number | undefined, at: number): boolean {
  return lastAt === undefined || at - lastAt >= interactEveryMs;
}

export function watchInteractions(element: HTMLElement, interacted: () => void): () => void {
  for (const type of interactionEvents) {
    element.addEventListener(type, interacted, { capture: true, passive: true });
  }
  return () => {
    for (const type of interactionEvents) {
      element.removeEventListener(type, interacted, { capture: true });
    }
  };
}
