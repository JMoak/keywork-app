import type { ServerFeed } from "@keywork-app/client";
import {
  type HandoffTally,
  noHandoffs,
  type Pairing,
  partnershipsOf,
  tallyAfter,
  tallyOf,
} from "@keywork-app/habitat/block";
import type { CreatureHandoff, CreatureHandoffChange, ServedRefusal } from "@keywork-app/protocol";
import { createMemo, createSignal, onCleanup } from "solid-js";
import type { ShellSeams } from "../../registry.ts";

export interface HandoffSeams {
  readHandoffs(): Promise<readonly CreatureHandoff[] | ServedRefusal>;
  readonly feed: Pick<ServerFeed, "subscribe">;
}

export function handoffSeamsOf(shell: Pick<ShellSeams, "client" | "feed">): HandoffSeams {
  return { readHandoffs: () => shell.client.creatureHandoffs(), feed: shell.feed };
}

export function createPartnerships(seams: HandoffSeams): () => readonly Pairing[] {
  const tally = createHandoffTally(seams);
  return createMemo(() => partnershipsOf(tally()), [], { equals: samePairings });
}

export function createHandoffTally(seams: HandoffSeams): () => HandoffTally {
  const [tally, setTally] = createSignal<HandoffTally>(noHandoffs);
  let waiting: CreatureHandoffChange[] | undefined = [];
  let disposed = false;

  const follow = (change: CreatureHandoffChange): void => {
    if (waiting === undefined) setTally((held) => tallyAfter(held, change));
    else waiting.push(change);
  };
  const seat = (listed: readonly CreatureHandoff[]): void => {
    const early = waiting ?? [];
    waiting = undefined;
    if (!disposed) setTally(early.reduce(tallyAfter, tallyOf(listed)));
  };

  onCleanup(
    seams.feed.subscribe((batch) => {
      for (const envelope of batch) {
        if (envelope.type === "creature.handoff") follow(envelope.payload);
      }
    }),
  );
  void Promise.resolve()
    .then(() => seams.readHandoffs())
    .then(
      (listed) => seat(Array.isArray(listed) ? listed : []),
      () => seat([]),
    );
  onCleanup(() => {
    disposed = true;
  });
  return tally;
}

function samePairings(a: readonly Pairing[], b: readonly Pairing[]): boolean {
  return (
    a.length === b.length &&
    a.every((pair, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        pair.grade === other.grade &&
        pair.between[0] === other.between[0] &&
        pair.between[1] === other.between[1]
      );
    })
  );
}
