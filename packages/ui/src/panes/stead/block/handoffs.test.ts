import type { BatchListener } from "@keywork-app/client";
import type {
  BusEnvelope,
  CreatureHandoff,
  CreatureHandoffChange,
  ServedRefusal,
} from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createPartnerships, type HandoffSeams } from "./handoffs.ts";

describe("who works with whom, from the engine's hand-off tally", () => {
  it("reads the whole tally once for a cold start and lays a road for each pair", async () => {
    const engine = fakeEngine();
    await inRoot(async () => {
      const pairs = createPartnerships(engine.seams);
      expect(pairs()).toEqual([]);
      engine.answer([handoff("wren", "pip", 4, 1), handoff("pip", "wren", 1, 2)]);
      await settled();
      expect(pairs()).toEqual([{ between: ["pip", "wren"], handoffs: 5, grade: 2 }]);
      expect(engine.reads()).toBe(1);
    });
  });

  it("follows each counted hand-off on the stream, and takes the road up when the engine drops the pair", async () => {
    const engine = fakeEngine();
    await inRoot(async () => {
      const pairs = createPartnerships(engine.seams);
      engine.answer([handoff("wren", "pip", 19, 1)]);
      await settled();
      expect(pairs()).toMatchObject([{ grade: 2 }]);
      engine.emit(change("counted", handoff("wren", "pip", 20, 2)));
      expect(pairs()).toMatchObject([{ between: ["pip", "wren"], grade: 3 }]);
      engine.emit(change("dropped", handoff("wren", "pip", 20, 2)));
      expect(pairs()).toEqual([]);
    });
  });

  it("keeps what the stream said while the cold start was still being read", async () => {
    const engine = fakeEngine();
    await inRoot(async () => {
      const pairs = createPartnerships(engine.seams);
      engine.emit(change("counted", handoff("ada", "bea", 1, 5)));
      engine.emit(change("counted", handoff("wren", "pip", 3, 1)));
      expect(pairs()).toEqual([]);
      engine.answer([handoff("wren", "pip", 4, 2)]);
      await settled();
      expect(pairs()).toEqual([
        { between: ["pip", "wren"], handoffs: 4, grade: 1 },
        { between: ["ada", "bea"], handoffs: 1, grade: 1 },
      ]);
    });
  });

  it("starts with no roads on a server that keeps no tally, and still follows the stream", async () => {
    const engine = fakeEngine();
    await inRoot(async () => {
      const pairs = createPartnerships(engine.seams);
      engine.refuse({ refused: "missing", detail: "the server answered 404" });
      await settled();
      expect(pairs()).toEqual([]);
      engine.emit(change("counted", handoff("ada", "bea", 5, 1)));
      expect(pairs()).toMatchObject([{ grade: 2 }]);
    });
  });

  it("stops listening when the stead goes", async () => {
    const engine = fakeEngine();
    await inRoot(async () => {
      createPartnerships(engine.seams);
    });
    expect(engine.listening()).toBe(0);
  });
});

function fakeEngine() {
  const listeners = new Set<BatchListener>();
  let reads = 0;
  let settle: ((answer: readonly CreatureHandoff[] | ServedRefusal) => void) | undefined;
  const answered = new Promise<readonly CreatureHandoff[] | ServedRefusal>((resolve) => {
    settle = resolve;
  });
  let id = 0;
  const seams: HandoffSeams = {
    readHandoffs: () => {
      reads += 1;
      return answered;
    },
    feed: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  return {
    seams,
    reads: () => reads,
    listening: () => listeners.size,
    answer: (rows: readonly CreatureHandoff[]) => settle?.(rows),
    refuse: (refusal: ServedRefusal) => settle?.(refusal),
    emit: (payload: CreatureHandoffChange) => {
      id += 1;
      const envelope: BusEnvelope = {
        id,
        ts: payload.handoff.lastAt,
        sessionId: "",
        type: "creature.handoff",
        payload,
      };
      for (const listener of [...listeners]) listener([envelope]);
    },
  };
}

function handoff(from: string, to: string, count: number, minute: number): CreatureHandoff {
  return { from, to, count, lastAt: new Date(Date.UTC(2026, 10, 22, 9, minute)).toISOString() };
}

function change(
  kind: CreatureHandoffChange["change"],
  row: CreatureHandoff,
): CreatureHandoffChange {
  return { change: kind, handoff: row };
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
