import type {
  AskConsent,
  ConsentCard,
  ConsentTimers,
  DisplayTarget,
  PathClass,
  PeerIdentity,
  SessionLogRow,
  SignalingListener,
  SignalingTransport,
  SignalMessage,
} from "@keywork-app/screen";
import type { SenderCommand, ViewerEvent } from "./channels.ts";
import type { ScreenHostSeams } from "./host.ts";
import type { IndicatorBanner } from "./sharer.ts";

export const viewerContents = 7;

export const keeperOnSpark: PeerIdentity = {
  node: { stableId: "nSparkStable1", name: "spark-ad4d" },
  user: { id: "u-keeper", loginName: "jordan@example.com", displayName: "Jordan" },
  tags: [],
};

export const primary: DisplayTarget = {
  id: "2528732444",
  sourceId: "screen:2528732444:0",
  label: "Primary",
  width: 2560,
  height: 1440,
  scaleFactor: 1,
  primary: true,
};

export const secondary: DisplayTarget = {
  id: "2779098405",
  sourceId: "screen:2779098405:0",
  label: "Side",
  width: 3840,
  height: 2160,
  scaleFactor: 1.5,
  primary: false,
};

export const tailnetLine =
  "candidate:1 1 udp 2122260223 100.101.102.103 47101 typ host generation 0";

export const lanLine = "candidate:2 1 udp 2122260223 192.168.1.20 47102 typ host generation 0";

export function memoryRelay(requester: PeerIdentity) {
  const sharerListeners = new Set<SignalingListener>();
  const viewerListeners = new Map<string, Set<SignalingListener>>();
  const traffic: SignalMessage[] = [];
  const blocked = new Set<SignalMessage["kind"]>();
  const later = (run: () => void) => queueMicrotask(run);

  const sharerSide: SignalingTransport = {
    send: async (message) => {
      traffic.push(message);
      later(() => {
        for (const listener of viewerListeners.get(message.sessionId) ?? [])
          listener.message(message);
      });
    },
    listen: (listener) => {
      sharerListeners.add(listener);
      return () => sharerListeners.delete(listener);
    },
  };

  const viewerSide = (sessionId: string): SignalingTransport => ({
    send: async (message) => {
      const stamped = message.kind === "request" ? { ...message, from: requester } : message;
      traffic.push(stamped);
      if (blocked.has(message.kind)) return;
      later(() => {
        for (const listener of sharerListeners) listener.message(stamped);
      });
    },
    listen: (listener) => {
      const set = viewerListeners.get(sessionId) ?? new Set();
      set.add(listener);
      viewerListeners.set(sessionId, set);
      return () => set.delete(listener);
    },
  });

  return { sharerSide, viewerSide, traffic, blocked };
}

export function manualTimers() {
  let now = Date.parse("2026-11-05T09:00:00.000Z");
  let nextHandle = 1;
  const pending = new Map<number, { at: number; run: () => void }>();
  const timers: ConsentTimers = {
    set: (run, ms) => {
      const handle = nextHandle++;
      pending.set(handle, { at: now + ms, run });
      return handle;
    },
    clear: (handle) => {
      pending.delete(handle as number);
    },
  };
  const advance = async (ms: number): Promise<void> => {
    const until = now + ms;
    for (;;) {
      const due = [...pending.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (due === undefined) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].run();
      await flush();
    }
    now = until;
    await flush();
  };
  return { timers, clock: { now: () => now }, advance };
}

export async function flush(): Promise<void> {
  for (let turn = 0; turn < 60; turn += 1) await Promise.resolve();
}

export async function settle(): Promise<void> {
  await flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flush();
}

export type ConsentScript = Array<number | "never">;

export function scriptedConsent(script: ConsentScript) {
  const cards: ConsentCard[] = [];
  const signals: AbortSignal[] = [];
  const ask: AskConsent = (card, signal) => {
    cards.push(card);
    signals.push(signal);
    const next = script.shift() ?? 1;
    return next === "never" ? new Promise(() => {}) : Promise.resolve(next);
  };
  return { ask, cards, signals };
}

export function fakeSeams(options: {
  consent: AskConsent;
  timers: ConsentTimers;
  clock: { now(): number };
  displays?: DisplayTarget[];
  path?: PathClass;
  requester?: PeerIdentity;
  access?: "granted" | "needs-onboarding";
}) {
  const relay = memoryRelay(options.requester ?? keeperOnSpark);
  const commands: Array<{ sessionId: string; command: SenderCommand }> = [];
  const opened: string[] = [];
  const closed: string[] = [];
  const shown: Array<{
    sessionId: string;
    display: string;
    banner: IndicatorBanner;
    stop: () => void;
    resume?: (() => void) | undefined;
  }> = [];
  const hidden: string[] = [];
  const armed: Array<() => void> = [];
  const disarmed: number[] = [];
  const rows: SessionLogRow[] = [];
  const events: ViewerEvent[] = [];
  const prepared: number[] = [];
  let displays = options.displays ?? [primary, secondary];
  let minted = 0;
  const seams: ScreenHostSeams = {
    clock: options.clock,
    timers: options.timers,
    mint: {
      id: (kind) => `${kind}-${String(++minted).padStart(4, "0")}`,
      token: () => `token-${String(minted).padStart(40, "0")}`,
    },
    consent: options.consent,
    displays: async () => displays,
    pathTo: async () => options.path ?? "direct",
    peerPath: async () => options.path ?? "direct",
    senders: {
      open: async (sessionId) => {
        opened.push(sessionId);
      },
      command: (sessionId, command) => {
        commands.push({ sessionId, command });
      },
      close: (sessionId) => {
        closed.push(sessionId);
      },
    },
    indicator: {
      show: (sessionId, display, banner, stop, resume) => {
        shown.push({ sessionId, display: display.id, banner, stop, resume });
      },
      hide: (sessionId) => {
        hidden.push(sessionId);
      },
    },
    killSwitch: {
      arm: (kill) => {
        armed.push(kill);
        return { chord: "CommandOrControl+Alt+Shift+X", registered: true };
      },
      disarm: () => {
        disarmed.push(disarmed.length + 1);
      },
    },
    log: {
      append: async (row) => {
        rows.push(row);
      },
      read: async () => rows,
    },
    screenAccess: () => options.access ?? "granted",
    inbound: relay.sharerSide,
    endpointFor: async (peer) =>
      peer === "nowhere"
        ? { ok: false, problem: `no signaling route to ${peer}` }
        : { ok: true, endpoint: { url: `memory://${peer}`, token: "pair-token" } },
    transport: () => relay.viewerSide(currentViewerSession()),
    sink: {
      prepare: (id) => {
        prepared.push(id);
      },
      send: (_id, event) => {
        events.push(event);
      },
    },
  };
  const currentViewerSession = (): string => `session-${String(minted).padStart(4, "0")}`;
  return {
    seams,
    relay,
    commands,
    opened,
    closed,
    shown,
    hidden,
    armed,
    disarmed,
    rows,
    events,
    prepared,
    setDisplays: (next: DisplayTarget[]) => {
      displays = next;
    },
  };
}
