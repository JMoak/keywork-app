import type { BatchListener } from "@keywork-app/client";
import { type BlockWorld, blockScene, neonKit, workshopCell } from "@keywork-app/habitat/block";
import { noon, sketchTown, slugOf } from "@keywork-app/habitat/block/testing";
import type { BusEnvelope, ModelWait, ModelWaitChange, ServedRefusal } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createModelWaits, type WaitSeams } from "./waits.ts";

const first = slugOf(0);
const second = slugOf(3);
const third = slugOf(4);

describe("the line at the mill", () => {
  it("stands creatures in the order their waits began, and sends each home when its wait is over", async () => {
    const engine = fakeEngine();
    await inRoot(async () => {
      const waiting = createModelWaits(engine.seams);
      const town = (): BlockWorld =>
        blockScene(sketchTown(5), {
          kit: neonKit,
          appearance: "night",
          now: noon,
          waiting: waiting(),
        }).world;
      engine.answer([wait(second, 2)]);
      await settled();
      expect(inLine(town())).toEqual([second]);

      engine.emit(change("waiting", wait(third, 3)));
      engine.emit(change("waiting", wait(first, 1)));
      expect(inLine(town())).toEqual([first, second, third]);

      engine.emit(change("over", wait(first, 1)));
      expect(inLine(town())).toEqual([second, third]);
      expect(standsOn(town(), first)).toEqual(workshopCell(0));

      engine.emit(change("over", wait(second, 2)));
      engine.emit(change("over", wait(third, 3)));
      expect(inLine(town())).toEqual([]);
    });
  });
});

function inLine(world: BlockWorld): string[] {
  return world.cast
    .flatMap((member) =>
      member.seat?.at === "mill" ? [{ slug: member.slug, along: member.seat.spot.x }] : [],
    )
    .sort((a, b) => a.along - b.along)
    .map((standing) => standing.slug);
}

function standsOn(world: BlockWorld, slug: string): { cx: number; cz: number } | undefined {
  return world.cast.find((member) => member.slug === slug)?.stands.cell;
}

function wait(creature: string, minute: number): ModelWait {
  return {
    session: `session-of-${creature}`,
    creature,
    server: "http://127.0.0.1:11434",
    reason: "busy",
    since: new Date(Date.UTC(2026, 10, 24, 9, minute)).toISOString(),
  };
}

function change(kind: ModelWaitChange["change"], row: ModelWait): ModelWaitChange {
  return { change: kind, wait: row };
}

function fakeEngine() {
  const listeners = new Set<BatchListener>();
  let settle: ((answer: readonly ModelWait[] | ServedRefusal) => void) | undefined;
  const answered = new Promise<readonly ModelWait[] | ServedRefusal>((resolve) => {
    settle = resolve;
  });
  let id = 0;
  const seams: WaitSeams = {
    readWaits: () => answered,
    feed: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  return {
    seams,
    answer: (rows: readonly ModelWait[]) => settle?.(rows),
    emit: (payload: ModelWaitChange) => {
      id += 1;
      const envelope = {
        id,
        ts: payload.wait.since,
        sessionId: payload.wait.session,
        type: "model.wait",
        payload,
      } as unknown as BusEnvelope;
      for (const listener of [...listeners]) listener([envelope]);
    },
  };
}

async function inRoot(body: () => Promise<void>): Promise<void> {
  let dispose: (() => void) | undefined;
  const run = createRoot((done) => {
    dispose = done;
    return body();
  });
  try {
    await run;
  } finally {
    dispose?.();
  }
}

async function settled(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}
