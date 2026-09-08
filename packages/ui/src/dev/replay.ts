import type { BusEnvelope } from "@keywork-app/protocol";

export interface ReplayOptions {
  cadenceMs?: number | undefined;
  schedule?: ((run: () => void, delayMs: number) => () => void) | undefined;
}

export interface Replay {
  stop(): void;
  done: Promise<void>;
}

export const defaultCadenceMs = 40;

export function parseJsonl(text: string): BusEnvelope[] {
  return text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as BusEnvelope);
}

export function replayEnvelopes(
  envelopes: readonly BusEnvelope[],
  sink: (envelope: BusEnvelope) => void,
  options: ReplayOptions = {},
): Replay {
  const cadence = options.cadenceMs ?? defaultCadenceMs;
  const schedule = options.schedule ?? timeoutSchedule;
  let cancel: () => void = () => {};
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const step = (index: number): void => {
    const envelope = envelopes[index];
    if (envelope === undefined) {
      finish();
      return;
    }
    sink(envelope);
    cancel = schedule(() => step(index + 1), pauseAfter(envelope, cadence));
  };
  step(0);
  return {
    stop: () => {
      cancel();
      cancel = () => {};
      finish();
    },
    done,
  };
}

function pauseAfter(envelope: BusEnvelope, cadence: number): number {
  switch (envelope.type) {
    case "tool.output":
      return cadence / 2;
    case "tool.started":
      return cadence * 6;
    case "turn.started":
      return cadence * 8;
    case "turn.completed":
    case "turn.interrupted":
      return cadence * 4;
    default:
      return cadence;
  }
}

function timeoutSchedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs);
  return () => clearTimeout(timer);
}
