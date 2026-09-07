import type { BusEnvelope } from "@keywork-app/protocol";

export function coalesceEnvelopes(batch: readonly BusEnvelope[]): BusEnvelope[] {
  const merged: BusEnvelope[] = [];
  for (const envelope of batch) {
    const last = merged.at(-1);
    const target = mergeTargetOf(envelope);
    if (last !== undefined && target !== undefined && mergeTargetOf(last) === target) {
      merged[merged.length - 1] = mergedEnvelope(last, envelope);
    } else {
      merged.push(envelope);
    }
  }
  return merged;
}

export interface FrameBatcher {
  push(envelope: BusEnvelope): void;
  flush(): void;
}

export type TickScheduler = (flush: () => void) => void;

export function batchPerFrame(
  sink: (envelopes: readonly BusEnvelope[]) => void,
  tick: TickScheduler,
): FrameBatcher {
  const pending: BusEnvelope[] = [];
  let armed = false;
  const flush = (): void => {
    armed = false;
    if (pending.length === 0) return;
    sink(coalesceEnvelopes(pending.splice(0)));
  };
  return {
    push: (envelope) => {
      pending.push(envelope);
      if (armed) return;
      armed = true;
      tick(flush);
    },
    flush,
  };
}

function mergeTargetOf(envelope: BusEnvelope): string | undefined {
  const replay = envelope.payload.replay === true ? "replay" : "live";
  const scope = `${envelope.sessionId}:${replay}`;
  if (envelope.type === "tool.output") return `${scope}:tool:${envelope.payload.callId ?? ""}`;
  if (envelope.type !== "turn.delta") return undefined;
  const { delta } = envelope.payload;
  if (delta.type === "text") return `${scope}:text`;
  if (delta.type === "visible-thinking") return `${scope}:thinking`;
  return undefined;
}

function mergedEnvelope(earlier: BusEnvelope, later: BusEnvelope): BusEnvelope {
  if (earlier.type === "tool.output" && later.type === "tool.output") {
    return {
      ...later,
      payload: { ...later.payload, chunk: earlier.payload.chunk + later.payload.chunk },
    };
  }
  if (earlier.type === "turn.delta" && later.type === "turn.delta") {
    const first = earlier.payload.delta;
    const second = later.payload.delta;
    if (
      (first.type === "text" && second.type === "text") ||
      (first.type === "visible-thinking" && second.type === "visible-thinking")
    ) {
      return {
        ...later,
        payload: { ...later.payload, delta: { ...second, text: first.text + second.text } },
      };
    }
  }
  return later;
}
