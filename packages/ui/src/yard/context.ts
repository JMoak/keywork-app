import type { ServerFeed } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { type Accessor, createSignal, onCleanup } from "solid-js";

export type KeeperVoice = Readonly<Record<string, number>>;

export function keeperSpokeAfter(spoke: KeeperVoice, batch: readonly BusEnvelope[]): KeeperVoice {
  const spoken = batch.filter(spokenByTheKeeper);
  if (spoken.length === 0) return spoke;
  const latest: Record<string, number> = { ...spoke };
  for (const envelope of spoken) {
    latest[envelope.sessionId] = Math.max(latest[envelope.sessionId] ?? 0, Date.parse(envelope.ts));
  }
  return latest;
}

export function createKeeperVoice(feed: Pick<ServerFeed, "subscribe">): Accessor<KeeperVoice> {
  const [spoke, setSpoke] = createSignal<KeeperVoice>({});
  onCleanup(feed.subscribe((batch) => setSpoke((held) => keeperSpokeAfter(held, batch))));
  return spoke;
}

function spokenByTheKeeper(envelope: BusEnvelope): boolean {
  return (
    envelope.type === "turn.started" &&
    envelope.payload.origin === undefined &&
    envelope.payload.replay !== true &&
    !Number.isNaN(Date.parse(envelope.ts))
  );
}
