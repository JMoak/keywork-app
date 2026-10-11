import { batchPerFrame, emptyProjection, projectAll } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { scenarios } from "../dev/scenarios.ts";
import { ConversationPane } from "../page/pane.tsx";
import { frameTick } from "./frame-tick.ts";
import { ratchetValue } from "./frame-tick-ratchets.ts";

describe("T8: latency honesty, counted in work per frame", () => {
  const eventsPerFrame = ratchetValue("T8.eventsPerFrame");

  it.each(scenarios.map((scenario) => [scenario.name, scenario.envelopes] as const))(
    "%s: the reducer stays inside its per-frame budget at the ratcheted load",
    (_, envelopes) => {
      const stream = streamedCharacterByCharacter(envelopes);
      const replay = replayInFrames(stream, eventsPerFrame);
      expect(replay.projection.entries).toEqual(projectAll(emptyProjection, envelopes).entries);
      expect(Math.max(...replay.reducerSteps)).toBeLessThanOrEqual(
        ratchetValue("T8.reducerStepsPerFrame"),
      );
    },
  );

  it("streams at least one fixture long enough to fill a whole frame at that load", () => {
    const longest = Math.max(
      ...scenarios.map((scenario) => streamedCharacterByCharacter(scenario.envelopes).length),
    );
    expect(longest).toBeGreaterThanOrEqual(eventsPerFrame);
  });

  it("keeps the conversation pane's first paint of every recorded fixture inside its budget", () => {
    const elements = scenarios.map((scenario) => firstPaintElements(scenario.envelopes));
    expect(sum(elements)).toBeLessThanOrEqual(ratchetValue("T8.firstPaintElements"));
  });
});

interface FrameReplay {
  projection: ReturnType<typeof projectAll>;
  reducerSteps: number[];
}

function replayInFrames(stream: readonly BusEnvelope[], perFrame: number): FrameReplay {
  const frames: Array<() => void> = [];
  const reducerSteps: number[] = [];
  let projection = emptyProjection;
  const batcher = batchPerFrame(
    (batch) => {
      reducerSteps.push(batch.length);
      projection = projectAll(projection, batch);
    },
    frameTick({
      requestAnimationFrame: (paint) => frames.push(() => paint(0)),
      setTimeout: () => 0,
    }),
  );
  for (let start = 0; start < stream.length; start += perFrame) {
    for (const envelope of stream.slice(start, start + perFrame)) batcher.push(envelope);
    for (const paint of frames.splice(0)) paint();
  }
  return { projection, reducerSteps };
}

function firstPaintElements(envelopes: readonly BusEnvelope[]): number {
  const projection = projectAll(emptyProjection, envelopes);
  const { container, unmount } = render(() => <ConversationPane projection={projection} />);
  const elements = container.querySelectorAll("*").length;
  unmount();
  return elements;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function streamedCharacterByCharacter(envelopes: readonly BusEnvelope[]): BusEnvelope[] {
  return envelopes.flatMap(splitIntoCharacters).map((envelope, index) => ({
    ...envelope,
    id: index + 1,
  }));
}

function splitIntoCharacters(envelope: BusEnvelope): BusEnvelope[] {
  if (envelope.type === "tool.output") {
    return [...envelope.payload.chunk].map((chunk) => ({
      ...envelope,
      payload: { ...envelope.payload, chunk },
    }));
  }
  if (envelope.type === "turn.delta") {
    const { delta } = envelope.payload;
    if (delta.type === "text" || delta.type === "visible-thinking") {
      return [...delta.text].map((text) => ({
        ...envelope,
        payload: { ...envelope.payload, delta: { ...delta, text } },
      }));
    }
  }
  return [envelope];
}
