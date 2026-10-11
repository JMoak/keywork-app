import type { ServerFeed } from "@keywork-app/client";
import type { BusEnvelope, PendingAsk } from "@keywork-app/protocol";
import type { HostNotice, HostPort } from "./port.ts";

export const askReason = "needs you · ask";

export interface PendingAskSeams {
  feed: Pick<ServerFeed, "subscribe">;
  asks(): Promise<readonly PendingAsk[]>;
  host: Pick<HostPort, "setPendingAsks" | "notify">;
  workspace: string;
  titleOf(sessionId: string): string | undefined;
}

export function reportPendingAsks(seams: PendingAskSeams): () => void {
  let tally = emptyTally;
  let reported = 0;

  const report = (): void => {
    const count = tally.waiting.size;
    if (count === reported) return;
    reported = count;
    void seams.host.setPendingAsks(count);
  };

  const stop = seams.feed.subscribe((envelopes) => {
    tally = foldAsks(tally, envelopes);
    for (const asked of freshAsks(envelopes, tally))
      void seams.host.notify(askNotice(seams, asked));
    report();
  });

  void seams.asks().then(
    (pending) => {
      tally = seededTally(tally, pending);
      report();
    },
    () => undefined,
  );

  return () => {
    stop();
    if (reported !== 0) void seams.host.setPendingAsks(0);
  };
}

export interface AskTally {
  readonly waiting: ReadonlySet<string>;
  readonly settled: ReadonlySet<string>;
}

export const emptyTally: AskTally = { waiting: new Set(), settled: new Set() };

export function foldAsks(tally: AskTally, envelopes: readonly BusEnvelope[]): AskTally {
  const waiting = new Set(tally.waiting);
  const settled = new Set(tally.settled);
  for (const envelope of envelopes) {
    if (envelope.type === "gate.ask" && isLiveAsk(envelope, settled)) {
      waiting.add(envelope.payload.ask.callId);
    }
    if (envelope.type === "gate.permission") {
      waiting.delete(envelope.payload.decision.callId);
      settled.add(envelope.payload.decision.callId);
    }
  }
  return { waiting, settled };
}

export function seededTally(tally: AskTally, pending: readonly PendingAsk[]): AskTally {
  const waiting = new Set(tally.waiting);
  for (const ask of pending) if (!tally.settled.has(ask.callId)) waiting.add(ask.callId);
  return { waiting, settled: tally.settled };
}

interface FreshAsk {
  sessionId: string;
  callId: string;
}

function freshAsks(envelopes: readonly BusEnvelope[], tally: AskTally): FreshAsk[] {
  return envelopes.flatMap((envelope) =>
    envelope.type === "gate.ask" &&
    envelope.payload.replay !== true &&
    tally.waiting.has(envelope.payload.ask.callId)
      ? [{ sessionId: envelope.sessionId, callId: envelope.payload.ask.callId }]
      : [],
  );
}

function askNotice(seams: PendingAskSeams, asked: FreshAsk): HostNotice {
  return {
    title: seams.titleOf(asked.sessionId) ?? "keywork",
    body: askReason,
    trigger: { kind: "ask", workspace: seams.workspace, ...asked },
  };
}

function isLiveAsk(
  envelope: Extract<BusEnvelope, { type: "gate.ask" }>,
  settled: ReadonlySet<string>,
): boolean {
  return envelope.payload.replay !== true && !settled.has(envelope.payload.ask.callId);
}
