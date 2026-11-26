import { modelWaitChangeOf, modelWaitOperations, type ServerFeed } from "@keywork-app/client";
import type { Waiting } from "@keywork-app/habitat/block";
import type { ModelWait, ModelWaitChange, ServedRefusal } from "@keywork-app/protocol";
import { createMemo, createSignal, onCleanup } from "solid-js";
import { servedOperations } from "../../mills/port.ts";
import type { ShellSeams } from "../../registry.ts";

export interface WaitSeams {
  readWaits(): Promise<readonly ModelWait[] | ServedRefusal>;
  readonly feed: Pick<ServerFeed, "subscribe">;
}

export function waitSeamsOf(shell: Pick<ShellSeams, "client" | "feed">): WaitSeams {
  return {
    readWaits: async () =>
      (await servedOperations(shell.client)).has(modelWaitOperations.modelWaits)
        ? shell.client.modelWaits()
        : [],
    feed: shell.feed,
  };
}

export function createModelWaits(seams: WaitSeams): () => readonly Waiting[] {
  const [waits, setWaits] = createSignal<readonly ModelWait[]>([]);
  let beforeTheListing: ModelWaitChange[] | undefined = [];
  let disposed = false;

  const follow = (change: ModelWaitChange): void => {
    if (beforeTheListing === undefined) setWaits((held) => waitsAfter(held, change));
    else beforeTheListing.push(change);
  };
  const seat = (listed: readonly ModelWait[]): void => {
    const early = beforeTheListing ?? [];
    beforeTheListing = undefined;
    if (!disposed) setWaits(early.reduce(waitsAfter, listed));
  };

  onCleanup(
    seams.feed.subscribe((batch) => {
      for (const envelope of batch) {
        const change = modelWaitChangeOf(envelope);
        if (change !== undefined) follow(change);
      }
    }),
  );
  void Promise.resolve()
    .then(() => seams.readWaits())
    .then(
      (listed) => seat(Array.isArray(listed) ? listed : []),
      () => seat([]),
    );
  onCleanup(() => {
    disposed = true;
  });
  return createMemo(() => waitingOf(waits()), [], { equals: sameWaiting });
}

export function waitsAfter(
  held: readonly ModelWait[],
  { change, wait }: ModelWaitChange,
): readonly ModelWait[] {
  const others = held.filter((each) => each.session !== wait.session);
  return change === "waiting" ? [...others, wait] : others;
}

export function waitingOf(waits: readonly ModelWait[]): Waiting[] {
  return waits.flatMap((wait) =>
    wait.creature === null
      ? []
      : [
          {
            creature: wait.creature,
            cloud: wait.server === null,
            reason: wait.reason,
            since: Date.parse(wait.since),
          },
        ],
  );
}

function sameWaiting(one: readonly Waiting[], other: readonly Waiting[]): boolean {
  return (
    one.length === other.length &&
    one.every((wait, index) => {
      const held = other[index];
      return (
        held !== undefined &&
        wait.creature === held.creature &&
        wait.cloud === held.cloud &&
        wait.reason === held.reason &&
        wait.since === held.since
      );
    })
  );
}
