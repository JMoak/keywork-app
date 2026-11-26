import type { ServerFeed } from "@keywork-app/client";
import {
  type Land,
  type LandMemory,
  landMemoryAfter,
  landsOf,
  noLands,
  sameLandMemory,
} from "@keywork-app/habitat/block";
import { createEffect, createMemo, createSignal, on, onCleanup } from "solid-js";
import { censusWithLanes, lanesHeardWhileReading, meshNewsOf } from "../../parcels/parcels.ts";
import { type Census, censusSchema } from "../../parcels/wire.ts";
import type { ShellSeams } from "../../registry.ts";
import { browserTimers, type PlaceTimers } from "./places.ts";

export interface MachineSeams {
  readCensus(): Promise<unknown>;
  readonly feed: Pick<ServerFeed, "subscribe">;
}

export interface LandMemories {
  stored(): LandMemory | undefined;
  keep(memory: KeptLands): void;
}

export interface KeptLands {
  order: string[];
  halls: string[];
}

export const censusRefreshMs = 60_000;

export function machineSeamsOf(shell: Pick<ShellSeams, "client" | "feed">): MachineSeams {
  return { readCensus: () => shell.client.meshPeers(), feed: shell.feed };
}

export function createLands(
  seams: MachineSeams,
  memories: LandMemories,
  looking: () => boolean,
  timers: PlaceTimers = browserTimers,
): () => readonly Land[] {
  const [census, setCensus] = createSignal<Census>();
  const lanesHeard = lanesHeardWhileReading();
  let disposed = false;

  const read = async (): Promise<void> => {
    const tap = lanesHeard.open();
    const answer = await Promise.resolve()
      .then(() => seams.readCensus())
      .catch(() => undefined);
    const heard = tap.close();
    const parsed = censusSchema.safeParse(answer);
    if (!disposed && parsed.success) setCensus(censusWithLanes(parsed.data, heard));
  };

  onCleanup(
    seams.feed.subscribe((batch) => {
      const { lanes } = meshNewsOf(batch);
      lanesHeard.hear(lanes);
      if (lanes.length > 0) setCensus((held) => censusWithLanes(held, lanes));
    }),
  );
  onCleanup(() => {
    disposed = true;
  });
  createEffect(
    on(looking, (now, before) => {
      if (now || before === undefined) void read();
      if (now) onCleanup(timers.every(censusRefreshMs, () => void read()));
    }),
  );

  const memory = createMemo(
    () => landMemoryAfter(memories.stored() ?? noLands, census()),
    noLands,
    { equals: sameLandMemory },
  );
  createEffect(
    on(memory, (held) => {
      if (!sameLandMemory(held, memories.stored() ?? noLands)) {
        memories.keep({ order: [...held.order], halls: [...held.halls] });
      }
    }),
  );
  return createMemo(() => landsOf(census(), memory()));
}
