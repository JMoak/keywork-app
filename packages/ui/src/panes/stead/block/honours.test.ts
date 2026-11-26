import { type BatchListener, envelopeOf } from "@keywork-app/client";
import { blockScene, neonKit } from "@keywork-app/habitat/block";
import { noon, sketchTown, slugOf } from "@keywork-app/habitat/block/testing";
import type { Honour, HonourKind } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import { createSteadStanding, type SteadStanding, worldStandingOf } from "./honours.ts";

const [wren, tam, ida] = [slugOf(0), slugOf(1), slugOf(2)];

describe("what was earned, as the stead draws it", () => {
  it("turns each creature's honours into its standing, tool, ribbon and medal, and the stead's own into the stone and the statue", () => {
    const drawn = worldStandingOf([
      ...earned(wren, ["conversations", 1], ["conversations", 2], ["night", 1], ["standing", 1]),
      ...earned(wren, ["range", 1], ["range", 2], ["run", 1]),
      ...earned(tam, ["run", 1], ["run", 2], ["run", 3]),
      ...earned(ida, ["range", 3], ["night", 1]),
      ...earned(null, ["first-creature", 1], ["hamlet", 1]),
    ]);
    expect(drawn.decorations).toEqual({
      [wren]: { garland: true, banner: 2, star: true, ribbon: 1 },
      [tam]: { garland: true, banner: 1, star: false, ribbon: 3 },
      [ida]: { garland: false, banner: 0, star: false, ribbon: 0 },
    });
    expect(drawn.tools).toEqual({ [wren]: 2, [tam]: 0, [ida]: 3 });
    expect(drawn.medals).toEqual({ [wren]: true });
    expect(drawn.monument).toBe(1);
    expect(monumentWith("first-creature", "town", "paved-road")).toBe(0);
    expect(monumentWith("first-creature", "hamlet", "town", "paved-road")).toBe(2);
  });

  it("opens no ring for a row read at start, and one from the workshop or the green when an honour is earned while it watches", async () => {
    const town = blockScene(sketchTown(3, noon), {
      kit: neonKit,
      appearance: "night",
      now: noon,
      monument: 1,
    }).world;
    const workshop = town.cells
      .flatMap((cell) => cell.items)
      .find((item) => item.target?.kind === "workshop" && item.target.creature === wren);
    const stead = watching(earned(wren, ["conversations", 1], ["night", 1]));
    await settled();
    expect(stead.standing.world().decorations[wren]?.garland).toBe(false);
    expect(stead.standing.arriving(town, noon, false)).toBeUndefined();
    expect(stead.standing.said()).toBeUndefined();

    stead.hear("earned", ...earned(wren, ["run", 1]), ...earned(null, ["hamlet", 1]));
    await settled();
    expect(stead.standing.world().decorations[wren]).toMatchObject({ garland: true, ribbon: 1 });
    expect(stead.standing.said()).toBe(
      "Wren earned a ribbon: seven days in a row. The stead is a hamlet now.",
    );
    expect(stead.standing.arriving(town, noon, true)).toBeUndefined();
    expect(stead.standing.arriving(town, noon, false)).toEqual({
      kind: "honour",
      holder: wren,
      at: { x: workshop?.x, z: workshop?.z },
    });
    expect(stead.standing.arriving(town, noon, false)).toMatchObject({ holder: undefined });
    expect(stead.standing.arriving(town, noon, false)).toBeUndefined();
    stead.dispose();
  });
});

function earned(holder: string | null, ...tiers: readonly [HonourKind, number][]): Honour[] {
  return tiers.map(([kind, tier], index) => ({
    holder,
    kind,
    tier,
    with: null,
    earnedAt: new Date(noon - (tiers.length - index) * 60_000).toISOString(),
    proof: `${kind} ${tier}`,
  }));
}

function monumentWith(...kinds: HonourKind[]): number {
  return worldStandingOf(kinds.flatMap((kind) => earned(null, [kind, 1]))).monument;
}

interface Watching {
  readonly standing: SteadStanding;
  hear(change: "earned" | "dropped", ...honours: Honour[]): void;
  dispose(): void;
}

function watching(listed: readonly Honour[]): Watching {
  const listeners = new Set<BatchListener>();
  return createRoot((dispose) => ({
    standing: createSteadStanding(
      {
        readHonours: async () => listed,
        feed: {
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
      },
      (slug) => (slug === wren ? "Wren" : slug),
      () => noon,
    ),
    hear: (change, ...honours) => {
      const heard = honours.flatMap((honour, index) => {
        const data = JSON.stringify({
          id: index + 1,
          ts: honour.earnedAt,
          sessionId: "",
          type: "creature.honours",
          payload: { change, honour },
        });
        return envelopeOf({ id: undefined, event: undefined, data, comments: [] }) ?? [];
      });
      for (const listener of listeners) listener(heard);
    },
    dispose,
  }));
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
