import type { ConsoleClient, KeyworkClient } from "@keywork-app/client";
import type { BusEnvelope } from "@keywork-app/protocol";
import { idleControlsClient } from "./controls-store-testing.ts";
import { inertMemoryClient } from "./memory-store-testing.ts";
import { emptySurfacesClient } from "./surfaces-store-testing.ts";
import { inertWorkspaceClient } from "./trust-testing.ts";

export function fakeClient(overrides: Partial<ConsoleClient> = {}): ConsoleClient {
  const client: KeyworkClient = { ...inertClient(), ...overrides };
  return client as ConsoleClient;
}

function inertClient(): KeyworkClient {
  return {
    url: "http://127.0.0.1:4770",
    document: async () => ({ version: "0.0.1", operationIds: [] }),
    sessions: async () => [],
    session: async () => undefined,
    createSession: async () => {
      throw new Error("this fake serves no new sessions");
    },
    prompt: async () => "missing",
    abort: async () => "idle",
    events: async function* (): AsyncIterable<BusEnvelope> {
      await new Promise(() => undefined);
    },
    inject: async () => "started",
    entries: async () => undefined,
    fork: async () => "missing",
    labelEntry: async () => "missing",
    moveLeaf: async () => "missing",
    changes: async () => "missing",
    ...inertMemoryClient(),
    ...idleControlsClient(),
    sendNow: async () => "missing",
    moveQueued: async () => "missing",
    cancelQueued: async () => "missing",
    setQuiet: async () => "missing",
    spill: async () => "missing",
    ...emptySurfacesClient(),
    ...inertWorkspaceClient(),
    changedFile: async () => "missing",
    hunkVerdicts: async () => "missing",
    recordHunkVerdict: async () => "missing",
    removeSession: async () => "missing",
    listTrash: async () => [],
    restoreSession: async () => "missing",
    discardTrashedSession: async () => "missing",
    purgeTrash: async () => ({ purged: 0 }),
    asks: async () => [],
    routineNeeds: async () => [],
    answerAsk: async () => "settled",
    permissions: async () => ({ trusted: false, bundle: [], workspace: [], session: {} }),
    grantWorkspaceRule: async (rule) => ({ granted: rule }),
    grantSessionRule: async (_sessionId, rule) => ({ granted: rule }),
    revokeWorkspaceGrant: async (rule) => ({ revoked: rule }),
    revokeSessionGrant: async (_sessionId, rule) => ({ revoked: rule }),
    restoreTurn: async () => "missing",
    previewRestore: async () => "missing",
  };
}
