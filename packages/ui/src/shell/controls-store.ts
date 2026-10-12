import type { KeyworkClient, ServerFeed } from "@keywork-app/client";
import {
  type ActivePreset,
  type BusEnvelope,
  type CompactReading,
  type ContextReport,
  type ControlRefusal,
  type CostReport,
  type EffortLevel,
  type EffortReading,
  type ExportReading,
  type ExportRequest,
  isControlRefusal,
  isPresetName,
  type ModelReading,
  type PresetName,
  type PresetReading,
  type RedoReading,
  type RenameReading,
  type ResolutionFailure,
  type ThinkingReading,
  type UndoReading,
} from "@keywork-app/protocol";
import { createStore } from "solid-js/store";

export type ControlsClient = Pick<
  KeyworkClient,
  | "setModel"
  | "setThinking"
  | "setEffort"
  | "compact"
  | "undo"
  | "redo"
  | "context"
  | "cost"
  | "exportSession"
  | "rename"
  | "applyPreset"
>;

export interface SessionReadings {
  readonly context: ContextReport | undefined;
  readonly cost: CostReport | undefined;
}

export interface DraftSeed {
  readonly text: string;
}

export interface ControlsState {
  readonly preset: ActivePreset | undefined;
  readonly readings: Readonly<Record<string, SessionReadings>>;
  readonly seeds: Readonly<Record<string, DraftSeed | undefined>>;
  readonly learnedModels: readonly string[];
}

export interface ControlsStore {
  readonly state: ControlsState;
  readings(id: string | undefined): SessionReadings;
  watchReadings(id: string): Promise<void>;
  seed(id: string | undefined): DraftSeed | undefined;
  forgetSeed(id: string): void;
  models(): readonly string[];
  setModel(id: string, reference: string): Promise<ModelReading>;
  setThinking(id: string, on: boolean): Promise<ThinkingReading>;
  setEffort(id: string, level: EffortLevel | null): Promise<EffortReading>;
  compact(id: string, focus?: string): Promise<CompactReading>;
  undo(id: string): Promise<UndoReading>;
  redo(id: string): Promise<RedoReading>;
  rename(id: string, title: string): Promise<RenameReading>;
  exportSession(id: string, request?: ExportRequest): Promise<ExportReading>;
  setPreset(name: PresetName, confirmed?: boolean): Promise<PresetReading>;
  dispose(): void;
}

export interface ControlsSeams {
  reload(id: string): Promise<void>;
  knownModels(): readonly (string | undefined)[];
}

export const unreadReadings: SessionReadings = { context: undefined, cost: undefined };

export function createControlsStore(
  client: ControlsClient,
  feed: Pick<ServerFeed, "subscribe">,
  seams: ControlsSeams,
): ControlsStore {
  const [state, setState] = createStore<MutableControlsState>({
    preset: undefined,
    readings: {},
    seeds: {},
    learnedModels: [],
  });
  const watched = new Set<string>();
  const readingFetches = new Map<string, Promise<void>>();

  const refreshReadings = (id: string): Promise<void> => {
    const running = readingFetches.get(id);
    if (running !== undefined) return running;
    const fetched = Promise.all([client.context(id), client.cost(id)])
      .then(([context, cost]) => {
        setState("readings", id, {
          context: context === "missing" ? undefined : context,
          cost: cost === "missing" ? undefined : cost,
        });
      })
      .finally(() => readingFetches.delete(id));
    readingFetches.set(id, fetched);
    return fetched;
  };

  const whenAnswered = async <Reading>(
    reading: Promise<Reading>,
    then: (answer: Exclude<Reading, string | ControlRefusal>) => Promise<void> | void,
  ): Promise<Reading> => {
    const answer = await reading;
    if (typeof answer !== "string" && !isControlRefusal(answer)) {
      await then(answer as Exclude<Reading, string | ControlRefusal>);
    }
    return answer;
  };

  const learnFrom = (failure: ResolutionFailure | undefined): void => {
    const offered = failure === undefined ? [] : modelsOffered(failure);
    if (offered.length === 0) return;
    setState("learnedModels", (known) => unique([...known, ...offered]));
  };

  const follow = (envelopes: readonly BusEnvelope[]): void => {
    for (const envelope of envelopes) {
      if (envelope.type === "gate.preset") setState("preset", activePresetOf(envelope.payload.to));
      if (refetchesReadings(envelope) && watched.has(envelope.sessionId)) {
        void refreshReadings(envelope.sessionId);
      }
    }
  };
  const stop = feed.subscribe(follow);

  return {
    state,
    readings: (id) => (id === undefined ? unreadReadings : (state.readings[id] ?? unreadReadings)),
    watchReadings: (id) => {
      watched.add(id);
      return refreshReadings(id);
    },
    seed: (id) => (id === undefined ? undefined : state.seeds[id]),
    forgetSeed: (id) => setState("seeds", id, undefined),
    models: () =>
      unique([
        ...seams.knownModels().filter((model): model is string => model !== undefined),
        ...state.learnedModels,
      ]),
    setModel: async (id, reference) => {
      const reading = await client.setModel(id, reference);
      if (isControlRefusal(reading)) learnFrom(reading.failure);
      return reading;
    },
    setThinking: (id, on) => client.setThinking(id, on),
    setEffort: (id, level) => client.setEffort(id, level),
    compact: (id, focus) => whenAnswered(client.compact(id, focus), () => seams.reload(id)),
    undo: (id) =>
      whenAnswered(client.undo(id), async (undone) => {
        if (undone.prompt !== null) setState("seeds", id, { text: undone.prompt.text });
        await seams.reload(id);
      }),
    redo: (id) =>
      whenAnswered(client.redo(id), async () => {
        setState("seeds", id, undefined);
        await seams.reload(id);
      }),
    rename: (id, title) => client.rename(id, title),
    exportSession: (id, request) => client.exportSession(id, request),
    setPreset: async (name, confirmed) => {
      const reading = await client.applyPreset(name, confirmed);
      if (!isControlRefusal(reading)) setState("preset", reading.to);
      return reading;
    },
    dispose: stop,
  };
}

export function activePresetOf(word: string): ActivePreset {
  return isPresetName(word) ? word : "custom";
}

export function modelsOffered(failure: ResolutionFailure): readonly string[] {
  switch (failure.code) {
    case "unconfigured":
      return failure.available;
    case "ambiguous":
      return failure.candidates;
    case "unknown-provider":
    case "unknown-model":
      return failure.known;
    default:
      return [];
  }
}

interface MutableControlsState {
  preset: ActivePreset | undefined;
  readings: Record<string, SessionReadings>;
  seeds: Record<string, DraftSeed | undefined>;
  learnedModels: string[];
}

function refetchesReadings(envelope: BusEnvelope): boolean {
  return envelope.type === "turn.completed" || envelope.type === "session.state";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
