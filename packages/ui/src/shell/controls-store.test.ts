import type { ServerFeed } from "@keywork-app/client";
import type {
  BusEnvelope,
  ContextReport,
  CostReport,
  ResolutionFailure,
  SessionState,
  TurnRestored,
} from "@keywork-app/protocol";
import { createRoot } from "solid-js";
import { describe, expect, it } from "vitest";
import recordedAnswers from "../../../client/src/fixtures/controls.json";
import recordedRestore from "../../../client/src/fixtures/restored.json";
import {
  activePresetOf,
  type ControlsClient,
  type ControlsSeams,
  createControlsStore,
  modelsOffered,
} from "./controls-store.ts";

const recordedContext = recordedAnswers.context.body as ContextReport;
const recordedCost = recordedAnswers.cost.body as CostReport;
const recordedFailure = recordedAnswers.modelUnknown.body.failure as ResolutionFailure;

export function idleControlsClient(): ControlsClient {
  return {
    setModel: async () => "missing",
    setThinking: async () => "missing",
    setEffort: async () => "missing",
    compact: async () => "missing",
    undo: async () => "missing",
    redo: async () => "missing",
    restoreTurn: async () => "missing",
    context: async () => "missing",
    cost: async () => "missing",
    exportSession: async () => "missing",
    rename: async () => "missing",
    applyPreset: async () => ({
      refused: "unavailable",
      detail: "this process has no preset switch",
    }),
  };
}

function manualFeed() {
  const listeners: Array<(envelopes: readonly BusEnvelope[]) => void> = [];
  const feed: Pick<ServerFeed, "subscribe"> = {
    subscribe: (listener) => {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
  };
  const emit = (envelopes: BusEnvelope[]): void => {
    for (const listener of listeners) listener(envelopes);
  };
  return { feed, emit };
}

function standing(id: number, sessionId: string, overrides: Partial<SessionState> = {}) {
  return {
    id,
    ts: "2026-09-07T12:00:01.000Z",
    sessionId,
    type: "session.state",
    payload: {
      thinking: false,
      title: "Lights",
      leafId: "e1",
      undoable: true,
      redoable: false,
      ...overrides,
    },
  } as BusEnvelope;
}

function storeOver(client: Partial<ControlsClient>, seams: Partial<ControlsSeams> = {}) {
  const { feed, emit } = manualFeed();
  const reloads: string[] = [];
  const store = createRoot(() =>
    createControlsStore({ ...idleControlsClient(), ...client }, feed, {
      reload: async (id) => {
        reloads.push(id);
      },
      knownModels: () => [],
      ...seams,
    }),
  );
  return { store, emit, reloads };
}

const flush = () => new Promise((settle) => setTimeout(settle, 0));

describe("the controls store", () => {
  it("reads context and cost once watched, and rereads them when a turn completes or the state moves", async () => {
    let reads = 0;
    const { store, emit } = storeOver({
      context: async () => {
        reads += 1;
        return recordedContext;
      },
      cost: async () => recordedCost,
    });
    expect(store.readings("s1")).toEqual({ context: undefined, cost: undefined });
    await store.watchReadings("s1");
    expect(store.readings("s1")).toEqual({ context: recordedContext, cost: recordedCost });
    emit([
      {
        id: 4,
        ts: "t",
        sessionId: "s1",
        type: "turn.completed",
        payload: {
          message: { role: "assistant", parts: [] },
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      },
    ]);
    await flush();
    emit([standing(5, "s1"), standing(6, "s2")]);
    await flush();
    expect(reads).toBe(3);
  });

  it("learns the preset from any gate.preset and from its own switch", async () => {
    const { store, emit } = storeOver({
      applyPreset: async (name) => ({ from: "open", to: name }),
    });
    expect(store.state.preset).toBeUndefined();
    emit([
      {
        id: 9,
        ts: "t",
        sessionId: "",
        type: "gate.preset",
        payload: { from: "standard", to: "open" },
      },
    ]);
    expect(store.state.preset).toBe("open");
    await store.setPreset("careful");
    expect(store.state.preset).toBe("careful");
    expect(activePresetOf("edited")).toBe("custom");
  });

  it("keeps the preset where it was when the switch is refused", async () => {
    const { store } = storeOver({
      applyPreset: async () => ({
        refused: "needs-confirmation",
        detail: "loosening needs confirmed: true",
      }),
    });
    expect(await store.setPreset("open")).toMatchObject({ refused: "needs-confirmation" });
    expect(store.state.preset).toBeUndefined();
  });

  it("seeds the composer with the undone prompt and reloads the transcript", async () => {
    const undone = recordedAnswers.undo.body as {
      prompt: { entryId: string; text: string };
      filesNote: string;
      undoable: boolean;
      redoable: boolean;
    };
    const { store, reloads } = storeOver({
      undo: async () => undone,
      redo: async () => ({ restored: true, undoable: true, redoable: false }),
    });
    expect(store.seed("s1")).toBeUndefined();
    await store.undo("s1");
    expect(store.seed("s1")).toEqual({ text: "turn on the lights" });
    await store.redo("s1");
    expect(store.seed("s1")).toBeUndefined();
    expect(reloads).toEqual(["s1", "s1"]);
  });

  it("stages a turn restore like an undo: the turn's prompt seeds the composer, the transcript reloads", async () => {
    const restored = recordedRestore.restored.body as TurnRestored;
    const { store, reloads } = storeOver({ restoreTurn: async () => restored });
    expect(await store.restoreTurn("s1", 1)).toEqual(restored);
    expect(store.seed("s1")).toEqual({ text: "write two lines to notes.txt" });
    expect(reloads).toEqual(["s1"]);
  });

  it("neither seeds nor reloads when the server refuses a restore", async () => {
    const { store, reloads } = storeOver({
      restoreTurn: async () => ({ refused: "nothing", detail: "no turn 9 on this session's path" }),
    });
    expect(await store.restoreTurn("s1", 9)).toMatchObject({ refused: "nothing" });
    expect(store.seed("s1")).toBeUndefined();
    expect(reloads).toEqual([]);
  });

  it("neither seeds nor reloads when the server refuses an undo", async () => {
    const { store, reloads } = storeOver({
      undo: async () => ({ refused: "nothing", detail: "nothing to undo" }),
    });
    expect(await store.undo("s1")).toEqual({ refused: "nothing", detail: "nothing to undo" });
    expect(store.seed("s1")).toBeUndefined();
    expect(reloads).toEqual([]);
  });

  it("lists the models it has seen and learns the ones a refusal offers", async () => {
    const { store } = storeOver(
      {
        setModel: async () => ({
          refused: "unresolved",
          detail: recordedFailure.message,
          failure: recordedFailure,
        }),
      },
      { knownModels: () => ["mock/beta", undefined, "mock/beta"] },
    );
    expect(store.models()).toEqual(["mock/beta"]);
    await store.setModel("s1", "mock/gamma");
    expect(store.models()).toEqual(["mock/beta", "mock/alpha"]);
  });

  it("reads the models each failure offers", () => {
    expect(modelsOffered(recordedFailure)).toEqual(["mock/alpha", "mock/beta"]);
    expect(modelsOffered({ code: "unconfigured", message: "none", available: ["a/b"] })).toEqual([
      "a/b",
    ]);
    expect(
      modelsOffered({
        code: "ambiguous",
        message: "two",
        reference: "b",
        candidates: ["a/b", "c/b"],
      }),
    ).toEqual(["a/b", "c/b"]);
    expect(
      modelsOffered({ code: "disabled-provider", message: "off", reference: "a/b", provider: "a" }),
    ).toEqual([]);
  });
});
