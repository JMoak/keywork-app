import { describe, expect, it } from "vitest";
import { companionChannels } from "../main/companion/channels.ts";
import { companionHostPort } from "./companion-host.ts";

describe("companionHostPort", () => {
  it("publishes one way, invokes for answers, and subscribes with a working unsubscribe", async () => {
    const invoked: Array<[string, unknown[]]> = [];
    const sent: Array<[string, unknown[]]> = [];
    const listeners = new Map<string, (event: unknown, payload: unknown) => void>();
    const host = companionHostPort({
      invoke: (async (channel: string, ...payload: unknown[]) => {
        invoked.push([channel, payload]);
        return { mode: "floating", window: "shown", reason: "floating" };
      }) as never,
      send: ((channel: string, ...payload: unknown[]) => sent.push([channel, payload])) as never,
      on: ((channel: string, listener: (event: unknown, payload: unknown) => void) => {
        listeners.set(channel, listener);
      }) as never,
      removeListener: ((channel: string) => {
        listeners.delete(channel);
      }) as never,
    });
    host.publish({
      creature: { name: "pip", hueStop: undefined },
      state: "idle",
      stateLabel: "idle",
      activeThreads: 0,
      finishedUnseen: 0,
      threadId: undefined,
      tool: undefined,
      needsYou: undefined,
    });
    expect(sent[0]?.[0]).toBe(companionChannels.publish);
    expect(await host.presence()).toMatchObject({ mode: "floating" });
    await host.setPreferences({ hidden: true });
    expect(invoked.map(([channel]) => channel)).toEqual([
      companionChannels.presence,
      companionChannels.setPreferences,
    ]);
    const answers: unknown[] = [];
    const stop = host.onAnswerRequested((request) => answers.push(request));
    listeners.get(companionChannels.answerRequested)?.({}, { callId: "c1", pick: "once" });
    stop();
    expect(answers).toEqual([{ callId: "c1", pick: "once" }]);
    expect(listeners.has(companionChannels.answerRequested)).toBe(false);
  });
});
