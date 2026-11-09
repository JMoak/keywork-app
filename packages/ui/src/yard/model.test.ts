import type { BusEnvelope } from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import type { ShellSeams } from "../panes/index.ts";
import { createYardModel } from "./model.ts";
import { createYardRuleBook } from "./rules.ts";
import { unseenSurroundings } from "./signals.ts";
import { aSetting, proposed } from "./testing.ts";

describe("the yard model", () => {
  it("feeds the keeper's attention into the habitat world, where the kernel measures it", () => {
    const run = yardModel();
    run.emit([proposed(1, aSetting({ id: "diff", rung: "unfold" }))]);
    run.model.attend({ type: "keeper.attend", ts: at(1), id: "diff", kind: "interact" });
    expect(run.attentionOf("diff")?.interactions).toBe(1);
    run.dispose();
  });

  it("ignores attention to a panel the yard does not hold", () => {
    const run = yardModel();
    run.model.attend({ type: "keeper.attend", ts: at(1), id: "gone", kind: "enter" });
    expect(run.model.settings()).toEqual([]);
    run.dispose();
  });
});

function yardModel() {
  const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
  const shell = {
    feed: {
      subscribe: (listener: (batch: readonly BusEnvelope[]) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    store: { state: { summaries: [] }, surfaces: { state: { bots: [] } } },
    client: { creatures: async () => [], settings: async () => [] },
  } as unknown as ShellSeams;
  return createRoot((dispose) => {
    const model = createYardModel({
      shell,
      home: () => undefined,
      focusedThread: () => undefined,
      windowFocused: () => true,
      reducedMotion: () => true,
      signals: () => ({
        ...unseenSurroundings,
        visible: true,
        draftOpen: false,
        streaming: false,
        railFocused: false,
        returnedAt: undefined,
        doNotDisturb: false,
        quietHours: false,
      }),
      rules: createYardRuleBook(undefined),
      now: () => Date.parse(at(0)),
    });
    return {
      model,
      dispose,
      emit: (batch: readonly BusEnvelope[]) => {
        for (const listener of listeners) listener(batch);
      },
      attentionOf: (id: string) => model.settings().find((setting) => setting.id === id)?.attention,
    };
  });
}

function at(second: number): string {
  return new Date(Date.UTC(2026, 10, 8, 9, 0, second)).toISOString();
}
