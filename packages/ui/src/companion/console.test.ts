import { emptyProjection } from "@keywork-app/client";
import type { BotSummary, BusEnvelope, CreatureSummary, SessionRow } from "@keywork-app/protocol";
import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import type { NeedsYouItem } from "../shell/needs-you.ts";
import { askItem } from "../shell/needs-you-testing.ts";
import type { SessionStore } from "../shell/session-store.ts";
import { followCompanion } from "./console.ts";
import type { CompanionHost, CompanionPreferences, CompanionSnapshot } from "./port.ts";

const now = Date.parse("2026-11-06T06:23:10.000Z");

describe("the companion's porch, held to the needs-you queue", () => {
  it("lets go of an ask answered on another surface on the next event, bubble and badge together", async () => {
    const companion = companionFixture();
    await settled();
    companion.emit([gateAsk("c1")]);
    companion.setWaiting([
      askItem("c1", { sessionId: "conv", tool: "write", subject: "notes/first-light.md" }),
    ]);
    await settled();
    expect(companion.latest()).toMatchObject({ state: "porch", waiting: 1 });
    expect(companion.latest()?.needsYou?.callId).toBe("c1");

    companion.emit([gatePermission("c1")]);
    companion.setWaiting([]);
    companion.setRows([{ ...conversation, waiting: { asks: 1, tools: ["write"] } }]);
    await settled();
    expect(companion.latest()?.needsYou).toBeUndefined();
    expect(companion.latest()?.state).not.toBe("porch");
    expect(companion.latest()?.waiting).toBe(0);
    companion.dispose();
  });
});

const conversation: SessionRow = {
  id: "conv",
  title: "first light",
  createdAt: "2026-11-06T06:21:41.705Z",
  lastActivityAt: "2026-11-06T06:23:02.050Z",
  messageCount: 3,
  bot: "bea",
  working: true,
};

const bea: BotSummary = { name: "bea", sigil: "◆", source: "project", sessions: 1 };

const beaOnTheWire: CreatureSummary = {
  slug: "bea",
  name: "bea",
  sigil: "◆",
  created: "2026-11-01T09:00:00.000Z",
  skin: "kid",
  seed: 0,
  workshop: "host",
  models: { strong: "inherit", loop: "inherit", decide: "inherit", vision: "inherit" },
  conversation: "conv",
  threads: 0,
};

const offPreferences: CompanionPreferences = {
  version: 1,
  enabled: false,
  optInOffered: true,
  mode: "floating",
  hidden: false,
  still: false,
  quiet: false,
  onlyWhileBusy: false,
  size: 100,
  shortcut: null,
  motion: "system",
  positions: {},
};

function companionFixture() {
  return createRoot((dispose) => {
    const published: CompanionSnapshot[] = [];
    const listeners = new Set<(batch: readonly BusEnvelope[]) => void>();
    const [rows, setRows] = createSignal<readonly SessionRow[]>([conversation]);
    const [waiting, setWaiting] = createSignal<readonly NeedsYouItem[]>([]);
    const store = {
      state: {
        get summaries() {
          return rows();
        },
      },
      surfaces: { state: { bots: [bea] } },
      projection: () => emptyProjection,
      open: async () => undefined,
    } as unknown as SessionStore;
    followCompanion({
      host: quietHost((snapshot) => published.push(snapshot)),
      store,
      feed: {
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      currentSession: () => undefined,
      approveKey: () => "y",
      openSession: () => undefined,
      say: () => undefined,
      needsYou: waiting,
      creatures: async () => [beaOnTheWire],
      now: () => now,
    });
    return {
      latest: (): CompanionSnapshot | undefined => published.at(-1),
      emit: (batch: readonly BusEnvelope[]) => {
        for (const listener of listeners) listener(batch);
      },
      setRows,
      setWaiting,
      dispose,
    };
  });
}

function quietHost(publish: (snapshot: CompanionSnapshot) => void): CompanionHost {
  return {
    publish,
    preferences: async () => offPreferences,
    setPreferences: async () => offPreferences,
    presence: async () => ({ mode: "off", window: "none", reason: "companions are off" }),
    show: async () => undefined,
    hide: async () => undefined,
    onPresenceChanged: () => () => undefined,
    onAnswerRequested: () => () => undefined,
    onOpenRequested: () => () => undefined,
    onSettingsRequested: () => () => undefined,
    onSwitchRequested: () => () => undefined,
  };
}

function gateAsk(callId: string): BusEnvelope {
  return {
    id: 14,
    ts: "2026-11-06T06:23:05.000Z",
    sessionId: "conv",
    type: "gate.ask",
    payload: {
      ask: { tool: "write", callId, arguments: { path: "notes/first-light.md" }, rule: "default" },
    },
  } as BusEnvelope;
}

function gatePermission(callId: string): BusEnvelope {
  return {
    id: 15,
    ts: "2026-11-06T06:23:07.000Z",
    sessionId: "conv",
    type: "gate.permission",
    payload: {
      decision: { tool: "write", callId, verdict: "granted", gate: "user", asked: true },
    },
  } as BusEnvelope;
}

const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
